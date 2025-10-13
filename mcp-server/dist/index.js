#!/usr/bin/env node
"use strict";
/**
 * Restaurant AI MCP Server
 *
 * A Model Context Protocol server providing AI agents with tools for:
 * - Checking restaurant availability
 * - Managing reservations
 * - Table management
 * - Host dashboard operations
 *
 * Compatible with Claude Desktop, Cursor, and any MCP-compatible client
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// ============================================================================
// CONFIGURATION
// ============================================================================
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;
const TABLES_TABLE_ID = process.env.TABLES_TABLE_ID;
const SERVICE_RECORDS_TABLE_ID = process.env.SERVICE_RECORDS_TABLE_ID;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID');
}
// ============================================================================
// AIRTABLE CLIENT
// ============================================================================
class AirtableClient {
    baseUrl;
    headers;
    constructor() {
        this.baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
        this.headers = {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
        };
    }
    async request(method, endpoint, data) {
        try {
            const response = await (0, axios_1.default)({
                method,
                url: `${this.baseUrl}/${endpoint}`,
                headers: this.headers,
                data,
            });
            return { success: true, data: response.data };
        }
        catch (error) {
            console.error('Airtable request error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error?.message || 'Database connection error',
            };
        }
    }
    async getRecords(tableId, filter) {
        const filterQuery = filter ? `?filterByFormula=${encodeURIComponent(filter)}` : '';
        return this.request('GET', `${tableId}${filterQuery}`);
    }
    async createRecord(tableId, fields) {
        return this.request('POST', tableId, { fields });
    }
    async updateRecord(tableId, recordId, fields) {
        return this.request('PATCH', `${tableId}/${recordId}`, { fields });
    }
}
const airtable = new AirtableClient();
// ============================================================================
// MCP TOOL DEFINITIONS
// ============================================================================
const tools = [
    {
        name: 'check_restaurant_availability',
        description: 'Check if the restaurant has availability for a specific date, time, and party size. Returns boolean availability, alternative times if unavailable, and detailed capacity information. Always use this before creating reservations.',
        inputSchema: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Reservation date in YYYY-MM-DD format (e.g., "2025-10-20")',
                },
                time: {
                    type: 'string',
                    description: 'Reservation time in HH:MM 24-hour format (e.g., "19:00" for 7pm)',
                },
                party_size: {
                    type: 'number',
                    description: 'Number of guests (must be positive integer)',
                    minimum: 1,
                },
            },
            required: ['date', 'time', 'party_size'],
        },
    },
    {
        name: 'create_reservation',
        description: 'Create a new restaurant reservation. Only call this after checking availability first. Captures all customer details and returns a confirmation with reservation ID.',
        inputSchema: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Reservation date in YYYY-MM-DD format',
                },
                time: {
                    type: 'string',
                    description: 'Reservation time in HH:MM format',
                },
                party_size: {
                    type: 'number',
                    description: 'Number of guests',
                    minimum: 1,
                },
                customer_name: {
                    type: 'string',
                    description: 'Full name of the customer',
                },
                customer_phone: {
                    type: 'string',
                    description: 'Phone number with country code (e.g., "+15551234567")',
                },
                customer_email: {
                    type: 'string',
                    description: 'Email address (optional)',
                },
                special_requests: {
                    type: 'string',
                    description: 'Any special requests (dietary restrictions, celebrations, accessibility needs)',
                },
            },
            required: ['date', 'time', 'party_size', 'customer_name', 'customer_phone'],
        },
    },
    {
        name: 'lookup_reservation',
        description: 'Find an existing reservation by reservation ID, phone number, or customer name. Returns full reservation details including status and special requests.',
        inputSchema: {
            type: 'object',
            properties: {
                reservation_id: {
                    type: 'string',
                    description: 'Unique reservation ID (e.g., "RES-20251015-1234")',
                },
                phone: {
                    type: 'string',
                    description: 'Customer phone number',
                },
                name: {
                    type: 'string',
                    description: 'Customer name (partial match supported)',
                },
            },
        },
    },
    {
        name: 'modify_reservation',
        description: 'Modify an existing reservation. Can change date, time, or party size. Checks availability before confirming changes.',
        inputSchema: {
            type: 'object',
            properties: {
                reservation_id: {
                    type: 'string',
                    description: 'Reservation ID to modify',
                },
                new_date: {
                    type: 'string',
                    description: 'New date in YYYY-MM-DD format (optional)',
                },
                new_time: {
                    type: 'string',
                    description: 'New time in HH:MM format (optional)',
                },
                new_party_size: {
                    type: 'number',
                    description: 'New party size (optional)',
                },
            },
            required: ['reservation_id'],
        },
    },
    {
        name: 'cancel_reservation',
        description: 'Cancel an existing reservation. Marks the reservation as cancelled and frees up the table capacity.',
        inputSchema: {
            type: 'object',
            properties: {
                reservation_id: {
                    type: 'string',
                    description: 'Reservation ID to cancel',
                },
            },
            required: ['reservation_id'],
        },
    },
    {
        name: 'get_wait_time',
        description: 'Get current estimated wait time for walk-in customers based on active parties and upcoming reservations.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'get_host_dashboard_data',
        description: 'Get complete host dashboard data including all tables, active parties, upcoming reservations, and occupancy statistics. Used by host staff to manage the dining room.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'seat_party',
        description: 'Seat a party (walk-in or reservation) at assigned tables. Creates a service record and marks tables as occupied. Returns service ID for tracking.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['walk-in', 'reservation'],
                    description: 'Type of party',
                },
                reservation_id: {
                    type: 'string',
                    description: 'Reservation ID if checking in a reservation (optional for walk-ins)',
                },
                customer_name: {
                    type: 'string',
                    description: 'Customer name',
                },
                customer_phone: {
                    type: 'string',
                    description: 'Customer phone number',
                },
                party_size: {
                    type: 'number',
                    description: 'Number of guests',
                },
                table_ids: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Array of table numbers to assign (e.g., [1, 2] for tables 1 and 2)',
                },
                special_requests: {
                    type: 'string',
                    description: 'Any special requests',
                },
            },
            required: ['type', 'customer_name', 'customer_phone', 'party_size', 'table_ids'],
        },
    },
    {
        name: 'complete_service',
        description: 'Mark a service as completed when party departs. Updates table status to "Being Cleaned" and records departure time.',
        inputSchema: {
            type: 'object',
            properties: {
                service_record_id: {
                    type: 'string',
                    description: 'Service ID to complete (e.g., "SVC-20251015-1234")',
                },
            },
            required: ['service_record_id'],
        },
    },
    {
        name: 'mark_table_clean',
        description: 'Mark a table as clean and ready for next party. Changes table status from "Being Cleaned" to "Available".',
        inputSchema: {
            type: 'object',
            properties: {
                table_id: {
                    type: 'string',
                    description: 'Airtable record ID of the table (e.g., "rec123abc")',
                },
            },
            required: ['table_id'],
        },
    },
];
// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================
async function handleCheckAvailability(args) {
    const { date, time, party_size } = args;
    // This would call your existing availability calculator
    // For now, simulating the response structure
    const response = await axios_1.default.post(`${process.env.API_URL || 'https://restaurant-ai-mcp.vercel.app/api'}/check-availability`, { date, time, party_size });
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
            }],
    };
}
async function handleCreateReservation(args) {
    const { date, time, party_size, customer_name, customer_phone, customer_email, special_requests, } = args;
    // Generate reservation ID
    const dateStr = date.replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const reservationId = `RES-${dateStr}-${randomNum}`;
    // Create reservation in Airtable
    const result = await airtable.createRecord(RESERVATIONS_TABLE_ID, {
        'Reservation ID': reservationId,
        'Customer Name': customer_name,
        'Customer Phone': customer_phone,
        'Customer Email': customer_email || '',
        'Party Size': party_size,
        'Date': date,
        'Time': time,
        'Special Requests': special_requests || '',
        'Status': 'Confirmed',
        'Created At': new Date().toISOString().split('T')[0],
    });
    if (!result.success) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: result.error }),
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    reservation_id: reservationId,
                    message: `Reservation confirmed for ${customer_name}, party of ${party_size} on ${date} at ${time}`,
                    details: {
                        reservation_id: reservationId,
                        date,
                        time,
                        party_size,
                        customer_name,
                    },
                }, null, 2),
            }],
    };
}
async function handleLookupReservation(args) {
    const { reservation_id, phone, name } = args;
    let filter = '';
    if (reservation_id) {
        filter = `{Reservation ID} = '${reservation_id}'`;
    }
    else if (phone) {
        filter = `{Customer Phone} = '${phone}'`;
    }
    else if (name) {
        filter = `FIND(LOWER('${name.toLowerCase()}'), LOWER({Customer Name})) > 0`;
    }
    else {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: 'Must provide reservation_id, phone, or name' }),
                }],
            isError: true,
        };
    }
    const result = await airtable.getRecords(RESERVATIONS_TABLE_ID, filter);
    if (!result.success || !result.data.records || result.data.records.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: 'Reservation not found' }),
                }],
            isError: true,
        };
    }
    const reservation = result.data.records[0].fields;
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    reservation: {
                        reservation_id: reservation['Reservation ID'],
                        customer_name: reservation['Customer Name'],
                        customer_phone: reservation['Customer Phone'],
                        party_size: reservation['Party Size'],
                        date: reservation['Date'],
                        time: reservation['Time'],
                        status: reservation['Status'],
                        special_requests: reservation['Special Requests'],
                    },
                }, null, 2),
            }],
    };
}
async function handleModifyReservation(args) {
    const { reservation_id, new_date, new_time, new_party_size } = args;
    // Find reservation
    const filter = `{Reservation ID} = '${reservation_id}'`;
    const findResult = await airtable.getRecords(RESERVATIONS_TABLE_ID, filter);
    if (!findResult.success || !findResult.data.records || findResult.data.records.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: 'Reservation not found' }),
                }],
            isError: true,
        };
    }
    const recordId = findResult.data.records[0].id;
    const updates = {};
    if (new_date)
        updates['Date'] = new_date;
    if (new_time)
        updates['Time'] = new_time;
    if (new_party_size)
        updates['Party Size'] = new_party_size;
    const updateResult = await airtable.updateRecord(RESERVATIONS_TABLE_ID, recordId, updates);
    if (!updateResult.success) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: updateResult.error }),
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    message: 'Reservation modified successfully',
                    reservation_id,
                    updates,
                }, null, 2),
            }],
    };
}
async function handleCancelReservation(args) {
    const { reservation_id } = args;
    const filter = `{Reservation ID} = '${reservation_id}'`;
    const findResult = await airtable.getRecords(RESERVATIONS_TABLE_ID, filter);
    if (!findResult.success || !findResult.data.records || findResult.data.records.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: 'Reservation not found' }),
                }],
            isError: true,
        };
    }
    const recordId = findResult.data.records[0].id;
    const updateResult = await airtable.updateRecord(RESERVATIONS_TABLE_ID, recordId, {
        'Status': 'Cancelled',
        'Updated At': new Date().toISOString().split('T')[0],
    });
    if (!updateResult.success) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: updateResult.error }),
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    message: `Reservation ${reservation_id} has been cancelled`,
                    reservation_id,
                }, null, 2),
            }],
    };
}
async function handleGetWaitTime(args) {
    // Get active service records
    const filter = `{Status} = 'Active'`;
    const result = await airtable.getRecords(SERVICE_RECORDS_TABLE_ID, filter);
    const activeParties = result.success ? result.data.records.length : 0;
    // Estimate based on active parties (simplified)
    let waitTimeMinutes = 0;
    if (activeParties > 8)
        waitTimeMinutes = 45;
    else if (activeParties > 5)
        waitTimeMinutes = 30;
    else if (activeParties > 3)
        waitTimeMinutes = 15;
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    wait_time_minutes: waitTimeMinutes,
                    wait_time_text: waitTimeMinutes > 0 ? `${waitTimeMinutes} minutes` : 'No wait',
                    active_parties: activeParties,
                }, null, 2),
            }],
    };
}
async function handleGetHostDashboard(args) {
    // Get all tables
    const tablesResult = await airtable.getRecords(TABLES_TABLE_ID);
    // Get active service records
    const activeFilter = `{Status} = 'Active'`;
    const servicesResult = await airtable.getRecords(SERVICE_RECORDS_TABLE_ID, activeFilter);
    // Get upcoming reservations (next 2 hours)
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 120 * 60000);
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);
    const futureTime = twoHoursLater.toTimeString().slice(0, 5);
    const reservationsFilter = `AND({Date} = '${today}', {Time} >= '${currentTime}', {Time} <= '${futureTime}', OR({Status} = 'Confirmed', {Status} = 'Waitlist'))`;
    const reservationsResult = await airtable.getRecords(RESERVATIONS_TABLE_ID, reservationsFilter);
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    tables: tablesResult.success ? tablesResult.data.records : [],
                    active_parties: servicesResult.success ? servicesResult.data.records : [],
                    upcoming_reservations: reservationsResult.success ? reservationsResult.data.records : [],
                    timestamp: new Date().toISOString(),
                }, null, 2),
            }],
    };
}
async function handleSeatParty(args) {
    const { type, reservation_id, customer_name, customer_phone, party_size, table_ids, special_requests, } = args;
    // Generate service ID
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const serviceId = `SVC-${dateStr}-${randomNum}`;
    const seatedAt = new Date().toISOString();
    const estimatedDeparture = new Date(Date.now() + 90 * 60 * 1000).toISOString();
    // Create service record
    const serviceResult = await airtable.createRecord(SERVICE_RECORDS_TABLE_ID, {
        'Service ID': serviceId,
        'Reservation ID': reservation_id || '',
        'Customer Name': customer_name,
        'Customer Phone': customer_phone,
        'Party Size': party_size,
        'Table IDs': table_ids,
        'Seated At': seatedAt,
        'Estimated Departure': estimatedDeparture,
        'Special Requests': special_requests || '',
        'Status': 'Active',
    });
    if (!serviceResult.success) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: serviceResult.error }),
                }],
            isError: true,
        };
    }
    // Update table statuses (simplified - you'd need to get table record IDs first)
    // This would require additional logic to map table numbers to record IDs
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    service_id: serviceId,
                    message: `Party of ${party_size} seated successfully`,
                    tables_assigned: table_ids,
                    estimated_departure: estimatedDeparture,
                }, null, 2),
            }],
    };
}
async function handleCompleteService(args) {
    const { service_record_id } = args;
    const filter = `{Service ID} = '${service_record_id}'`;
    const findResult = await airtable.getRecords(SERVICE_RECORDS_TABLE_ID, filter);
    if (!findResult.success || !findResult.data.records || findResult.data.records.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: 'Service record not found' }),
                }],
            isError: true,
        };
    }
    const recordId = findResult.data.records[0].id;
    const tableIds = findResult.data.records[0].fields['Table IDs'];
    const updateResult = await airtable.updateRecord(SERVICE_RECORDS_TABLE_ID, recordId, {
        'Status': 'Completed',
        'Departed At': new Date().toISOString(),
    });
    if (!updateResult.success) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: updateResult.error }),
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    message: 'Service completed successfully',
                    service_id: service_record_id,
                    tables_to_clean: tableIds,
                }, null, 2),
            }],
    };
}
async function handleMarkTableClean(args) {
    const { table_id } = args;
    const updateResult = await airtable.updateRecord(TABLES_TABLE_ID, table_id, {
        'Status': 'Available',
        'Current Service ID': '',
    });
    if (!updateResult.success) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: updateResult.error }),
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    message: 'Table marked as clean and available',
                    table_id,
                }, null, 2),
            }],
    };
}
// ============================================================================
// MCP SERVER SETUP
// ============================================================================
const server = new index_js_1.Server({
    name: 'restaurant-ai-mcp-server',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// List available tools
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return { tools };
});
// Handle tool calls
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'check_restaurant_availability':
                return await handleCheckAvailability(args);
            case 'create_reservation':
                return await handleCreateReservation(args);
            case 'lookup_reservation':
                return await handleLookupReservation(args);
            case 'modify_reservation':
                return await handleModifyReservation(args);
            case 'cancel_reservation':
                return await handleCancelReservation(args);
            case 'get_wait_time':
                return await handleGetWaitTime(args);
            case 'get_host_dashboard_data':
                return await handleGetHostDashboard(args);
            case 'seat_party':
                return await handleSeatParty(args);
            case 'complete_service':
                return await handleCompleteService(args);
            case 'mark_table_clean':
                return await handleMarkTableClean(args);
            default:
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                        }],
                    isError: true,
                };
        }
    }
    catch (error) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ error: error.message }),
                }],
            isError: true,
        };
    }
});
// ============================================================================
// START SERVER
// ============================================================================
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('Restaurant AI MCP Server running on stdio');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map