const { createReservation, generateReservationId } = require('./_lib/airtable');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const {
      date,
      time,
      party_size,
      customer_name,
      customer_phone,
      customer_email,
      special_requests
    } = req.method === 'POST' ? req.body : req.query;

    // Validate required fields
    if (!date || !time || !party_size || !customer_name || !customer_phone) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing required fields: date, time, party_size, customer_name, and customer_phone are required'
      });
    }

    // Generate reservation ID
    const reservationId = generateReservationId();

    // Create reservation in Airtable
    const fields = {
      'Reservation ID': reservationId,
      'Date': date,
      'Time': time,
      'Party Size': parseInt(party_size),
      'Customer Name': customer_name,
      'Customer Phone': customer_phone,
      'Customer Email': customer_email || '',
      'Special Requests': special_requests || '',
      'Status': 'Confirmed',
      'Created At': new Date().toISOString().split('T')[0],
      'Updated At': new Date().toISOString().split('T')[0],
      'Confirmation Sent': true,
      'Reminder Sent': false,
      'Notes': 'Created via AI Phone System'
    };

    const result = await createReservation(fields);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json({
      success: true,
      message: `Reservation confirmed for ${customer_name}, party of ${party_size} on ${date} at ${time}`,
      reservation_id: reservationId,
      confirmation: `Your reservation is confirmed. Confirmation number: ${reservationId}`
    });

  } catch (error) {
    console.error('Create reservation error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to create reservation at this time. Please call us directly.'
    });
  }
};
