const { getReservations } = require('./_lib/airtable');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { phone, name } = req.method === 'POST' ? req.body : req.query;

    if (!phone && !name) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Please provide either phone number or customer name to search'
      });
    }

    // Get all reservations
    const result = await getReservations();

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Filter by phone or name
    const matchingReservations = result.data.records.filter(record => {
      const customerPhone = (record.fields['Customer Phone'] || '').toLowerCase();
      const customerName = (record.fields['Customer Name'] || '').toLowerCase();
      const searchPhone = (phone || '').toLowerCase();
      const searchName = (name || '').toLowerCase();

      const phoneMatch = searchPhone && customerPhone.includes(searchPhone);
      const nameMatch = searchName && customerName.includes(searchName);

      return phoneMatch || nameMatch;
    });

    if (matchingReservations.length === 0) {
      return res.status(200).json({
        success: false,
        found: false,
        message: 'No reservations found for that phone number or name',
        count: 0
      });
    }

    // Format reservation details
    const reservations = matchingReservations.map(record => ({
      reservation_id: record.fields['Reservation ID'],
      customer_name: record.fields['Customer Name'],
      date: record.fields['Date'],
      time: record.fields['Time'],
      party_size: record.fields['Party Size'],
      status: record.fields['Status'],
      special_requests: record.fields['Special Requests'] || 'None',
      airtable_id: record.id
    }));

    return res.status(200).json({
      success: true,
      found: true,
      count: reservations.length,
      reservations,
      message: `Found ${reservations.length} reservation(s)`
    });

  } catch (error) {
    console.error('Lookup reservation error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to search reservations at this time. Please call us directly.'
    });
  }
};
