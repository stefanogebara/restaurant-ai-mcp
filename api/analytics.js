const {
  getAllTables,
  getActiveServiceRecords
} = require('./_lib/airtable');

const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;
const SERVICE_RECORDS_TABLE_ID = process.env.SERVICE_RECORDS_TABLE_ID;

async function getAllReservations() {
  try {
    const url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + RESERVATIONS_TABLE_ID;
    const response = await axios.get(url, {
      headers: {
        Authorization: 'Bearer ' + AIRTABLE_API_KEY,
        ContentType: 'application/json'
      }
    });
    return { success: true, records: response.data.records };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: error.message };
  }
}

async function getAllServiceRecordsData() {
  try {
    const url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + SERVICE_RECORDS_TABLE_ID;
    const response = await axios.get(url, {
      headers: {
        Authorization: 'Bearer ' + AIRTABLE_API_KEY,
        ContentType: 'application/json'
      }
    });
    return { success: true, records: response.data.records };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: error.message };
  }
}

async function calculateAnalytics() {
  const results = await Promise.all([
    getAllReservations(),
    getAllServiceRecordsData(),
    getAllTables(),
    getActiveServiceRecords()
  ]);
  
  const reservationsResult = results[0];
  const serviceRecordsResult = results[1];
  const tablesResult = results[2];
  const activePartiesResult = results[3];

  if (!reservationsResult.success || !serviceRecordsResult.success || !tablesResult.success) {
    return { success: false, error: 'Failed to fetch analytics data' };
  }

  const reservations = reservationsResult.records || [];
  const serviceRecords = serviceRecordsResult.records || [];
  const tables = tablesResult.tables || [];
  const activeParties = activePartiesResult.service_records || [];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentReservations = reservations.filter(r => {
    const resDate = new Date(r.fields.Date || r.createdTime);
    return resDate >= thirtyDaysAgo;
  });

  const completedServiceRecords = serviceRecords.filter(r =>
    r.fields.Status === 'Completed' && r.fields['Departed At']
  );

  const totalReservations = recentReservations.length;
  const totalCompletedServices = completedServiceRecords.length;
  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
  const currentOccupancy = activeParties.reduce((sum, party) => sum + party.party_size, 0);

  let avgPartySize = 0;
  if (recentReservations.length > 0) {
    const total = recentReservations.reduce((sum, r) => sum + (r.fields['Party Size'] || 0), 0);
    avgPartySize = total / recentReservations.length;
  }

  const serviceDurations = completedServiceRecords
    .filter(r => r.fields['Seated At'] && r.fields['Departed At'])
    .map(r => {
      const seatedAt = new Date(r.fields['Seated At']);
      const departedAt = new Date(r.fields['Departed At']);
      return (departedAt - seatedAt) / 60000;
    });

  const avgServiceTime = serviceDurations.length > 0
    ? serviceDurations.reduce((sum, t) => sum + t, 0) / serviceDurations.length
    : 90;

  const statusCounts = {};
  recentReservations.forEach(r => {
    const status = r.fields.Status || 'pending';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const dayOfWeekCounts = {};
  recentReservations.forEach(r => {
    const date = new Date(r.fields.Date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1;
  });

  const timeSlotCounts = {};
  recentReservations.forEach(r => {
    const time = r.fields.Time || '';
    const hour = parseInt(time.split(':')[0]) || 0;
    let slot = 'Other';
    if (hour >= 11 && hour < 14) slot = 'Lunch (11AM-2PM)';
    else if (hour >= 17 && hour < 19) slot = 'Early Dinner (5PM-7PM)';
    else if (hour >= 19 && hour < 22) slot = 'Prime Dinner (7PM-10PM)';
    else if (hour >= 22) slot = 'Late Night (10PM+)';
    timeSlotCounts[slot] = (timeSlotCounts[slot] || 0) + 1;
  });

  const tableUtilization = tables.map(table => {
    const timesUsed = completedServiceRecords.filter(r => {
      const tableIds = r.fields['Table IDs'] || '';
      const tableArray = typeof tableIds === 'string' ? tableIds.split(',') : [];
      return tableArray.includes(table.table_number.toString());
    }).length;

    const rate = totalCompletedServices > 0 ? (timesUsed / totalCompletedServices * 100).toFixed(1) : 0;
    
    return {
      table_number: table.table_number,
      capacity: table.capacity,
      location: table.location,
      times_used: timesUsed,
      utilization_rate: rate
    };
  });

  const last7Days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - i));
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    last7Days.push({
      date: date.toISOString().split('T')[0],
      dayName: days[date.getDay()],
      reservations: 0,
      completed_services: 0
    });
  }

  recentReservations.forEach(r => {
    const resDate = new Date(r.fields.Date).toISOString().split('T')[0];
    const dayObj = last7Days.find(d => d.date === resDate);
    if (dayObj) dayObj.reservations++;
  });

  completedServiceRecords.forEach(r => {
    if (!r.fields['Departed At']) return;
    const depDate = new Date(r.fields['Departed At']).toISOString().split('T')[0];
    const dayObj = last7Days.find(d => d.date === depDate);
    if (dayObj) dayObj.completed_services++;
  });

  return {
    success: true,
    analytics: {
      overview: {
        total_reservations: totalReservations,
        total_completed_services: totalCompletedServices,
        avg_party_size: parseFloat(avgPartySize.toFixed(1)),
        avg_service_time_minutes: Math.round(avgServiceTime),
        total_capacity: totalCapacity,
        current_occupancy: currentOccupancy,
        current_occupancy_percentage: ((currentOccupancy / totalCapacity) * 100).toFixed(1)
      },
      reservations_by_status: statusCounts,
      reservations_by_day: dayOfWeekCounts,
      reservations_by_time_slot: timeSlotCounts,
      table_utilization: tableUtilization.sort((a, b) => b.times_used - a.times_used),
      daily_trend: last7Days
    }
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const result = await calculateAnalytics();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ success: false, error: 'Failed to calculate analytics' });
  }
};
