const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;
const RESTAURANT_INFO_TABLE_ID = process.env.RESTAURANT_INFO_TABLE_ID;
const TABLES_TABLE_ID = process.env.TABLES_TABLE_ID || 'tblTables'; // Default for testing
const SERVICE_RECORDS_TABLE_ID = process.env.SERVICE_RECORDS_TABLE_ID || 'tblServiceRecords';

const airtableRequest = async (method, endpoint, data = null) => {
  try {
    const config = {
      method,
      url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    // Only include data for non-GET requests
    if (data !== null && method !== 'GET') {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Airtable request error:', error.response?.data || error.message);
    return {
      success: false,
      error: true,
      message: error.response?.data?.error?.message || 'Database connection error. Please call us directly.'
    };
  }
};

// ============ RESERVATIONS ============

const getReservations = async (filter = '') => {
  const filterQuery = filter ? `?filterByFormula=${encodeURIComponent(filter)}` : '';
  return airtableRequest('GET', `${RESERVATIONS_TABLE_ID}${filterQuery}`);
};

const getReservationById = async (reservationId) => {
  const filter = `{Reservation ID} = '${reservationId}'`;
  const result = await getReservations(filter);
  if (result.success && result.data.records && result.data.records.length > 0) {
    return { success: true, data: result.data.records[0] };
  }
  return { success: false, error: true, message: 'Reservation not found' };
};

const createReservation = async (fields) => {
  return airtableRequest('POST', RESERVATIONS_TABLE_ID, { fields });
};

const updateReservation = async (recordId, fields) => {
  return airtableRequest('PATCH', `${RESERVATIONS_TABLE_ID}/${recordId}`, { fields });
};

// ============ TABLES ============

const getTables = async (filter = '') => {
  const filterQuery = filter ? `?filterByFormula=${encodeURIComponent(filter)}` : '';
  return airtableRequest('GET', `${TABLES_TABLE_ID}${filterQuery}`);
};

const getAvailableTables = async () => {
  const filter = `AND({Status} = 'Available', {Is Active} = TRUE())`;
  return getTables(filter);
};

const getTableByNumber = async (tableNumber) => {
  const filter = `{Table Number} = '${tableNumber}'`;
  const result = await getTables(filter);
  if (result.success && result.data.records && result.data.records.length > 0) {
    return { success: true, data: result.data.records[0] };
  }
  return { success: false, error: true, message: `Table ${tableNumber} not found` };
};

const updateTable = async (recordId, fields) => {
  return airtableRequest('PATCH', `${TABLES_TABLE_ID}/${recordId}`, { fields });
};

const updateTableStatus = async (recordId, status) => {
  return updateTable(recordId, { Status: status });
};

// ============ SERVICE RECORDS ============

const getServiceRecords = async (filter = '') => {
  const filterQuery = filter ? `?filterByFormula=${encodeURIComponent(filter)}` : '';
  return airtableRequest('GET', `${SERVICE_RECORDS_TABLE_ID}${filterQuery}`);
};

const getActiveServiceRecords = async () => {
  const filter = `OR({Status} = 'Seated', {Status} = 'Eating', {Status} = 'Paying')`;
  return getServiceRecords(filter);
};

const createServiceRecord = async (fields) => {
  return airtableRequest('POST', SERVICE_RECORDS_TABLE_ID, { fields });
};

const updateServiceRecord = async (recordId, fields) => {
  return airtableRequest('PATCH', `${SERVICE_RECORDS_TABLE_ID}/${recordId}`, { fields });
};

const completeServiceRecord = async (recordId) => {
  return updateServiceRecord(recordId, {
    Status: 'Completed',
    'Actual Departure': new Date().toISOString()
  });
};

// ============ RESTAURANT INFO ============

const getRestaurantInfo = async () => {
  return airtableRequest('GET', RESTAURANT_INFO_TABLE_ID);
};

// ============ UTILITIES ============

const generateReservationId = () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RES-${dateStr}-${randomNum}`;
};

module.exports = {
  // Reservations
  getReservations,
  getReservationById,
  createReservation,
  updateReservation,

  // Tables
  getTables,
  getAvailableTables,
  getTableByNumber,
  updateTable,
  updateTableStatus,

  // Service Records
  getServiceRecords,
  getActiveServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  completeServiceRecord,

  // Restaurant Info
  getRestaurantInfo,

  // Utilities
  generateReservationId
};
