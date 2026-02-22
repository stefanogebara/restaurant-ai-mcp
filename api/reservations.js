const {
  createReservation,
  generateReservationId,
  findReservation,
  updateReservation,
  cancelReservation: airtableCancelReservation,
  getReservations,
  supabaseAdmin
} = require('./_lib/supabase');

const {
  findOrCreateCustomer,
  updateCustomerHistory,
  getCustomerStats
} = require('./_lib/customer-history');

// Authentication
const { verifyAuth } = require('./_lib/auth');

// Use heuristic model for restaurant-specific predictions (more accurate than hotel-trained Lambda)
const { calculateRiskScore, getRecommendedIntervention } = require('./services/mlRiskScoring');
const { logReservationCreated, logCustomerCancelled } = require('./ml/data-logger');

// Twilio for SMS confirmations
const twilio = require('twilio');

// CORS utility for secure cross-origin requests
const { setWebhookCors, handlePreflight } = require('./_lib/cors');

// Subscription middleware for reservation limits
const { checkSubscription, checkReservationLimits } = require('./_lib/subscription-middleware');

// Rate limiting
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

// Usage tracking (fire-and-forget)
const { trackUsage } = require('./_lib/usage-tracking');

// Timezone conversions
const { getLocalDate } = require('./_lib/timezone');

// Secure structured logging
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('Reservations');

// Guest memory (fire-and-forget memory creation from booking requests)
const { createMemory } = require('./services/guestMemory');

// WhatsApp confirmation for customers
const { isWhatsAppConfigured, sendReservationConfirmation } = require('./_lib/whatsapp-sender');

// ============================================================================
// SMS CONFIRMATION HELPER
// ============================================================================
async function sendReservationConfirmationSMS(customerPhone, reservationDetails) {
  const { reservationId, customerName, partySize, date, time } = reservationDetails;

  // Skip if Twilio not configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    logger.info('Twilio not configured, skipping SMS confirmation');
    return { success: false, reason: 'twilio_not_configured' };
  }

  // Validate phone number (basic check)
  if (!customerPhone || customerPhone.length < 10) {
    logger.info('Invalid phone number, skipping SMS', { phone: customerPhone });
    return { success: false, reason: 'invalid_phone' };
  }

  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Format phone number (ensure it starts with +)
    let formattedPhone = customerPhone.replace(/\D/g, ''); // Remove non-digits
    if (!formattedPhone.startsWith('+')) {
      // Assume US number if no country code
      if (formattedPhone.length === 10) {
        formattedPhone = '+1' + formattedPhone;
      } else if (!formattedPhone.startsWith('1') && formattedPhone.length === 11) {
        formattedPhone = '+' + formattedPhone;
      } else {
        formattedPhone = '+' + formattedPhone;
      }
    }

    const message = await twilioClient.messages.create({
      body: `Chez Ambiance: ${customerName}, ${partySize}p on ${date} at ${time}. Conf# ${reservationId}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    logger.info(`SMS confirmation sent to ${formattedPhone}`, { messageSid: message.sid });
    return { success: true, messageSid: message.sid };
  } catch (error) {
    logger.error('Error sending SMS confirmation', error);
    return { success: false, reason: error.message };
  }
}

module.exports = async (req, res) => {
  // Use webhook CORS since this is called by ElevenLabs and client
  setWebhookCors(req, res);

  if (handlePreflight(req, res)) {
    return;
  }

  // Apply rate limiting (20 reservations per hour per IP)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'reservation');
  if (rateLimited) return; // 429 response already sent

  // ============================================================================
  // AUTHENTICATION & MULTI-TENANCY
  // ============================================================================
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ message: auth.error });
  }
  const restaurantId = auth.user.restaurant_id;
  const timezone = auth.user.timezone || 'UTC';
  if (!restaurantId) {
    return res.status(403).json({
      message: 'No restaurant associated with your account. Please complete onboarding first.'
    });
  }

  req.user = auth.user;

  const { action } = req.query;

  try {
    switch (action) {
      case 'create':
        return await handleCreate(req, res, restaurantId, timezone);
      case 'lookup':
        return await handleLookup(req, res, restaurantId);
      case 'list':
        return await handleList(req, res, restaurantId);
      case 'modify':
        return await handleModify(req, res, restaurantId);
      case 'cancel':
        return await handleCancel(req, res, restaurantId);
      default:
        return res.status(400).json({
          message: 'Invalid action requested. Please specify whether you want to create, lookup, list, modify, or cancel a reservation.'
        });
    }
  } catch (error) {
    logger.error('Reservation error', error);
    return res.status(500).json({
      message: 'I apologize, but something went wrong processing your request. Please try again or contact the restaurant directly.'
    });
  }
};

async function handleCreate(req, res, restaurantId, timezone) {
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

  // ============================================================================
  // SUBSCRIPTION LIMIT CHECK (For dashboard-created reservations)
  // ============================================================================
  // Check reservation limits if restaurant subscription email is provided
  // Webhook calls (from ElevenLabs) won't have this, so limits won't apply to AI-created reservations
  const restaurantEmail = req.headers?.['x-restaurant-email'] || req.headers?.['x-customer-email'];
  if (restaurantEmail) {
    try {
      // Check subscription status
      let subscriptionChecked = false;
      await checkSubscription(req, res, () => { subscriptionChecked = true; });
      if (!subscriptionChecked) return; // Subscription check failed, response already sent

      // Check reservation limits (Basic plan: 50/month)
      let limitsOk = false;
      await checkReservationLimits(req, res, () => { limitsOk = true; });
      if (!limitsOk) return; // Limit exceeded, response already sent
    } catch (error) {
      // Log but don't fail if subscription check errors
      logger.error('Error checking subscription limits', error);
    }
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
    'Status': 'confirmed',
    'Created At': getLocalDate(timezone),
    'Updated At': getLocalDate(timezone),
    'Confirmation Sent': true,
    'Reminder Sent': false,
    'Notes': 'Created via AI Phone System'
  };

  const result = await createReservation(restaurantId, fields);

  if (!result.success) {
    return res.status(500).json({
      message: 'I apologize, but I encountered an issue creating your reservation. Please try again or call us directly at the restaurant.'
    });
  }

  // Track usage for metered billing
  trackUsage(restaurantId, 'reservation_created');

  // Track overage if reservation exceeds plan limit
  if (req.isOverage) {
    const overageMetric = req.overagePlan === 'starter'
      ? 'reservation_overage_starter'
      : 'reservation_overage_growth';
    trackUsage(restaurantId, overageMetric);
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
      logger.info(`Customer found/created: ${customer.id}`);

      // Update customer statistics (increment total reservations)
      await updateCustomerHistory(customer.id, fields, 'created');

      logger.info(`Updated customer ${customer.id} statistics`);

      // Link reservation to customer record
      if (result.data && result.data.id) {
        await updateReservation(restaurantId, result.data.id, {
          'Customer History': [customer.id]
        });
        logger.info(`Linked reservation ${result.data.id} to customer ${customer.id}`);
      }
    }
  } catch (error) {
    // Don't fail the reservation if customer tracking fails
    logger.error('Error tracking customer', error);
  }

  // ============================================================================
  // ML PREDICTION - NO-SHOW RISK SCORING (Heuristic Model)
  // ============================================================================
  try {
    logger.info('Starting no-show prediction with heuristic model');

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
      created_at: new Date().toISOString()
    };

    // Get no-show prediction using heuristic model (restaurant-specific)
    const riskData = await calculateRiskScore(reservationForPrediction);

    // Map to expected format for compatibility
    const prediction = {
      noShowProbability: riskData.riskScore / 100, // Convert 0-100 to 0-1
      noShowRisk: riskData.riskLevel, // low, medium, high, very-high
      confidence: riskData.confidence,
      factors: riskData.factors,
      metadata: { modelVersion: riskData.modelVersion }
    };

    logger.info('ML Prediction result', {
      riskScore: riskData.riskScore,
      riskLevel: riskData.riskLevel,
      confidence: riskData.confidence,
      factors: riskData.factors.map(f => f.description)
    });

    // Update reservation with ML predictions
    if (result.data && result.data.id && prediction) {
      const mlFields = {
        'ML Risk Score': riskData.riskScore, // Already 0-100
        'ML Risk Level': riskData.riskLevel, // low, medium, high, very-high
        'ML Confidence': riskData.confidence, // Already percentage
        'ML Model Version': riskData.modelVersion
      };

      await updateReservation(restaurantId, result.data.id, mlFields);
      logger.info('Updated reservation with ML predictions');

      // Log to training dataset for future model retraining
      const reservationWithId = {
        ...reservationForPrediction,
        reservation_id: result.data.fields['Reservation ID'],
        created_at: reservationForPrediction.created_at
      };
      await logReservationCreated(reservationWithId, prediction, customerHistory);
    }

    // ============================================================================
    // CREATE INTERVENTION RECORD (For ROI Tracking)
    // ============================================================================
    // Create intervention for medium, high, or very-high risk reservations
    const interventionRiskLevels = ['medium', 'high', 'very-high'];
    if (prediction && interventionRiskLevels.includes(prediction.noShowRisk)) {
      try {
        // Map medium to high for intervention type (confirmation call)
        const mappedRiskLevel = prediction.noShowRisk === 'medium' ? 'high' : prediction.noShowRisk;

        // Get intervention recommendation
        const riskScore = riskData.riskScore;
        const recommendedIntervention = await getRecommendedIntervention(mappedRiskLevel, riskScore);

        logger.info(`Intervention recommended`, { risk: prediction.noShowRisk, riskScore, intervention: recommendedIntervention?.type || 'none' });

        // Create intervention record in ml_interventions table
        if (recommendedIntervention) {
          const { data: intervention, error: interventionError } = await supabaseAdmin
            .from('ml_interventions')
            .insert({
              reservation_id: reservationId,
              ml_risk_score: riskScore,
              ml_risk_level: prediction.noShowRisk,
              intervention_type: recommendedIntervention.type,
              cost_of_intervention: recommendedIntervention.estimatedCost,
              value_saved: recommendedIntervention.estimatedValue, // Column is value_saved, not estimated_value
              action_taken: false
            })
            .select()
            .single();

          if (interventionError) {
            logger.error('Error creating intervention record', interventionError);
          } else {
            logger.info(`Created intervention for reservation`, {
              interventionId: intervention.intervention_id,
              reservationId,
              type: intervention.intervention_type,
              riskLevel: intervention.ml_risk_level,
              riskScore: intervention.ml_risk_score,
              estimatedROI: Math.round((intervention.value_saved / intervention.cost_of_intervention) * 100)
            });
          }
        }
      } catch (error) {
        logger.error('Error processing intervention', error);
      }
    }
  } catch (error) {
    // Don't fail the reservation if ML prediction fails
    logger.error('Error predicting no-show risk', error);
  }

  // ============================================================================
  // SMS CONFIRMATION (Send reservation details to customer)
  // ============================================================================
  try {
    const smsResult = await sendReservationConfirmationSMS(customer_phone, {
      reservationId,
      customerName: customer_name,
      partySize: party_size,
      date,
      time
    });

    if (smsResult.success) {
      logger.info(`SMS confirmation sent for ${reservationId}`);
    } else {
      logger.info(`SMS not sent for ${reservationId}`, { reason: smsResult.reason });
    }
  } catch (error) {
    // Don't fail the reservation if SMS fails
    logger.error('Error sending SMS confirmation', error);
  }

  // ============================================================================
  // WHATSAPP CONFIRMATION (fire-and-forget, non-fatal)
  // ============================================================================
  try {
    const { data: config, error: configErr } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('whatsapp_enabled, restaurant_name, agent_language')
      .eq('restaurant_id', restaurantId)
      .single();

    if (!configErr && config && config.whatsapp_enabled && isWhatsAppConfigured()) {
      sendReservationConfirmation(customer_phone, {
        customerName: customer_name,
        restaurantName: config.restaurant_name,
        language: config.agent_language || 'en',
        reservationId,
        date,
        time,
        partySize: party_size
      }).catch(err => logger.warn('WhatsApp confirmation failed (non-fatal):', err.message));
    }
  } catch (error) {
    logger.warn('Error fetching WhatsApp config (non-fatal)', error.message);
  }

  // ============================================================================
  // GUEST MEMORY - Store booking observations (fire-and-forget)
  // ============================================================================
  try {
    if (customer_phone && restaurantId) {
      // Always log the booking as an observation
      createMemory(restaurantId, customer_phone, {
        content: `Booked a table for ${party_size} on ${date} at ${time}`,
        memoryType: 'observation',
        importance: 4,
        sourceType: 'booking_portal',
        sourceId: reservationId
      }).catch(err => logger.warn('Memory creation failed (non-fatal):', err.message));

      // Store special requests as a preference memory
      if (special_requests) {
        createMemory(restaurantId, customer_phone, {
          content: `Booking request: ${special_requests}`,
          memoryType: 'preference',
          importance: 6,
          sourceType: 'booking_portal',
          sourceId: reservationId
        }).catch(err => logger.warn('Memory creation failed (non-fatal):', err.message));
      }
    }
  } catch (memErr) {
    logger.warn('Guest memory error (non-fatal):', memErr.message);
  }

  return res.status(200).json({
    message: `Perfect! Your reservation is confirmed for ${customer_name}, party of ${party_size}, on ${date} at ${time}. Your confirmation number is ${reservationId}. We've sent you a text message with the details. We look forward to seeing you!`
  });
}

async function handleLookup(req, res, restaurantId) {
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

  const result = await findReservation(restaurantId, {
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
    success: true,
    reservation: r,
    message: `I found your reservation! ${r.customer_name}, party of ${r.party_size}, scheduled for ${r.reservation_time}. Confirmation number: ${r.reservation_id}. Status: ${r.status}.${specialReqs}`
  });
}

async function handleList(req, res, restaurantId) {
  const { limit = 5, sort = 'created_at_desc' } = req.query;

  try {
    // Fetch all reservations sorted by created date (most recent first)
    const result = await getReservations(restaurantId);

    if (!result.success || !result.data || !result.data.records) {
      return res.status(200).json({
        reservations: [],
        total: 0
      });
    }

    // Convert Airtable records to simplified format
    const reservations = result.data.records
      .map(record => ({
        reservation_id: record.fields['Reservation ID'],
        customer_name: record.fields['Customer Name'],
        customer_phone: record.fields['Customer Phone'],
        customer_email: record.fields['Customer Email'] || '',
        party_size: record.fields['Party Size'],
        date: record.fields['Date'],
        time: record.fields['Time'],
        special_requests: record.fields['Special Requests'] || '',
        status: record.fields['Status'] || 'Confirmed',
        created_at: record.fields['Created At'] || record.createdTime
      }))
      // Sort by created date (most recent first)
      .sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return sort === 'created_at_desc' ? dateB - dateA : dateA - dateB;
      })
      // Limit results
      .slice(0, parseInt(limit));

    return res.status(200).json({
      reservations,
      total: result.data.records.length
    });
  } catch (error) {
    logger.error('Error listing reservations', error);
    return res.status(500).json({
      message: 'Error fetching reservations',
      reservations: [],
      total: 0
    });
  }
}

async function handleModify(req, res, restaurantId) {
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

  const timezone = req.user.timezone || 'UTC';
  const updateFields = {
    'Updated At': getLocalDate(timezone)
  };

  if (date) updateFields['Date'] = date;
  if (time) updateFields['Time'] = time;
  if (party_size) updateFields['Party Size'] = parseInt(party_size);
  if (special_requests !== undefined) updateFields['Special Requests'] = special_requests;

  const result = await updateReservation(restaurantId, reservation_id, updateFields);

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

async function handleCancel(req, res, restaurantId) {
  const { reservation_id } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id) {
    return res.status(400).json({
      message: 'I need your confirmation number to cancel your reservation.'
    });
  }

  const result = await airtableCancelReservation(restaurantId, reservation_id);

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
