/**
 * Customer DNA Profiling Engine v2
 *
 * Analyzes deep behavioral patterns to create comprehensive customer profiles.
 * Goes beyond basic LTV to understand WHO customers are and WHAT they prefer.
 *
 * v2 enhancements:
 * - Revenue-based enrichment (spending, tips, line items)
 * - Duration-based enrichment (dining pace, seating preferences)
 * - Sentiment aggregation from call transcripts
 * - AI text extraction via Claude (dietary, occasions, style evidence)
 * - Weighted confidence scoring across all data sources
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { extractCustomerSignals } = require('./customerTextAnalysis');

const logger = createSecureLogger('CustomerDNA');

// ─── ENRICHMENT FUNCTIONS ────────────────────────────────────────────────────

/**
 * Enrich profile with revenue data from revenue_records table.
 */
async function enrichWithRevenueData(customerId) {
  const phoneVariants = buildPhoneVariants(customerId);

  const { data: revenues, error } = await supabaseAdmin
    .from('revenue_records')
    .select('total_revenue, tip_amount, party_size, line_items')
    .in('customer_phone', phoneVariants);

  if (error || !revenues || revenues.length === 0) {
    return null;
  }

  const totalRecords = revenues.length;
  let totalRevenue = 0;
  let totalTips = 0;
  let totalPartySize = 0;
  let appetizersCount = 0;
  let dessertsCount = 0;
  let wineCount = 0;
  let lineItemsAvailable = 0;

  for (const r of revenues) {
    const rev = parseFloat(r.total_revenue || 0);
    const tip = parseFloat(r.tip_amount || 0);
    const party = r.party_size || 1;

    totalRevenue += rev;
    totalTips += tip;
    totalPartySize += party;

    // Parse line_items JSONB for category analysis
    if (r.line_items && Array.isArray(r.line_items)) {
      lineItemsAvailable++;
      for (const item of r.line_items) {
        const name = (item.name || item.item_name || '').toLowerCase();
        const category = (item.category || '').toLowerCase();
        if (category.includes('appetizer') || category.includes('starter') || name.includes('appetizer')) {
          appetizersCount++;
        }
        if (category.includes('dessert') || name.includes('dessert') || name.includes('cake') || name.includes('ice cream')) {
          dessertsCount++;
        }
        if (category.includes('wine') || name.includes('wine') || name.includes('bottle')) {
          wineCount++;
        }
      }
    }
  }

  const avgCheckPerPerson = totalRevenue / totalPartySize;
  const tipPercentageAvg = (totalRevenue - totalTips) > 0
    ? (totalTips / (totalRevenue - totalTips)) * 100
    : 0;

  // Get restaurant average for price sensitivity comparison
  const { data: allRevenues } = await supabaseAdmin
    .from('revenue_records')
    .select('total_revenue, party_size')
    .limit(500);

  let priceSensitivity = 'moderate';
  if (allRevenues && allRevenues.length > 0) {
    const restaurantAvg = allRevenues.reduce((sum, r) =>
      sum + parseFloat(r.total_revenue || 0) / (r.party_size || 1), 0
    ) / allRevenues.length;

    const ratio = avgCheckPerPerson / restaurantAvg;
    if (ratio < 0.8) priceSensitivity = 'budget';
    else if (ratio > 1.2) priceSensitivity = 'premium';
  }

  return {
    avg_check_per_person: Math.round(avgCheckPerPerson * 100) / 100,
    tip_percentage_avg: Math.round(tipPercentageAvg * 10) / 10,
    price_sensitivity: priceSensitivity,
    orders_appetizers_pct: lineItemsAvailable > 0 ? Math.round((appetizersCount / lineItemsAvailable) * 100) : null,
    orders_desserts_pct: lineItemsAvailable > 0 ? Math.round((dessertsCount / lineItemsAvailable) * 100) : null,
    orders_wine_pct: lineItemsAvailable > 0 ? Math.round((wineCount / lineItemsAvailable) * 100) : null
  };
}

/**
 * Enrich profile with service/duration data from service_records table.
 */
async function enrichWithServiceData(customerId) {
  const phoneVariants = buildPhoneVariants(customerId);

  // Query service_records matching customer phone
  const { data: services, error } = await supabaseAdmin
    .from('service_records')
    .select('seated_at, actual_departure, table_ids')
    .in('customer_phone', phoneVariants)
    .not('seated_at', 'is', null)
    .not('actual_departure', 'is', null);

  if (error || !services || services.length === 0) {
    return null;
  }

  const durations = [];
  const tableAreas = {};

  for (const s of services) {
    if (s.seated_at && s.actual_departure) {
      const seated = new Date(s.seated_at);
      const departed = new Date(s.actual_departure);
      const durationMinutes = (departed - seated) / (1000 * 60);

      // Filter reasonable durations (20-300 minutes)
      if (durationMinutes >= 20 && durationMinutes <= 300) {
        durations.push(durationMinutes);
      }
    }

    // Track table areas for seating preference
    if (s.table_ids && Array.isArray(s.table_ids)) {
      for (const tableId of s.table_ids) {
        tableAreas[tableId] = (tableAreas[tableId] || 0) + 1;
      }
    }
  }

  if (durations.length === 0) return null;

  const avgDuration = Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);

  // Determine pace preference relative to restaurant average config
  // Default restaurant average: 75 minutes
  const restaurantAvgDuration = 75;
  const durationRatio = avgDuration / restaurantAvgDuration;
  let pacePreference = 'moderate';
  if (durationRatio < 0.8) pacePreference = 'fast';
  else if (durationRatio > 1.2) pacePreference = 'leisurely';

  // Find most frequent table for seating preference
  let preferredSeating = null;
  if (Object.keys(tableAreas).length > 0) {
    const topTableId = Object.entries(tableAreas).sort(([, a], [, b]) => b - a)[0][0];

    // Lookup table location
    const { data: tableInfo } = await supabaseAdmin
      .from('tables')
      .select('location')
      .eq('id', topTableId)
      .single();

    if (tableInfo) {
      preferredSeating = tableInfo.location;
    }
  }

  return {
    avg_dining_duration_minutes: avgDuration,
    pace_preference: pacePreference,
    preferred_seating: preferredSeating
  };
}

/**
 * Enrich profile with sentiment data from agent_conversations.
 */
async function enrichWithSentimentData(customerId) {
  const phoneVariants = buildPhoneVariants(customerId);

  const { data: conversations, error } = await supabaseAdmin
    .from('agent_conversations')
    .select('customer_sentiment, outcome')
    .in('caller_phone', phoneVariants);

  if (error || !conversations || conversations.length === 0) {
    return null;
  }

  const sentiments = {};
  let abandonedCount = 0;
  let complaintCount = 0;
  let complimentCount = 0;

  for (const conv of conversations) {
    if (conv.customer_sentiment) {
      const s = conv.customer_sentiment.toLowerCase();
      sentiments[s] = (sentiments[s] || 0) + 1;

      if (s === 'negative' || s === 'very_negative' || s === 'frustrated' || s === 'angry') {
        complaintCount++;
      }
      if (s === 'positive' || s === 'very_positive' || s === 'happy' || s === 'satisfied') {
        complimentCount++;
      }
    }
    if (conv.outcome === 'abandoned') {
      abandonedCount++;
    }
  }

  // Mode of sentiments
  let feedbackSentiment = 'neutral';
  if (Object.keys(sentiments).length > 0) {
    feedbackSentiment = Object.entries(sentiments).sort(([, a], [, b]) => b - a)[0][0];
  }

  const responseRate = conversations.length > 0
    ? Math.round(((conversations.length - abandonedCount) / conversations.length) * 100) / 100
    : null;

  return {
    feedback_sentiment: feedbackSentiment,
    complaint_count: complaintCount,
    compliment_count: complimentCount,
    response_rate: responseRate
  };
}

// ─── CONFIDENCE SCORING ──────────────────────────────────────────────────────

/**
 * Calculate weighted confidence score across all data sources.
 */
function calculateConfidenceV2(reservationCount, hasRevenue, hasService, hasTranscript, hasTextSignals) {
  const score =
    Math.min(50, reservationCount * 5) +  // max 50 from reservations
    (hasRevenue ? 15 : 0) +               // 15 from spending data
    (hasService ? 10 : 0) +               // 10 from duration data
    (hasTranscript ? 15 : 0) +            // 15 from call transcripts
    (hasTextSignals ? 10 : 0);            // 10 from AI text analysis

  return Math.min(100, score);
}

// ─── MAIN ANALYSIS FUNCTION ──────────────────────────────────────────────────

/**
 * Analyze and build complete DNA profile for a customer (v2).
 * Enriches with revenue, service, sentiment, and AI text signals.
 */
async function analyzeCustomerDNA(customerId) {
  try {
    // Get all historical data for this customer
    const { data: reservations, error: resError } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, special_requests, status, created_at')
      .eq('customer_phone', customerId)
      .order('date', { ascending: true });

    if (resError) throw resError;

    if (!reservations || reservations.length === 0) {
      return {
        customer_id: customerId,
        profile_confidence: 0,
        message: 'No data available for profiling'
      };
    }

    // 1. Analyze Timing Patterns
    const timingPatterns = analyzeTimingPatterns(reservations);

    // 2. Analyze Party Composition
    const partyPatterns = analyzePartyComposition(reservations);

    // 3. Analyze Booking Behavior
    const bookingBehavior = analyzeBookingBehavior(reservations);

    // 4. Run enrichments in parallel
    const [revenueData, serviceData, sentimentData, textResult] = await Promise.all([
      enrichWithRevenueData(customerId).catch(err => {
        logger.error(`Revenue enrichment failed for ${customerId}:`, err.message);
        return null;
      }),
      enrichWithServiceData(customerId).catch(err => {
        logger.error(`Service enrichment failed for ${customerId}:`, err.message);
        return null;
      }),
      enrichWithSentimentData(customerId).catch(err => {
        logger.error(`Sentiment enrichment failed for ${customerId}:`, err.message);
        return null;
      }),
      extractCustomerSignals(customerId).catch(err => {
        logger.error(`Text analysis failed for ${customerId}:`, err.message);
        return null;
      })
    ]);

    const aiSignals = textResult && !textResult.skipped ? textResult.signals : null;
    const aiConfidence = aiSignals?.ai_confidence || aiSignals?.extracted_signals?.confidence || 0;

    // Track which data sources contributed
    const dataSources = ['reservations'];
    if (revenueData) dataSources.push('revenue');
    if (serviceData) dataSources.push('service_records');
    if (sentimentData) dataSources.push('agent_conversations');
    if (aiSignals && !textResult?.skipped) dataSources.push('ai_text_analysis');

    // 5. Build base profile from heuristics
    const behavioralProfile = {
      customer_id: customerId,

      // Timing
      preferred_time_slot: timingPatterns.preferredTimeSlot,
      preferred_day_type: timingPatterns.preferredDayType,
      booking_lead_time_avg: bookingBehavior.avgLeadTime,
      spontaneity_score: bookingBehavior.spontaneityScore,

      // Party Composition (heuristic defaults)
      typical_party_size: partyPatterns.typicalSize,
      dining_style: partyPatterns.diningStyle,
      brings_children: partyPatterns.bringsChildren,

      // Duration/Pace (from service data or defaults)
      avg_dining_duration_minutes: serviceData?.avg_dining_duration_minutes || 90,
      pace_preference: serviceData?.pace_preference || 'moderate',
      preferred_seating: serviceData?.preferred_seating || null,

      // Sentiment (from conversation data or defaults)
      noise_tolerance: 'moderate',
      feedback_sentiment: sentimentData?.feedback_sentiment || 'neutral',
      complaint_count: sentimentData?.complaint_count || 0,
      compliment_count: sentimentData?.compliment_count || 0,
      response_rate: sentimentData?.response_rate || null,

      // Revenue (from spending data or defaults)
      price_sensitivity: revenueData?.price_sensitivity || 'moderate',
      avg_check_per_person: revenueData?.avg_check_per_person || null,
      orders_appetizers_pct: revenueData?.orders_appetizers_pct || null,
      orders_desserts_pct: revenueData?.orders_desserts_pct || null,
      orders_wine_pct: revenueData?.orders_wine_pct || null,
      tip_percentage_avg: revenueData?.tip_percentage_avg || null,

      // Text-based defaults (will be overridden by AI below)
      dietary_restrictions: [],
      cuisine_preferences: [],
      adventurous_eater: true,
      primary_occasion_type: partyPatterns.primaryOccasion,
      celebrates_occasions: false,

      // Social
      companion_count: 0,
      brings_new_guests: false,
      influencer_score: 0,

      // Metadata
      data_sources_used: dataSources,
      analysis_version: 'v2',
      profile_confidence: calculateConfidenceV2(
        reservations.length,
        !!revenueData,
        !!serviceData,
        !!sentimentData,
        !!(aiSignals && !textResult?.skipped)
      ),
      last_analyzed_at: new Date().toISOString()
    };

    // 6. Merge AI signals - AI overrides heuristics when AI confidence > 50
    if (aiSignals && aiConfidence > 50) {
      // Dining style: prefer AI evidence over party-size guess
      if (aiSignals.dining_style_evidence) {
        behavioralProfile.dining_style = aiSignals.dining_style_evidence;
      }

      // Children detection: prefer AI over time-based heuristic
      if (aiSignals.has_children != null) {
        behavioralProfile.brings_children = aiSignals.has_children;
      }

      // Dietary restrictions: only from AI (heuristics can't detect)
      if (aiSignals.dietary_restrictions && aiSignals.dietary_restrictions.length > 0) {
        behavioralProfile.dietary_restrictions = aiSignals.dietary_restrictions;
      }

      // Cuisine preferences
      if (aiSignals.cuisine_preferences && aiSignals.cuisine_preferences.length > 0) {
        behavioralProfile.cuisine_preferences = aiSignals.cuisine_preferences;
      }

      // Occasions from AI
      if (aiSignals.occasion_types && aiSignals.occasion_types.length > 0) {
        behavioralProfile.celebrates_occasions = true;
        behavioralProfile.primary_occasion_type = aiSignals.occasion_types[0];
      }

      // Seating preferences from AI
      if (aiSignals.seating_preferences && aiSignals.seating_preferences.length > 0) {
        behavioralProfile.preferred_seating = aiSignals.seating_preferences[0];
      }

      // Noise sensitivity
      if (aiSignals.noise_sensitivity) {
        behavioralProfile.noise_tolerance = aiSignals.noise_sensitivity;
      }
    }

    // 7. Save or update profile
    const { data: savedProfile, error: saveError } = await supabaseAdmin
      .from('customer_behavioral_profiles')
      .upsert(behavioralProfile, { onConflict: 'customer_id' })
      .select()
      .single();

    if (saveError) throw saveError;

    // 8. Analyze and save occasions
    const occasions = detectOccasions(reservations);
    if (occasions.length > 0) {
      await saveOccasions(customerId, occasions);
    }

    // 9. Make predictions
    const predictions = generatePredictions(customerId, behavioralProfile, reservations);
    if (predictions.length > 0) {
      await savePredictions(customerId, predictions);
    }

    return {
      success: true,
      profile: savedProfile,
      occasions: occasions,
      predictions: predictions,
      data_sources: dataSources
    };

  } catch (error) {
    logger.error('Error analyzing customer DNA:', error);
    throw error;
  }
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Build phone number variants for fuzzy matching.
 */
function buildPhoneVariants(phone) {
  if (!phone) return [];
  const cleaned = phone.replace(/\D/g, '');
  const variants = new Set([phone, cleaned]);

  if (cleaned.length >= 11) {
    variants.add(cleaned.slice(1));
  }
  if (cleaned.length === 10) {
    variants.add('1' + cleaned);
  }
  if (cleaned.length > 10) {
    variants.add(cleaned.slice(-10));
  }

  return [...variants];
}

/**
 * Analyze timing patterns from reservations
 */
function analyzeTimingPatterns(reservations) {
  const timeSlots = {};
  const dayTypes = { weekday: 0, weekend: 0 };

  reservations.forEach(res => {
    const timeSlot = getTimeSlot(res.time);
    timeSlots[timeSlot] = (timeSlots[timeSlot] || 0) + 1;

    const date = new Date(res.date);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      dayTypes.weekend++;
    } else {
      dayTypes.weekday++;
    }
  });

  const preferredTimeSlot = Object.keys(timeSlots).reduce((a, b) =>
    timeSlots[a] > timeSlots[b] ? a : b
  );

  const preferredDayType = dayTypes.weekend > dayTypes.weekday ? 'weekend' : 'weekday';

  return {
    preferredTimeSlot,
    preferredDayType,
    timeSlotDistribution: timeSlots
  };
}

/**
 * Analyze party composition patterns
 */
function analyzePartyComposition(reservations) {
  const sizes = reservations.map(r => r.party_size);
  const avgSize = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
  const typicalSize = Math.round(avgSize * 10) / 10;

  let diningStyle = 'couple';
  if (avgSize === 1) diningStyle = 'solo';
  else if (avgSize >= 2 && avgSize < 3) diningStyle = 'couple';
  else if (avgSize >= 3 && avgSize < 5) diningStyle = 'family';
  else if (avgSize >= 5) diningStyle = 'group';

  const weekdayLunches = reservations.filter(r => {
    const date = new Date(r.date);
    const dayOfWeek = date.getDay();
    const hour = parseInt(r.time.split(':')[0]);
    return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 11 && hour < 15;
  });

  if (weekdayLunches.length > reservations.length * 0.6) {
    diningStyle = 'business';
  }

  const earlyDinners = reservations.filter(r => {
    const hour = parseInt(r.time.split(':')[0]);
    return hour >= 17 && hour < 19 && r.party_size >= 3;
  });
  const bringsChildren = earlyDinners.length > 0 && avgSize >= 3;

  let primaryOccasion = 'casual';
  if (diningStyle === 'business') primaryOccasion = 'business';
  else if (diningStyle === 'couple') primaryOccasion = 'date';
  else if (diningStyle === 'family') primaryOccasion = 'family';

  return {
    typicalSize,
    diningStyle,
    bringsChildren,
    primaryOccasion,
    sizeVariance: Math.max(...sizes) - Math.min(...sizes)
  };
}

/**
 * Analyze booking behavior (lead time, spontaneity)
 */
function analyzeBookingBehavior(reservations) {
  const leadTimes = [];

  reservations.forEach(res => {
    if (res.created_at && res.date) {
      const bookedDate = new Date(res.created_at);
      const reservationDate = new Date(res.date);
      const leadTime = Math.floor((reservationDate - bookedDate) / (1000 * 60 * 60 * 24));

      if (leadTime >= 0 && leadTime < 365) {
        leadTimes.push(leadTime);
      }
    }
  });

  if (leadTimes.length === 0) {
    return {
      avgLeadTime: null,
      spontaneityScore: 50
    };
  }

  const avgLeadTime = Math.round(leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length);

  let spontaneityScore = 50;
  if (avgLeadTime <= 2) spontaneityScore = 90;
  else if (avgLeadTime <= 7) spontaneityScore = 65;
  else if (avgLeadTime <= 14) spontaneityScore = 35;
  else spontaneityScore = 15;

  return {
    avgLeadTime,
    spontaneityScore,
    leadTimeVariance: leadTimes.length > 1 ? Math.max(...leadTimes) - Math.min(...leadTimes) : 0
  };
}

/**
 * Detect special occasions from reservation patterns
 */
function detectOccasions(reservations) {
  const occasions = [];
  const monthDayCounts = {};

  reservations.forEach(res => {
    const date = new Date(res.date);
    const monthDay = `${date.getMonth() + 1}-${date.getDate()}`;

    if (!monthDayCounts[monthDay]) {
      monthDayCounts[monthDay] = [];
    }
    monthDayCounts[monthDay].push({
      date: res.date,
      partySize: res.party_size,
      specialRequests: res.special_requests
    });
  });

  Object.keys(monthDayCounts).forEach(monthDay => {
    const occurrences = monthDayCounts[monthDay];

    if (occurrences.length >= 2) {
      const years = new Set(occurrences.map(o => new Date(o.date).getFullYear()));

      if (years.size >= 2) {
        const lastOccurrence = occurrences[occurrences.length - 1];
        const nextYear = new Date().getFullYear() + 1;
        const [month, day] = monthDay.split('-');

        occasions.push({
          occasion_type: 'anniversary',
          occasion_date: lastOccurrence.date,
          recurrence: 'annual',
          party_size: Math.round(occurrences.reduce((sum, o) => sum + o.partySize, 0) / occurrences.length),
          next_predicted_date: `${nextYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
          probability_score: 0.85
        });
      }
    }
  });

  return occasions;
}

/**
 * Generate predictive insights
 */
function generatePredictions(customerId, profile, reservations) {
  const predictions = [];
  const now = new Date();

  if (reservations.length >= 2) {
    const lastVisit = new Date(reservations[reservations.length - 1].date);
    const visits = reservations.map(r => new Date(r.date).getTime());

    const intervals = [];
    for (let i = 1; i < visits.length; i++) {
      intervals.push((visits[i] - visits[i-1]) / (1000 * 60 * 60 * 24));
    }

    const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
    const predictedNextVisit = new Date(lastVisit.getTime() + (avgInterval * 24 * 60 * 60 * 1000));

    predictions.push({
      prediction_type: 'next_visit_date',
      predicted_value: predictedNextVisit.toISOString().split('T')[0],
      confidence_score: calculatePredictionConfidence(intervals),
      prediction_date: now.toISOString().split('T')[0],
      predicted_for_date: predictedNextVisit.toISOString().split('T')[0]
    });
  }

  if (profile.typical_party_size) {
    predictions.push({
      prediction_type: 'party_size',
      predicted_value: Math.round(profile.typical_party_size).toString(),
      confidence_score: profile.profile_confidence / 100,
      prediction_date: now.toISOString().split('T')[0],
      predicted_for_date: null
    });
  }

  if (profile.preferred_time_slot) {
    predictions.push({
      prediction_type: 'preferred_time_slot',
      predicted_value: profile.preferred_time_slot,
      confidence_score: profile.profile_confidence / 100,
      prediction_date: now.toISOString().split('T')[0],
      predicted_for_date: null
    });
  }

  return predictions;
}

/**
 * Save occasions to database
 */
async function saveOccasions(customerId, occasions) {
  const occasionsWithCustomerId = occasions.map(occ => ({
    ...occ,
    customer_id: customerId
  }));

  const { error } = await supabaseAdmin
    .from('customer_occasions')
    .upsert(occasionsWithCustomerId, { onConflict: 'customer_id,occasion_date' });

  if (error) {
    logger.error('Error saving occasions:', error);
  }
}

/**
 * Save predictions to database
 */
async function savePredictions(customerId, predictions) {
  const predictionsWithCustomerId = predictions.map(pred => ({
    ...pred,
    customer_id: customerId
  }));

  const { error } = await supabaseAdmin
    .from('customer_predictions')
    .insert(predictionsWithCustomerId);

  if (error && error.code !== '23505') {
    logger.error('Error saving predictions:', error);
  }
}

/**
 * Calculate prediction confidence based on consistency
 */
function calculatePredictionConfidence(intervals) {
  if (intervals.length === 0) return 0;

  const avg = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
  const variance = intervals.reduce((sum, int) => sum + Math.pow(int - avg, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  const coefficientOfVariation = stdDev / avg;

  if (coefficientOfVariation < 0.2) return 0.90;
  if (coefficientOfVariation < 0.4) return 0.75;
  if (coefficientOfVariation < 0.6) return 0.60;
  return 0.40;
}

/**
 * Get time slot label from time string
 */
function getTimeSlot(timeString) {
  if (!timeString) return 'Unknown';

  const hour = parseInt(timeString.split(':')[0]);

  if (hour >= 11 && hour < 14) return 'Lunch (11AM-2PM)';
  if (hour >= 17 && hour < 19) return 'Early Dinner (5PM-7PM)';
  if (hour >= 19 && hour < 21) return 'Prime Dinner (7PM-9PM)';
  if (hour >= 21) return 'Late Dinner (9PM+)';

  return 'Other';
}

/**
 * Batch analyze all customers
 */
async function analyzeAllCustomersDNA() {
  try {
    const { data: customers, error } = await supabaseAdmin
      .from('reservations')
      .select('customer_phone')
      .order('customer_phone');

    if (error) throw error;

    const uniqueCustomers = [...new Set(customers.map(c => c.customer_phone))];

    logger.info(`Analyzing DNA for ${uniqueCustomers.length} customers...`);

    const results = [];
    for (const customerId of uniqueCustomers) {
      try {
        const result = await analyzeCustomerDNA(customerId);
        results.push(result);
      } catch (err) {
        logger.error(`Failed to analyze DNA for ${customerId}:`, err);
      }
    }

    logger.info(`Analyzed DNA for ${results.length} customers`);
    return results;

  } catch (error) {
    logger.error('Error in batch DNA analysis:', error);
    throw error;
  }
}

/**
 * Get complete DNA profile for a customer (v2 - includes text signals)
 */
async function getCustomerDNAProfile(customerId) {
  try {
    const [profileResult, occasionsResult, predictionsResult, textSignalsResult] = await Promise.all([
      supabaseAdmin
        .from('customer_behavioral_profiles')
        .select('id, customer_id, restaurant_id, profile_confidence, dining_style, preferred_day_type, preferred_time_slot, spontaneity_score, brings_children, avg_party_size, avg_booking_lead_time_hours, preferred_table_location, created_at, updated_at')
        .eq('customer_id', customerId)
        .single(),
      supabaseAdmin
        .from('customer_occasions')
        .select('id, customer_id, occasion_type, occasion_date, next_predicted_date, confidence, created_at')
        .eq('customer_id', customerId),
      supabaseAdmin
        .from('customer_predictions')
        .select('id, customer_id, prediction_type, predicted_value, confidence, metadata, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('customer_text_signals')
        .select('id, customer_id, text_content_hash, sentiment_score, formality_score, enthusiasm_level, communication_style, key_topics, language_detected, created_at, updated_at')
        .eq('customer_id', customerId)
        .single()
    ]);

    const profile = profileResult.error && profileResult.error.code === 'PGRST116'
      ? null : profileResult.data;
    const textSignals = textSignalsResult.error && textSignalsResult.error.code === 'PGRST116'
      ? null : textSignalsResult.data;

    if (profileResult.error && profileResult.error.code !== 'PGRST116') throw profileResult.error;
    if (occasionsResult.error) throw occasionsResult.error;
    if (predictionsResult.error) throw predictionsResult.error;

    return {
      profile: profile || null,
      occasions: occasionsResult.data || [],
      predictions: predictionsResult.data || [],
      text_signals: textSignals || null
    };

  } catch (error) {
    logger.error('Error fetching DNA profile:', error);
    throw error;
  }
}

/**
 * Get full customer profile for the individual profile view.
 * Combines DNA profile, text signals, reservations, and revenue summary.
 */
async function getFullCustomerProfile(customerId) {
  try {
    const phoneVariants = buildPhoneVariants(customerId);

    const [dnaProfile, reservationsResult, revenueResult, customerName] = await Promise.all([
      getCustomerDNAProfile(customerId),
      supabaseAdmin
        .from('reservations')
        .select('id, date, time, party_size, status, special_requests, notes, customer_name')
        .eq('customer_phone', customerId)
        .order('date', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('revenue_records')
        .select('total_revenue, tip_amount, party_size, service_date')
        .in('customer_phone', phoneVariants)
        .order('service_date', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('reservations')
        .select('customer_name')
        .eq('customer_phone', customerId)
        .not('customer_name', 'is', null)
        .limit(1)
        .single()
    ]);

    // Build revenue summary
    const revenues = revenueResult.data || [];
    const revenueSummary = {
      total_revenue: revenues.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0),
      total_visits_with_revenue: revenues.length,
      avg_revenue: revenues.length > 0
        ? revenues.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0) / revenues.length
        : 0,
      total_tips: revenues.reduce((sum, r) => sum + parseFloat(r.tip_amount || 0), 0)
    };

    return {
      customer_id: customerId,
      customer_name: customerName?.data?.customer_name || null,
      ...dnaProfile,
      reservations: reservationsResult.data || [],
      revenue_summary: revenueSummary
    };

  } catch (error) {
    logger.error('Error fetching full customer profile:', error);
    throw error;
  }
}

/**
 * List customers with search/filter for the dashboard list view.
 */
async function listCustomerProfiles({ search, dining_style, min_confidence, limit = 50, offset = 0 } = {}) {
  try {
    let query = supabaseAdmin
      .from('customer_behavioral_profiles')
      .select('customer_id, dining_style, typical_party_size, profile_confidence, avg_check_per_person, spontaneity_score, preferred_time_slot, last_analyzed_at, data_sources_used, analysis_version');

    if (dining_style) {
      query = query.eq('dining_style', dining_style);
    }

    if (min_confidence) {
      query = query.gte('profile_confidence', parseInt(min_confidence));
    }

    query = query
      .order('profile_confidence', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: profiles, error, count } = await query;

    if (error) throw error;

    // Enrich with customer names from reservations
    const enrichedProfiles = [];
    for (const profile of (profiles || [])) {
      // Optionally filter by search term
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesPhone = profile.customer_id.includes(search);

        // Quick name lookup
        const { data: nameData } = await supabaseAdmin
          .from('reservations')
          .select('customer_name')
          .eq('customer_phone', profile.customer_id)
          .not('customer_name', 'is', null)
          .limit(1)
          .single();

        const name = nameData?.customer_name || '';
        const matchesName = name.toLowerCase().includes(searchLower);

        if (!matchesPhone && !matchesName) continue;

        enrichedProfiles.push({
          ...profile,
          customer_name: name
        });
      } else {
        const { data: nameData } = await supabaseAdmin
          .from('reservations')
          .select('customer_name')
          .eq('customer_phone', profile.customer_id)
          .not('customer_name', 'is', null)
          .limit(1)
          .single();

        enrichedProfiles.push({
          ...profile,
          customer_name: nameData?.customer_name || null
        });
      }
    }

    // Get total count for pagination
    let countQuery = supabaseAdmin
      .from('customer_behavioral_profiles')
      .select('customer_id', { count: 'exact', head: true });

    if (dining_style) countQuery = countQuery.eq('dining_style', dining_style);
    if (min_confidence) countQuery = countQuery.gte('profile_confidence', parseInt(min_confidence));

    const { count: totalCount } = await countQuery;

    return {
      profiles: enrichedProfiles,
      total: totalCount || 0,
      limit,
      offset
    };

  } catch (error) {
    logger.error('Error listing customer profiles:', error);
    throw error;
  }
}

module.exports = {
  analyzeCustomerDNA,
  analyzeAllCustomersDNA,
  getCustomerDNAProfile,
  getFullCustomerProfile,
  listCustomerProfiles,
  enrichWithRevenueData,
  enrichWithServiceData,
  enrichWithSentimentData
};
