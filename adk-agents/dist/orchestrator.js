"use strict";
/**
 * Google ADK Multi-Agent Orchestrator
 *
 * Coordinates multiple specialized agents:
 * - Reservation Agent: Handles customer reservations
 * - Host Dashboard Agent: Manages floor operations
 * - Customer Service Agent: Resolves issues and answers questions
 *
 * Implements A2A (Agent-to-Agent) protocol for inter-agent communication
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLogger = exports.BaseAgent = exports.AgentOrchestrator = void 0;
const vertexai_1 = require("@google-cloud/vertexai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// ============================================================================
// CONFIGURATION
// ============================================================================
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const MODEL = 'gemini-2.0-flash-exp'; // or gemini-2.5-pro for advanced reasoning
// ============================================================================
// AGENT LOGGER (Observability)
// ============================================================================
class AgentLogger {
    logs = [];
    log(event) {
        const logEntry = {
            ...event,
            timestamp: new Date().toISOString(),
        };
        this.logs.push(logEntry);
        console.log('[Agent Log]', JSON.stringify(logEntry, null, 2));
        // In production, send to Cloud Logging, DataDog, etc.
    }
    getLogs() {
        return this.logs;
    }
    getAgentMetrics(agentName) {
        const agentLogs = this.logs.filter(log => log.agent === agentName);
        return {
            totalCalls: agentLogs.length,
            successRate: agentLogs.filter(log => log.outcome === 'success').length / agentLogs.length,
            averageResponseTime: agentLogs.reduce((sum, log) => sum + log.responseTime, 0) / agentLogs.length,
            toolUsage: this.getToolUsageStats(agentLogs),
        };
    }
    getToolUsageStats(logs) {
        const toolCounts = {};
        logs.forEach(log => {
            if (log.toolCalls) {
                log.toolCalls.forEach((tool) => {
                    toolCounts[tool] = (toolCounts[tool] || 0) + 1;
                });
            }
        });
        return toolCounts;
    }
}
exports.AgentLogger = AgentLogger;
// ============================================================================
// BASE AGENT CLASS
// ============================================================================
class BaseAgent {
    name;
    primeDirective;
    tools;
    vertexAI;
    logger;
    constructor(name, primeDirectivePath, tools, logger) {
        this.name = name;
        this.primeDirective = fs.readFileSync(primeDirectivePath, 'utf-8');
        this.tools = tools;
        this.logger = logger;
        this.vertexAI = new vertexai_1.VertexAI({
            project: PROJECT_ID,
            location: LOCATION,
        });
    }
    async callLLM(prompt, systemInstruction) {
        const model = this.vertexAI.preview.getGenerativeModel({
            model: MODEL,
            systemInstruction: systemInstruction || this.primeDirective,
        });
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error('No response from LLM');
        }
        return text;
    }
    getName() {
        return this.name;
    }
    getTools() {
        return this.tools;
    }
}
exports.BaseAgent = BaseAgent;
// ============================================================================
// SPECIALIZED AGENTS
// ============================================================================
class ReservationAgent extends BaseAgent {
    constructor(logger) {
        super('Reservation Agent', path.join(__dirname, 'prompts', 'reservation-agent.txt'), [
            'check_restaurant_availability',
            'create_reservation',
            'modify_reservation',
            'cancel_reservation',
            'lookup_reservation',
            'get_wait_time',
        ], logger);
    }
    async handleTask(task, context) {
        const startTime = Date.now();
        try {
            // In production, this would call the actual LLM with MCP tools
            // For now, simulating the agent logic
            const prompt = `
Task: ${task}
Context: ${JSON.stringify(context || {})}

Please handle this reservation-related task using your available tools.
Follow your prime directive and behavior guidelines.
      `;
            const response = await this.callLLM(prompt);
            const responseTime = Date.now() - startTime;
            this.logger.log({
                agent: this.name,
                action: 'handleTask',
                userIntent: task,
                toolCalls: this.extractToolCalls(response),
                outcome: 'success',
                responseTime,
            });
            return {
                agent: this.name,
                success: true,
                result: response,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.logger.log({
                agent: this.name,
                action: 'handleTask',
                userIntent: task,
                outcome: 'failure',
                responseTime,
                error: error.message,
            });
            return {
                agent: this.name,
                success: false,
                result: error.message,
            };
        }
    }
    extractToolCalls(response) {
        // Simple extraction - in production, parse structured output
        const tools = [];
        this.tools.forEach(tool => {
            if (response.includes(tool)) {
                tools.push(tool);
            }
        });
        return tools;
    }
}
class HostDashboardAgent extends BaseAgent {
    constructor(logger) {
        super('Host Dashboard Agent', path.join(__dirname, 'prompts', 'host-agent.txt'), [
            'get_host_dashboard_data',
            'seat_party',
            'complete_service',
            'mark_table_clean',
            'check_restaurant_availability',
            'lookup_reservation',
        ], logger);
    }
    async handleTask(task, context) {
        const startTime = Date.now();
        try {
            const prompt = `
Task: ${task}
Context: ${JSON.stringify(context || {})}

Please handle this host dashboard task using your available tools.
Follow your prime directive for efficient floor management.
      `;
            const response = await this.callLLM(prompt);
            const responseTime = Date.now() - startTime;
            this.logger.log({
                agent: this.name,
                action: 'handleTask',
                userIntent: task,
                toolCalls: this.extractToolCalls(response),
                outcome: 'success',
                responseTime,
            });
            return {
                agent: this.name,
                success: true,
                result: response,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.logger.log({
                agent: this.name,
                action: 'handleTask',
                userIntent: task,
                outcome: 'failure',
                responseTime,
                error: error.message,
            });
            return {
                agent: this.name,
                success: false,
                result: error.message,
            };
        }
    }
    extractToolCalls(response) {
        const tools = [];
        this.tools.forEach(tool => {
            if (response.includes(tool)) {
                tools.push(tool);
            }
        });
        return tools;
    }
}
class CustomerServiceAgent extends BaseAgent {
    constructor(logger) {
        super('Customer Service Agent', path.join(__dirname, 'prompts', 'customer-service-agent.txt'), [
            'lookup_reservation',
            'cancel_reservation',
            'modify_reservation',
        ], logger);
    }
    async handleTask(task, context) {
        const startTime = Date.now();
        try {
            const prompt = `
Task: ${task}
Context: ${JSON.stringify(context || {})}

Please handle this customer service request with empathy and professionalism.
Follow your prime directive to provide exceptional customer experience.
      `;
            const response = await this.callLLM(prompt);
            const responseTime = Date.now() - startTime;
            this.logger.log({
                agent: this.name,
                action: 'handleTask',
                userIntent: task,
                toolCalls: this.extractToolCalls(response),
                outcome: 'success',
                responseTime,
            });
            return {
                agent: this.name,
                success: true,
                result: response,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.logger.log({
                agent: this.name,
                action: 'handleTask',
                userIntent: task,
                outcome: 'failure',
                responseTime,
                error: error.message,
            });
            return {
                agent: this.name,
                success: false,
                result: error.message,
            };
        }
    }
    extractToolCalls(response) {
        const tools = [];
        this.tools.forEach(tool => {
            if (response.includes(tool)) {
                tools.push(tool);
            }
        });
        return tools;
    }
}
// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
class AgentOrchestrator {
    agents;
    logger;
    a2aMessageQueue = [];
    constructor() {
        this.logger = new AgentLogger();
        this.agents = new Map();
        // Initialize all agents
        this.agents.set('reservation', new ReservationAgent(this.logger));
        this.agents.set('host', new HostDashboardAgent(this.logger));
        this.agents.set('customer-service', new CustomerServiceAgent(this.logger));
        console.log('[Orchestrator] Initialized with agents:', Array.from(this.agents.keys()));
    }
    async routeTask(task, preferredAgent) {
        // Determine which agent should handle this task
        const agentName = preferredAgent || this.determineAgent(task);
        const agent = this.agents.get(agentName);
        if (!agent) {
            return {
                agent: 'orchestrator',
                success: false,
                result: `Unknown agent: ${agentName}`,
            };
        }
        console.log(`[Orchestrator] Routing task to ${agent.getName()}`);
        const response = await agent.handleTask(task);
        // Process any A2A messages generated
        if (response.messages) {
            await this.processA2AMessages(response.messages);
        }
        return response;
    }
    determineAgent(task) {
        const taskLower = task.toLowerCase();
        // Simple keyword matching - in production, use LLM-based routing
        if (taskLower.includes('reservation') || taskLower.includes('book') || taskLower.includes('cancel')) {
            return 'reservation';
        }
        else if (taskLower.includes('seat') || taskLower.includes('table') || taskLower.includes('walk-in')) {
            return 'host';
        }
        else if (taskLower.includes('complaint') || taskLower.includes('question') || taskLower.includes('help')) {
            return 'customer-service';
        }
        // Default to customer service for general queries
        return 'customer-service';
    }
    async processA2AMessages(messages) {
        for (const message of messages) {
            console.log('[A2A] Processing message:', message);
            const targetAgent = this.agents.get(message.to);
            if (targetAgent) {
                const response = await targetAgent.handleTask(message.task, message.context);
                console.log('[A2A] Response:', response);
            }
        }
    }
    getMetrics() {
        const metrics = {};
        this.agents.forEach((agent, name) => {
            metrics[name] = this.logger.getAgentMetrics(agent.getName());
        });
        return metrics;
    }
    getAllLogs() {
        return this.logger.getLogs();
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
// ============================================================================
// EXAMPLE USAGE
// ============================================================================
async function main() {
    const orchestrator = new AgentOrchestrator();
    // Example 1: Customer wants to make a reservation
    console.log('\n=== Example 1: Reservation Request ===');
    const result1 = await orchestrator.routeTask('I need a table for 4 this Saturday at 7pm');
    console.log('Result:', result1);
    // Example 2: Host needs to seat a walk-in
    console.log('\n=== Example 2: Walk-In Seating ===');
    const result2 = await orchestrator.routeTask('Seat party of 2 at table 5', 'host');
    console.log('Result:', result2);
    // Example 3: Customer service inquiry
    console.log('\n=== Example 3: Customer Service ===');
    const result3 = await orchestrator.routeTask('What is your cancellation policy?');
    console.log('Result:', result3);
    // View metrics
    console.log('\n=== Agent Metrics ===');
    console.log(JSON.stringify(orchestrator.getMetrics(), null, 2));
}
// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=orchestrator.js.map