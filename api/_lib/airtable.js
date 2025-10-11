const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;
const RESTAURANT_INFO_TABLE_ID = process.env.RESTAURANT_INFO_TABLE_ID;

const airtableRequest = async (method, endpoint, data = null) => {
  try {
    const response = await axios({
      method,
      url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data
    });
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

const getReservations = async (filter = '') => {
  const filterQuery = filter ? `?filterByFormula=${encodeURIComponent(filter)}` : '';
  return airtableRequest('GET', `${RESERVATIONS_TABLE_ID}${filterQuery}`);
};

const createReservation = async (fields) => {
  return airtableRequest('POST', RESERVATIONS_TABLE_ID, { fields });
};

const updateReservation = async (recordId, fields) => {
  return airtableRequest('PATCH', `${RESERVATIONS_TABLE_ID}/${recordId}`, { fields });
};

const getRestaurantInfo = async () => {
  return airtableRequest('GET', RESTAURANT_INFO_TABLE_ID);
};

const generateReservationId = () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RES-${dateStr}-${randomNum}`;
};

module.exports = {
  getReservations,
  createReservation,
  updateReservation,
  getRestaurantInfo,
  generateReservationId
};
