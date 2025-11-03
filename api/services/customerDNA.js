/**
 * Customer DNA Profiling Engine
 *
 * Analyzes deep behavioral patterns to create comprehensive customer profiles
 * Goes beyond basic LTV to understand WHO customers are and WHAT they prefer
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * Analyze and build complete DNA profile for a customer
 */
async function analyzeCustomerDNA(customerId) {
  try {
    // Get all historical data for this customer
    const { data: reservations, error: resError } = await supabase
      .from('reservations')
      .select('*')
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

    // 4. Build comprehensive profile
    const behavioralProfile = {
      customer_id: customerId,

      // Timing
      preferred_time_slot: timingPatterns.preferredTimeSlot,
      preferred_day_type: timingPatterns.preferredDayType,
      booking_lead_time_avg: bookingBehavior.avgLeadTime,
      spontaneity_score: bookingBehavior.spontaneityScore,

      // Party Composition
      typical_party_size: partyPatterns.typicalSize,
      dining_style: partyPatterns.diningStyle,
      brings_children: partyPatterns.bringsChildren,

      // Defaults for fields we'll enhance later
      avg_dining_duration_minutes: 90, // Placeholder
      pace_preference: 'leisurely',
      preferred_seating: null,
      noise_tolerance: 'moderate',
      dietary_restrictions: [],
      cuisine_preferences: [],
      adventurous_eater: true,
      primary_occasion_type: partyPatterns.primaryOccasion,
      celebrates_occasions: false,
      price_sensitivity: 'moderate',
      avg_check_per_person: null,
      orders_appetizers_pct: null,
      orders_desserts_pct: null,
      orders_wine_pct: null,
      tip_percentage_avg: null,
      companion_count: 0,
      brings_new_guests: false,
      influencer_score: 0,
      response_rate: null,
      feedback_sentiment: 'neutral',
      complaint_count: 0,
      compliment_count: 0,

      profile_confidence: calculateConfidence(reservations.length),
      last_analyzed_at: new Date().toISOString()
    };

    // 5. Save or update profile
    const { data: savedProfile, error: saveError } = await supabase
      .from('customer_behavioral_profiles')
      .upsert(behavioralProfile, { onConflict: 'customer_id' })
      .select()
      .single();

    if (saveError) throw saveError;

    // 6. Analyze and save occasions
    const occasions = detectOccasions(reservations);
    if (occasions.length > 0) {
      await saveOccasions(customerId, occasions);
    }

    // 7. Make predictions
    const predictions = generatePredictions(customerId, behavioralProfile, reservations);
    if (predictions.length > 0) {
      await savePredictions(customerId, predictions);
    }

    return {
      success: true,
      profile: savedProfile,
      occasions: occasions,
      predictions: predictions
    };

  } catch (error) {
    console.error('Error analyzing customer DNA:', error);
    throw error;
  }
}

/**
 * Analyze timing patterns from reservations
 */
function analyzeTimingPatterns(reservations) {
  const timeSlots = {};
  const dayTypes = { weekday: 0, weekend: 0 };

  reservations.forEach(res => {
    // Count time slots
    const timeSlot = getTimeSlot(res.time);
    timeSlots[timeSlot] = (timeSlots[timeSlot] || 0) + 1;

    // Count day types
    const date = new Date(res.date);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      dayTypes.weekend++;
    } else {
      dayTypes.weekday++;
    }
  });

  // Find most common time slot
  const preferredTimeSlot = Object.keys(timeSlots).reduce((a, b) =>
    timeSlots[a] > timeSlots[b] ? a : b
  );

  // Determine day type preference
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

  // Determine dining style based on party size patterns
  let diningStyle = 'couple';
  if (avgSize === 1) diningStyle = 'solo';
  else if (avgSize >= 2 && avgSize < 3) diningStyle = 'couple';
  else if (avgSize >= 3 && avgSize < 5) diningStyle = 'family';
  else if (avgSize >= 5) diningStyle = 'group';

  // Check for business patterns (weekday lunches with consistent sizes)
  const weekdayLunches = reservations.filter(r => {
    const date = new Date(r.date);
    const dayOfWeek = date.getDay();
    const hour = parseInt(r.time.split(':')[0]);
    return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 11 && hour < 15;
  });

  if (weekdayLunches.length > reservations.length * 0.6) {
    diningStyle = 'business';
  }

  // Detect children (larger parties, early times)
  const earlyDinners = reservations.filter(r => {
    const hour = parseInt(r.time.split(':')[0]);
    return hour >= 17 && hour < 19 && r.party_size >= 3;
  });
  const bringsChildren = earlyDinners.length > 0 && avgSize >= 3;

  // Detect primary occasion
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

      if (leadTime >= 0 && leadTime < 365) { // Sanity check
        leadTimes.push(leadTime);
      }
    }
  });

  if (leadTimes.length === 0) {
    return {
      avgLeadTime: null,
      spontaneityScore: 50 // Neutral
    };
  }

  const avgLeadTime = Math.round(leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length);

  // Calculate spontaneity score (0-100)
  // 0-2 days = high spontaneity (80-100)
  // 3-7 days = moderate (50-80)
  // 7-14 days = planner (20-50)
  // 14+ days = advance planner (0-20)
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

  // Look for recurring dates (anniversaries, birthdays)
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

  // If a date appears multiple years, it's likely an occasion
  Object.keys(monthDayCounts).forEach(monthDay => {
    const occurrences = monthDayCounts[monthDay];

    if (occurrences.length >= 2) {
      const years = new Set(occurrences.map(o => new Date(o.date).getFullYear()));

      if (years.size >= 2) {
        // This is a recurring occasion
        const lastOccurrence = occurrences[occurrences.length - 1];
        const nextYear = new Date().getFullYear() + 1;
        const [month, day] = monthDay.split('-');

        occasions.push({
          occasion_type: 'anniversary', // Could be birthday, anniversary, etc.
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

  // 1. Predict next visit date
  if (reservations.length >= 2) {
    const lastVisit = new Date(reservations[reservations.length - 1].date);
    const visits = reservations.map(r => new Date(r.date).getTime());

    // Calculate average days between visits
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

  // 2. Predict party size
  if (profile.typical_party_size) {
    predictions.push({
      prediction_type: 'party_size',
      predicted_value: Math.round(profile.typical_party_size).toString(),
      confidence_score: profile.profile_confidence / 100,
      prediction_date: now.toISOString().split('T')[0],
      predicted_for_date: null
    });
  }

  // 3. Predict time slot
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

  const { error } = await supabase
    .from('customer_occasions')
    .upsert(occasionsWithCustomerId, { onConflict: 'customer_id,occasion_date' });

  if (error) {
    console.error('Error saving occasions:', error);
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

  const { error } = await supabase
    .from('customer_predictions')
    .insert(predictionsWithCustomerId);

  if (error && error.code !== '23505') { // Ignore duplicates
    console.error('Error saving predictions:', error);
  }
}

/**
 * Calculate confidence based on data points
 */
function calculateConfidence(dataPoints) {
  if (dataPoints >= 10) return 95;
  if (dataPoints >= 5) return 75;
  if (dataPoints >= 3) return 50;
  if (dataPoints >= 2) return 30;
  return 10;
}

/**
 * Calculate prediction confidence based on consistency
 */
function calculatePredictionConfidence(intervals) {
  if (intervals.length === 0) return 0;

  const avg = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
  const variance = intervals.reduce((sum, int) => sum + Math.pow(int - avg, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Lower standard deviation = higher confidence
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
    // Get all unique customer phones from reservations
    const { data: customers, error } = await supabase
      .from('reservations')
      .select('customer_phone')
      .order('customer_phone');

    if (error) throw error;

    const uniqueCustomers = [...new Set(customers.map(c => c.customer_phone))];

    console.log(`📊 Analyzing DNA for ${uniqueCustomers.length} customers...`);

    const results = [];
    for (const customerId of uniqueCustomers) {
      try {
        const result = await analyzeCustomerDNA(customerId);
        results.push(result);
      } catch (err) {
        console.error(`Failed to analyze DNA for ${customerId}:`, err);
      }
    }

    console.log(`✅ Analyzed DNA for ${results.length} customers`);
    return results;

  } catch (error) {
    console.error('Error in batch DNA analysis:', error);
    throw error;
  }
}

/**
 * Get complete DNA profile for a customer
 */
async function getCustomerDNAProfile(customerId) {
  try {
    // Get behavioral profile
    const { data: profile, error: profileError } = await supabase
      .from('customer_behavioral_profiles')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') throw profileError;

    // Get occasions
    const { data: occasions, error: occasionsError } = await supabase
      .from('customer_occasions')
      .select('*')
      .eq('customer_id', customerId);

    if (occasionsError) throw occasionsError;

    // Get predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('customer_predictions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (predictionsError) throw predictionsError;

    return {
      profile: profile || null,
      occasions: occasions || [],
      predictions: predictions || []
    };

  } catch (error) {
    console.error('Error fetching DNA profile:', error);
    throw error;
  }
}

module.exports = {
  analyzeCustomerDNA,
  analyzeAllCustomersDNA,
  getCustomerDNAProfile
};
