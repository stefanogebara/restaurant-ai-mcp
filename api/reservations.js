const {
  createReservation,
  generateReservationId,
  findReservation,
  updateReservation,
  cancelReservation: airtableCancelReservation
} = require('./_lib/airtable');

const {
  findOrCreateCustomer,
  updateCustomerHistory,
  getCustomerStats
} = require('./_lib/customer-history');

const { predictNoShow } = require('./ml/predict');
const { logReservationCreated, logCustomerCancelled } = require('./ml/data-logger');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
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
          message: 'Invalid action requested. Please specify whether you want to create, lookup, modify, or cancel a reservation.'
        });
    }
  } catch (error) {
    console.error('Reservation error:', error);
    return res.status(500).json({
      message: 'I apologize, but something went wrong processing your request. Please try again or contact the restaurant directly.'
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
      message: 'I need a few more details to complete your reservation. Please provide the date, time, party size, your name, and phone number.'
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
    return res.status(500).json({
      message: 'I apologize, but I encountered an issue creating your reservation. Please try again or call us directly at the restaurant.'
    });
  }

  // ============================================================================
  // CUSTOMER HISTORY TRACKING (ML Foundation)
  // ============================================================================
  try {
    // Find or create customer in Customer History table
    const customer = await findOrCreateCustomer(
      customer_email,
      customer_phone,
      customer_name
    );

    if (customer) {
      console.log(`[CustomerTracking] Customer found/created: ${customer.id}`);

      // Update customer statistics (increment total reservations)
      await updateCustomerHistory(customer.id, fields, 'created');

      console.log(`[CustomerTracking] Updated customer ${customer.id} statistics`);

      // Link reservation to customer record
      if (result.data && result.data.id) {
        await updateReservation(result.data.id, {
          'Customer History': [customer.id]
        });
        console.log(`[CustomerTracking] Linked reservation ${result.data.id} to customer ${customer.id}`);
      }
    }
  } catch (error) {
    // Don't fail the reservation if customer tracking fails
    console.error('[CustomerTracking] Error tracking customer:', error);
  }

  // ============================================================================
  // ML PREDICTION - NO-SHOW RISK SCORING (Day 13)
  // ============================================================================
  try {
    console.log('[MLPrediction] Starting no-show prediction...');

    // Get customer history for feature extraction
    const customerHistory = await getCustomerStats(customer_email, customer_phone);

    // Create reservation object for prediction
    const reservationForPrediction = {
      reservation_id: reservationId,
      date: date,
      time: time,
      party_size: parseInt(party_size),
      customer_name: customer_name,
      customer_phone: customer_phone,
      customer_email: customer_email || '',
      special_requests: special_requests || '',
      booking_created_at: new Date().toISOString(),
      is_special_occasion: false, // TODO: Extract from special_requests
      confirmation_sent_at: new Date().toISOString(),
      confirmation_clicked: false
    };

    // Get no-show prediction
    const prediction = await predictNoShow(reservationForPrediction, customerHistory);

    console.log('[MLPrediction] Prediction result:', {
      probability: prediction.probability,
      riskLevel: prediction.riskLevel,
      confidence: prediction.confidence
    });

    // Update reservation with ML predictions
    if (result.data && result.data.id && prediction) {
      const mlFields = {
        'ML Risk Score': Math.round(prediction.noShowProbability * 100), // Store as percentage (0-100)
        'ML Risk Level': prediction.noShowRisk, // low, medium, high, very-high
        'ML Confidence': Math.round(prediction.confidence * 100), // Store as percentage
        'ML Model Version': prediction.metadata?.modelVersion || '1.0.0'
      };

      await updateReservation(result.data.id, mlFields);
      console.log('[MLPrediction] Updated reservation with ML predictions');

      // Log to training dataset for future model retraining
      const reservationWithId = {
        ...reservationForPrediction,
        reservation_id: result.data.fields['Reservation ID'],
        created_at: reservationForPrediction.booking_created_at
      };
      await logReservationCreated(reservationWithId, prediction, customerHistory);
    }
  } catch (error) {
    // Don't fail the reservation if ML prediction fails
    console.error('[MLPrediction] Error predicting no-show risk:', error);
  }

  return res.status(200).json({
    message: `Perfect! Your reservation is confirmed for ${customer_name}, party of ${party_size}, on ${date} at ${time}. We look forward to seeing you!`
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
      message: 'To look up your reservation, I need either your confirmation number, phone number, or name.'
    });
  }

  const result = await findReservation({
    reservation_id,
    customer_phone,
    customer_name
  });

  if (!result.success) {
    return res.status(404).json({
      message: 'I couldn\'t find a reservation with that information. Could you double-check the details and try again?'
    });
  }

  const r = result.reservation;
  const specialReqs = r.special_requests ? ` Special requests: ${r.special_requests}.` : '';
  return res.status(200).json({
    message: `I found your reservation! ${r.customer_name}, party of ${r.party_size}, scheduled for ${r.reservation_time}. Confirmation number: ${r.reservation_id}. Status: ${r.status}.${specialReqs}`
  });
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
      message: 'I need your confirmation number to modify your reservation.'
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
    return res.status(500).json({
      message: 'I couldn\'t update your reservation. Please try again or call us directly.'
    });
  }

  const changes = [];
  if (date) changes.push(`date to ${date}`);
  if (time) changes.push(`time to ${time}`);
  if (party_size) changes.push(`party size to ${party_size}`);
  if (special_requests !== undefined) changes.push('special requests');

  const changesList = changes.length > 0 ? ` I've updated your ${changes.join(', ')}.` : '';
  return res.status(200).json({
    message: `Your reservation has been successfully modified!${changesList} Your confirmation number is still ${reservation_id}.`
  });
}

async function handleCancel(req, res) {
  const { reservation_id } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id) {
    return res.status(400).json({
      message: 'I need your confirmation number to cancel your reservation.'
    });
  }

  const result = await airtableCancelReservation(reservation_id);

  if (!result.success) {
    return res.status(500).json({
      message: 'I couldn\'t cancel your reservation. Please try again or call us directly.'
    });
  }

  // Log cancellation for ML training data
  await logCustomerCancelled(reservation_id);

  return res.status(200).json({
    message: `Your reservation has been cancelled. We're sorry we won't see you this time, but we hope you'll visit us in the future!`
  });
}
