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
    return res.status(200).send('OK');
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
        return res.status(400).send('Invalid action requested. Please specify whether you want to create, lookup, modify, or cancel a reservation.');
    }
  } catch (error) {
    console.error('Reservation error:', error);
    return res.status(500).send('I apologize, but something went wrong processing your request. Please try again or contact the restaurant directly.');
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
    return res.status(400).send('I need a few more details to complete your reservation. Please provide the date, time, party size, your name, and phone number.');
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
    return res.status(500).send('I apologize, but I encountered an issue creating your reservation. Please try again or call us directly at the restaurant.');
  }

  return res.status(200).send(`Perfect! Your reservation is confirmed for ${customer_name}, party of ${party_size}, on ${date} at ${time}. Your confirmation number is ${reservationId}. We look forward to seeing you!`);
}

async function handleLookup(req, res) {
  const {
    reservation_id,
    customer_phone,
    customer_name
  } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id && !customer_phone && !customer_name) {
    return res.status(400).send('To look up your reservation, I need either your confirmation number, phone number, or name.');
  }

  const result = await findReservation({
    reservation_id,
    customer_phone,
    customer_name
  });

  if (!result.success) {
    return res.status(404).send('I couldn\'t find a reservation with that information. Could you double-check the details and try again?');
  }

  const r = result.reservation;
  const specialReqs = r.special_requests ? ` Special requests: ${r.special_requests}.` : '';
  return res.status(200).send(`I found your reservation! ${r.customer_name}, party of ${r.party_size}, scheduled for ${r.reservation_time}. Confirmation number: ${r.reservation_id}. Status: ${r.status}.${specialReqs}`);
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
    return res.status(400).send('I need your confirmation number to modify your reservation.');
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
    return res.status(500).send('I couldn\'t update your reservation. Please try again or call us directly.');
  }

  const changes = [];
  if (date) changes.push(`date to ${date}`);
  if (time) changes.push(`time to ${time}`);
  if (party_size) changes.push(`party size to ${party_size}`);
  if (special_requests !== undefined) changes.push('special requests');

  const changesList = changes.length > 0 ? ` I've updated your ${changes.join(', ')}.` : '';
  return res.status(200).send(`Your reservation has been successfully modified!${changesList} Your confirmation number is still ${reservation_id}.`);
}

async function handleCancel(req, res) {
  const { reservation_id } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id) {
    return res.status(400).send('I need your confirmation number to cancel your reservation.');
  }

  const result = await airtableCancelReservation(reservation_id);

  if (!result.success) {
    return res.status(500).send('I couldn\'t cancel your reservation. Please try again or call us directly.');
  }

  return res.status(200).send(`Your reservation ${reservation_id} has been cancelled. We're sorry we won't see you this time, but we hope you'll visit us in the future!`);
}
