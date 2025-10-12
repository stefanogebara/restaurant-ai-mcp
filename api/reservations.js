const {
  createReservation,
  generateReservationId,
  findReservation,
  updateReservation,
  cancelReservation: airtableCancelReservation
} = require('./_lib/airtable');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'create':
        return await handleCreate(req, res);
      case 'lookup':
        return await handleLookup(req, res);
      case 'modify':
        return await handleModify(req, res);
      case 'cancel':
        return await handleCancel(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: create, lookup, modify, or cancel'
        });
    }
  } catch (error) {
    console.error('Reservation error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'An error occurred processing your request'
    });
  }
};

async function handleCreate(req, res) {
  const {
    date,
    time,
    party_size,
    customer_name,
    customer_phone,
    customer_email,
    special_requests
  } = req.method === 'POST' ? req.body : req.query;

  if (!date || !time || !party_size || !customer_name || !customer_phone) {
    return res.status(400).json({
      success: false,
      error: true,
      message: 'Missing required fields: date, time, party_size, customer_name, and customer_phone are required'
    });
  }

  const reservationId = generateReservationId();

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
}

async function handleLookup(req, res) {
  const {
    reservation_id,
    customer_phone,
    customer_name
  } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id && !customer_phone && !customer_name) {
    return res.status(400).json({
      success: false,
      error: true,
      message: 'Please provide either a reservation ID, phone number, or customer name'
    });
  }

  const result = await findReservation({
    reservation_id,
    customer_phone,
    customer_name
  });

  return res.status(200).json(result);
}

async function handleModify(req, res) {
  const {
    reservation_id,
    date,
    time,
    party_size,
    special_requests
  } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: true,
      message: 'Reservation ID is required'
    });
  }

  const updateFields = {
    'Updated At': new Date().toISOString().split('T')[0]
  };

  if (date) updateFields['Date'] = date;
  if (time) updateFields['Time'] = time;
  if (party_size) updateFields['Party Size'] = parseInt(party_size);
  if (special_requests !== undefined) updateFields['Special Requests'] = special_requests;

  const result = await updateReservation(reservation_id, updateFields);

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.status(200).json({
    success: true,
    message: 'Reservation updated successfully',
    reservation: result.reservation
  });
}

async function handleCancel(req, res) {
  const { reservation_id } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: true,
      message: 'Reservation ID is required'
    });
  }

  const result = await airtableCancelReservation(reservation_id);

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.status(200).json({
    success: true,
    message: `Reservation ${reservation_id} has been cancelled`,
    reservation: result.reservation
  });
}
