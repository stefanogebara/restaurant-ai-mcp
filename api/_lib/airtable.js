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
  const filter = `{Status} = 'Active'`;
  const result = await getServiceRecords(filter);

  if (!result.success) {
    return result;
  }

  const service_records = (result.data.records || []).map(r => ({
    service_id: r.fields['Service ID'],
    reservation_id: r.fields['Reservation ID'] || '',
    customer_name: r.fields['Customer Name'],
    customer_phone: r.fields['Customer Phone'],
    party_size: r.fields['Party Size'],
    table_ids: r.fields['Table IDs'] || [],
    seated_at: r.fields['Seated At'],
    estimated_departure: r.fields['Estimated Departure'],
    special_requests: r.fields['Special Requests'] || '',
    status: r.fields.Status,
    record_id: r.id
  }));

  return {
    success: true,
    service_records
  };
};

const createServiceRecord = async (fields) => {
  return airtableRequest('POST', SERVICE_RECORDS_TABLE_ID, { fields });
};

const updateServiceRecord = async (serviceId, fields) => {
  // Find the service record by service ID
  const filter = `{Service ID} = '${serviceId}'`;
  const findResult = await getServiceRecords(filter);

  if (!findResult.success || !findResult.data.records || findResult.data.records.length === 0) {
    return {
      success: false,
      error: true,
      message: 'Service record not found'
    };
  }

  const record = findResult.data.records[0];
  const updateResult = await airtableRequest('PATCH', `${SERVICE_RECORDS_TABLE_ID}/${record.id}`, { fields });

  if (!updateResult.success) {
    return updateResult;
  }

  return {
    success: true,
    service_record: {
      service_id: record.fields['Service ID'],
      table_ids: record.fields['Table IDs'] || [],
      status: fields.Status || record.fields.Status
    }
  };
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

const generateServiceId = () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `SVC-${dateStr}-${randomNum}`;
};

// ============ RESERVATION HELPERS ============

const findReservation = async ({ reservation_id, customer_phone, customer_name }) => {
  let filter = '';

  if (reservation_id) {
    filter = `{Reservation ID} = '${reservation_id}'`;
  } else if (customer_phone) {
    filter = `{Customer Phone} = '${customer_phone}'`;
  } else if (customer_name) {
    filter = `FIND(LOWER('${customer_name.toLowerCase()}'), LOWER({Customer Name})) > 0`;
  }

  const result = await getReservations(filter);

  if (result.success && result.data.records && result.data.records.length > 0) {
    const reservation = result.data.records[0];
    return {
      success: true,
      reservation: {
        reservation_id: reservation.fields['Reservation ID'],
        customer_name: reservation.fields['Customer Name'],
        customer_phone: reservation.fields['Customer Phone'],
        customer_email: reservation.fields['Customer Email'] || '',
        party_size: reservation.fields['Party Size'],
        reservation_time: `${reservation.fields.Date} ${reservation.fields.Time}`,
        special_requests: reservation.fields['Special Requests'] || '',
        status: reservation.fields.Status,
        record_id: reservation.id
      }
    };
  }

  return {
    success: false,
    error: true,
    message: 'Reservation not found'
  };
};

const cancelReservation = async (reservationId) => {
  const result = await findReservation({ reservation_id: reservationId });

  if (!result.success) {
    return result;
  }

  const updateResult = await updateReservation(result.reservation.record_id, {
    'Status': 'Cancelled',
    'Updated At': new Date().toISOString().split('T')[0]
  });

  if (!updateResult.success) {
    return updateResult;
  }

  return {
    success: true,
    message: `Reservation ${reservationId} has been cancelled`,
    reservation: result.reservation
  };
};

const getUpcomingReservations = async () => {
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 120 * 60000);

  const today = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().slice(0, 5);
  const futureTime = twoHoursFromNow.toTimeString().slice(0, 5);

  const filter = `AND(
    {Date} = '${today}',
    {Time} >= '${currentTime}',
    {Time} <= '${futureTime}',
    OR({Status} = 'Confirmed', {Status} = 'Waitlist')
  )`;

  const result = await getReservations(filter);

  if (!result.success) {
    return result;
  }

  const reservations = (result.data.records || []).map(r => ({
    reservation_id: r.fields['Reservation ID'],
    customer_name: r.fields['Customer Name'],
    customer_phone: r.fields['Customer Phone'],
    party_size: r.fields['Party Size'],
    reservation_time: `${r.fields.Date} ${r.fields.Time}`,
    special_requests: r.fields['Special Requests'] || '',
    checked_in: !!r.fields['Checked In At'],
    checked_in_at: r.fields['Checked In At'] || null,
    record_id: r.id
  }));

  return {
    success: true,
    reservations
  };
};

// ============ TABLE HELPERS ============

const getAllTables = async () => {
  const result = await getTables();

  if (!result.success) {
    return result;
  }

  const allTables = result.data.records || [];
  const activeTables = allTables.filter(t => t.fields['Is Active']);

  const tables = activeTables.map(t => ({
    id: t.id,
    table_number: t.fields['Table Number'],
    capacity: t.fields.Capacity,
    location: t.fields.Location || 'Main',
    status: t.fields.Status || 'Available',
    current_service_id: t.fields['Current Service ID'] || null
  }));

  return {
    success: true,
    tables
  };
};

const findBestTableCombination = (availableTables, partySize) => {
  const recommendations = [];

  // Try single table first
  for (const table of availableTables) {
    if (table.capacity >= partySize) {
      const waste = table.capacity - partySize;
      let matchQuality = 'perfect';
      if (waste === 0) matchQuality = 'perfect';
      else if (waste <= 1) matchQuality = 'good';
      else if (waste <= 2) matchQuality = 'acceptable';
      else matchQuality = 'waste';

      recommendations.push({
        tables: [table.table_number],
        total_capacity: table.capacity,
        match_quality: matchQuality,
        score: waste === 0 ? 100 : Math.max(0, 100 - waste * 10),
        reason: waste === 0
          ? `Perfect fit for ${partySize}`
          : `Table seats ${table.capacity}, wastes ${waste} seat${waste > 1 ? 's' : ''}`
      });
    }
  }

  // Try combinations of 2 tables
  for (let i = 0; i < availableTables.length; i++) {
    for (let j = i + 1; j < availableTables.length; j++) {
      const totalCapacity = availableTables[i].capacity + availableTables[j].capacity;
      if (totalCapacity >= partySize) {
        const waste = totalCapacity - partySize;
        let matchQuality = 'acceptable';
        if (waste <= 1) matchQuality = 'good';
        if (waste === 0) matchQuality = 'perfect';

        recommendations.push({
          tables: [availableTables[i].table_number, availableTables[j].table_number],
          total_capacity: totalCapacity,
          match_quality: matchQuality,
          score: waste === 0 ? 95 : Math.max(0, 95 - waste * 10),
          reason: `Combination seats ${totalCapacity}, wastes ${waste} seat${waste > 1 ? 's' : ''}`
        });
      }
    }
  }

  // Sort by score
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations;
};

module.exports = {
  // Reservations
  getReservations,
  getReservationById,
  createReservation,
  updateReservation,
  findReservation,
  cancelReservation,
  getUpcomingReservations,

  // Tables
  getTables,
  getAllTables,
  getAvailableTables,
  getTableByNumber,
  updateTable,
  updateTableStatus,
  findBestTableCombination,

  // Service Records
  getServiceRecords,
  getActiveServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  completeServiceRecord,

  // Restaurant Info
  getRestaurantInfo,

  // Utilities
  generateReservationId,
  generateServiceId
};
