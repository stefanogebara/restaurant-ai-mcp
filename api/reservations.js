const {
  createReservation,
  generateReservationId,
  findReservation,
  updateReservation,
  cancelReservation: airtableCancelReservation,
  getReservations,
  supabaseAdmin
} = require('./_lib/supabase');

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
const { checkAndApplyRateLimit, rejectOversizedBody } = require('./_lib/rate-limit');

// Usage tracking (fire-and-forget)
const { trackUsage } = require('./_lib/usage-tracking');

// Timezone conversions
const { getLocalDate } = require('./_lib/timezone');

// Secure structured logging
const { createSecureLogger } = require('./_lib/secure-logger');
const { initSentry, captureException } = require('./_lib/sentry');
initSentry();
const logger = createSecureLogger('Reservations');

// Guest memory (fire-and-forget memory creation from booking requests)
const { createMemory } = require('./services/guestMemory');

// WhatsApp confirmation for customers
const { isWhatsAppConfigured, sendReservationConfirmation } = require('./_lib/whatsapp-sender');

// Email notifications
const { sendReservationModificationEmail, sendReservationConfirmationEmail, sendReservationCancellationEmail } = require('./_lib/email');

// Reservation validation (business hours, holidays, party size limits)
const { validateReservation: validateReservationRules } = require('./_lib/reservation-validator');

// Input sanitization
const { sanitizeStringXSS } = require('./_lib/validation');

// ============================================================================
// SMS CONFIRMATION HELPER
// ============================================================================
async function sendReservationConfirmationSMS(customerPhone, reservationDetails) {
  const { reservationId, customerName, partySize, date, time, restaurantName } = reservationDetails;

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
      body: `${restaurantName || 'Seatable'}: ${customerName}, ${partySize}p on ${date} at ${time}. Conf# ${reservationId}`,
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

  // Reject oversized payloads (> 1 MB)
  if (rejectOversizedBody(req, res)) return;

  // Apply rate limiting (20 reservations per hour per IP)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'reservation');
  if (rateLimited) return; // 429 response already sent

  // ============================================================================
  // AUTHENTICATION & MULTI-TENANCY
  // ============================================================================
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ success: false, error: auth.error });
  }
  const restaurantId = auth.user.restaurant_id;
  const timezone = auth.user.timezone || 'UTC';
  if (!restaurantId) {
    return res.status(403).json({
      success: false,
      error: 'No restaurant associated with your account. Please complete onboarding first.'
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
          success: false,
          error: 'Invalid action requested. Please specify whether you want to create, lookup, list, modify, or cancel a reservation.'
        });
    }
  } catch (error) {
    logger.error('Reservation error', error);
    captureException(error, { method: req.method, url: req.url, action: req.query?.action });
    return res.status(500).json({
      success: false,
      error: 'I apologize, but something went wrong processing your request. Please try again or contact the restaurant directly.'
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
    special_requests,
    source
  } = req.method === 'POST' ? req.body : req.query;

  if (!date || !time || !party_size || !customer_name || !customer_phone) {
    return res.status(400).json({
      success: false,
      error: 'I need a few more details to complete your reservation. Please provide the date, time, party size, your name, and phone number.'
    });
  }

  // Validate phone number: at least 10 digits after stripping non-numeric chars
  const phoneDigits = String(customer_phone).replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return res.status(400).json({
      success: false,
      error: 'The phone number provided is invalid. Please provide a number with at least 10 digits.'
    });
  }

  // ============================================================================
  // SANITIZE CUSTOMER NAME (XSS prevention + max length)
  // ============================================================================
  const sanitizedName = sanitizeStringXSS(customer_name, { maxLength: 200 });

  // ============================================================================
  // BUSINESS HOURS VALIDATION
  // ============================================================================
  try {
    const { data: restConfig } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('business_hours, reservation_settings, timezone')
      .eq('restaurant_id', restaurantId)
      .single();

    if (restConfig) {
      const validation = validateReservationRules(
        { date, time, party_size },
        {
          business_hours: restConfig.business_hours,
          timezone: restConfig.timezone,
          max_party_size: restConfig.reservation_settings?.max_party_size,
          max_advance_days: restConfig.reservation_settings?.advance_booking_days,
        }
      );

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.message
        });
      }
    }
  } catch (err) {
    // Log but don't block reservation if config fetch fails
    logger.warn('Could not validate business hours (non-fatal):', err.message);
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
    'Customer Name': sanitizedName,
    'Customer Phone': customer_phone,
    'Customer Email': customer_email || '',
    'Special Requests': special_requests || '',
    'Status': 'confirmed',
    'Created At': getLocalDate(timezone),
    'Updated At': getLocalDate(timezone),
    'Confirmation Sent': true,
    'Reminder Sent': false,
    'Notes': source === 'dashboard' ? 'Created from dashboard' : 'Created via AI Phone System'
  };

  const result = await createReservation(restaurantId, fields);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: 'I apologize, but I encountered an issue creating your reservation. Please try again or call us directly at the restaurant.'
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
  // ML PREDICTION - NO-SHOW RISK SCORING (Heuristic Model)
  // ============================================================================
  try {
    logger.info('Starting no-show prediction with heuristic model');

    // Create reservation object for prediction
    const reservationForPrediction = {
      reservation_id: reservationId,
      date: date,
      time: time,
      party_size: parseInt(party_size),
      customer_name: sanitizedName,
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
      await logReservationCreated(reservationWithId, prediction, null);
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
  // FETCH RESTAURANT CONFIG (used by both SMS and WhatsApp below)
  // ============================================================================
  let restaurantConfig = null;
  try {
    const { data: config } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('whatsapp_enabled, restaurant_name, agent_language')
      .eq('restaurant_id', restaurantId)
      .single();
    restaurantConfig = config;
  } catch (error) {
    logger.warn('Error fetching restaurant config for notifications (non-fatal)', error.message);
  }

  // ============================================================================
  // SMS CONFIRMATION (Send reservation details to customer)
  // ============================================================================
  try {
    const smsResult = await sendReservationConfirmationSMS(customer_phone, {
      reservationId,
      customerName: sanitizedName,
      partySize: party_size,
      date,
      time,
      restaurantName: restaurantConfig?.restaurant_name
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
  if (restaurantConfig?.whatsapp_enabled && isWhatsAppConfigured()) {
    sendReservationConfirmation(customer_phone, {
      customerName: sanitizedName,
      restaurantName: restaurantConfig.restaurant_name,
      language: restaurantConfig.agent_language || 'en',
      reservationId,
      date,
      time,
      partySize: party_size
    }).catch(err => logger.warn('WhatsApp confirmation failed (non-fatal):', err.message));
  }

  // ============================================================================
  // EMAIL CONFIRMATION (fire-and-forget, non-fatal)
  // ============================================================================
  if (customer_email) {
    sendReservationConfirmationEmail({
      customerEmail: customer_email,
      customerName: sanitizedName,
      restaurantName: restaurantConfig?.restaurant_name || 'Your Restaurant',
      reservationId,
      partySize: parseInt(party_size),
      date,
      time,
      specialRequests: special_requests,
      language: restaurantConfig?.language || 'en',
    }).catch(err => logger.warn('Confirmation email failed (non-fatal):', err.message));
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
    success: true,
    message: `Perfect! Your reservation is confirmed for ${sanitizedName}, party of ${party_size}, on ${date} at ${time}. Your confirmation number is ${reservationId}. We've sent you a text message with the details. We look forward to seeing you!`,
    notification_sent: !!customer_email,
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
      success: false,
      error: 'To look up your reservation, I need either your confirmation number, phone number, or name.'
    });
  }

  const result = await findReservation(restaurantId, {
    reservation_id,
    customer_phone,
    customer_name
  });

  if (!result.success) {
    return res.status(404).json({
      success: false,
      error: 'I couldn\'t find a reservation with that information. Could you double-check the details and try again?'
    });
  }

  const r = result.reservation;
  const specialReqs = r.special_requests ? ` Special requests: ${r.special_requests}.` : '';
  return res.status(200).json({
    success: true,
    reservation: r,
    message: `I found your reservation! ${r.customer_name}, party of ${r.party_size}, scheduled for ${r.reservation_time}. Confirmation number: ${r.reservation_id}. Status: ${r.status}.${specialReqs}`,
  });
}

async function handleList(req, res, restaurantId) {
  const { limit = 5, sort = 'created_at_desc' } = req.query;

  try {
    // Fetch all reservations sorted by created date (most recent first)
    const result = await getReservations(restaurantId);

    if (!result.success || !result.data || !result.data.records) {
      return res.status(200).json({
        success: true,
        reservations: [],
        total: 0,
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
      success: true,
      reservations,
      total: result.data.records.length,
    });
  } catch (error) {
    logger.error('Error listing reservations', error);
    return res.status(500).json({
      success: false,
      error: 'Error fetching reservations',
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
      success: false,
      error: 'I need your confirmation number to modify your reservation.'
    });
  }

  // Find existing reservation to get customer details for notification
  const findResult = await findReservation(restaurantId, { reservation_id });
  const existingReservation = findResult.success ? findResult.reservation : null;

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
      success: false,
      error: 'I couldn\'t update your reservation. Please try again or call us directly.'
    });
  }

  const changes = [];
  if (date) changes.push(`Date changed to ${date}`);
  if (time) changes.push(`Time changed to ${time}`);
  if (party_size) changes.push(`Party size changed to ${party_size}`);
  if (special_requests !== undefined) changes.push('Special requests updated');

  // Send modification email if customer has email
  if (existingReservation?.customer_email) {
    let restaurantName = 'Your Restaurant';
    let restaurantLanguage = 'en';
    try {
      const { data: config } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('restaurant_name, language')
        .eq('restaurant_id', restaurantId)
        .single();
      if (config?.restaurant_name) restaurantName = config.restaurant_name;
      if (config?.language) restaurantLanguage = config.language;
    } catch (err) {
      logger.warn('Could not fetch restaurant config for modification email:', err.message);
    }

    sendReservationModificationEmail({
      customerEmail: existingReservation.customer_email,
      customerName: existingReservation.customer_name,
      restaurantName,
      reservationId: reservation_id,
      partySize: parseInt(party_size) || existingReservation.party_size,
      date: date || existingReservation.date,
      time: time || existingReservation.time,
      changes,
      language: restaurantLanguage,
    }).catch(err => {
      logger.warn('Modification email failed (non-fatal):', err.message);
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Reservation modified successfully'
  });
}

async function handleCancel(req, res, restaurantId) {
  const { reservation_id } = req.method === 'POST' ? req.body : req.query;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: 'I need your confirmation number to cancel your reservation.'
    });
  }

  // Look up reservation before cancelling (for email notification)
  const findResult = await findReservation(restaurantId, { reservation_id });
  const reservation = findResult.success ? findResult.reservation : null;

  const result = await airtableCancelReservation(restaurantId, reservation_id);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: 'I couldn\'t cancel your reservation. Please try again or call us directly.'
    });
  }

  // Log cancellation for ML training data
  await logCustomerCancelled(reservation_id);

  // Send cancellation email (fire-and-forget, non-fatal)
  if (reservation?.customer_email) {
    let restaurantName = 'Your Restaurant';
    let restaurantLanguage = 'en';
    try {
      const { data: config } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('restaurant_name, language')
        .eq('id', restaurantId)
        .single();
      if (config?.restaurant_name) restaurantName = config.restaurant_name;
      if (config?.language) restaurantLanguage = config.language;
    } catch (err) {
      logger.warn('Could not fetch restaurant config for cancellation email:', err.message);
    }

    sendReservationCancellationEmail({
      customerEmail: reservation.customer_email,
      customerName: reservation.customer_name,
      restaurantName,
      reservationId: reservation_id,
      partySize: reservation.party_size,
      date: reservation.date,
      time: reservation.time,
      language: restaurantLanguage,
    }).catch(err => logger.warn('Cancellation email failed (non-fatal):', err.message));
  }

  return res.status(200).json({
    success: true,
    message: 'Reservation cancelled successfully',
    notification_sent: !!reservation?.customer_email,
  });
}
