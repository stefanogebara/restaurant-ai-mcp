/**
 * Weekly Reports API for Segovia Basic Plan
 *
 * Provides simple, actionable metrics for small town restaurants:
 * - Covers comparison (this week vs last week)
 * - Revenue trends
 * - Busiest times
 * - Customer demographics (Tourist vs Local)
 * - Dietary restrictions tracking
 * - Language distribution
 */

const { getSupabaseClient } = require('./_lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'weekly':
        return await handleWeeklyReport(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: weekly'
        });
    }
  } catch (error) {
    console.error('Reports error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Generate Weekly Report
 *
 * Aggregates data from reservations and service_records
 * for the specified week vs previous week comparison
 */
async function handleWeeklyReport(req, res) {
  const supabase = getSupabaseClient();

  // Parse date range from query params
  const { start_date, end_date } = req.query;

  // Default to current week if not specified
  const endDate = end_date ? new Date(end_date) : new Date();
  const startDate = start_date ? new Date(start_date) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Calculate previous week dates for comparison
  const prevEndDate = new Date(startDate.getTime() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Format dates for SQL
  const formatDate = (date) => date.toISOString().split('T')[0];

  const currentStart = formatDate(startDate);
  const currentEnd = formatDate(endDate);
  const prevStart = formatDate(prevStartDate);
  const prevEnd = formatDate(prevEndDate);

  try {
    // ============================================================================
    // CURRENT WEEK DATA
    // ============================================================================

    // Get completed service records (actual covers served)
    const { data: currentServices, error: currentServicesError } = await supabase
      .from('service_records')
      .select('*')
      .gte('seated_at', currentStart)
      .lte('seated_at', currentEnd)
      .eq('status', 'completed');

    if (currentServicesError) throw currentServicesError;

    // Get reservations data for current week
    const { data: currentReservations, error: currentReservationsError } = await supabase
      .from('reservations')
      .select('*')
      .gte('date', currentStart)
      .lte('date', currentEnd);

    if (currentReservationsError) throw currentReservationsError;

    // ============================================================================
    // PREVIOUS WEEK DATA (for comparison)
    // ============================================================================

    const { data: prevServices, error: prevServicesError } = await supabase
      .from('service_records')
      .select('*')
      .gte('seated_at', prevStart)
      .lte('seated_at', prevEnd)
      .eq('status', 'completed');

    if (prevServicesError) throw prevServicesError;

    const { data: prevReservations, error: prevReservationsError } = await supabase
      .from('reservations')
      .select('*')
      .gte('date', prevStart)
      .lte('date', prevEnd);

    if (prevReservationsError) throw prevReservationsError;

    // ============================================================================
    // CALCULATE METRICS
    // ============================================================================

    // Total covers (party sizes from completed services)
    const currentCovers = currentServices?.reduce((sum, s) => sum + (s.party_size || 0), 0) || 0;
    const prevCovers = prevServices?.reduce((sum, s) => sum + (s.party_size || 0), 0) || 0;
    const coversChange = prevCovers > 0 ? ((currentCovers - prevCovers) / prevCovers) * 100 : 0;

    // Reservation vs Walk-in breakdown
    const currentReservationCount = currentServices?.filter(s => s.reservation_id).length || 0;
    const currentWalkInCount = currentServices?.filter(s => !s.reservation_id).length || 0;

    // Average party size
    const avgPartySize = currentServices?.length > 0
      ? currentCovers / currentServices.length
      : 0;

    // Cancellation rate
    const cancelledReservations = currentReservations?.filter(r => r.status === 'cancelled').length || 0;
    const totalReservations = currentReservations?.length || 0;
    const cancellationRate = totalReservations > 0
      ? (cancelledReservations / totalReservations) * 100
      : 0;

    // ============================================================================
    // BUSIEST DAYS/TIMES ANALYSIS
    // ============================================================================

    // Group by day of week
    const dayOfWeekCounts = {};
    currentServices?.forEach(service => {
      const date = new Date(service.seated_at);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + (service.party_size || 0);
    });

    const busiestDays = Object.entries(dayOfWeekCounts)
      .map(([day, covers]) => ({ day, covers }))
      .sort((a, b) => b.covers - a.covers)
      .slice(0, 3);

    // Group by hour
    const hourCounts = {};
    currentServices?.forEach(service => {
      const date = new Date(service.seated_at);
      const hour = date.getHours();
      const timeSlot = `${hour}:00`;
      hourCounts[timeSlot] = (hourCounts[timeSlot] || 0) + (service.party_size || 0);
    });

    const busiestTimes = Object.entries(hourCounts)
      .map(([time, covers]) => ({ time, covers }))
      .sort((a, b) => b.covers - a.covers)
      .slice(0, 3);

    // ============================================================================
    // SEGOVIA-SPECIFIC METRICS (from enhanced notes)
    // ============================================================================

    // Customer type distribution
    const touristCount = currentReservations?.filter(r => r.customer_type === 'Tourist').length || 0;
    const localCount = currentReservations?.filter(r => r.customer_type === 'Local').length || 0;
    const touristPercentage = totalReservations > 0
      ? (touristCount / totalReservations) * 100
      : 0;

    // Dietary restrictions breakdown
    const dietaryRestrictions = {};
    currentReservations?.forEach(reservation => {
      if (reservation.dietary_restrictions && Array.isArray(reservation.dietary_restrictions)) {
        reservation.dietary_restrictions.forEach(restriction => {
          dietaryRestrictions[restriction] = (dietaryRestrictions[restriction] || 0) + 1;
        });
      }
    });

    // Language distribution
    const languageDistribution = {};
    currentReservations?.forEach(reservation => {
      if (reservation.language_preference) {
        const lang = reservation.language_preference;
        languageDistribution[lang] = (languageDistribution[lang] || 0) + 1;
      }
    });

    // Seating preferences
    const seatingPreferences = {};
    currentReservations?.forEach(reservation => {
      if (reservation.seating_preference) {
        const pref = reservation.seating_preference;
        seatingPreferences[pref] = (seatingPreferences[pref] || 0) + 1;
      }
    });

    // Special occasions
    const specialOccasions = {};
    currentReservations?.forEach(reservation => {
      if (reservation.special_occasion) {
        const occasion = reservation.special_occasion;
        specialOccasions[occasion] = (specialOccasions[occasion] || 0) + 1;
      }
    });

    // First-time visitors
    const firstTimeVisitors = currentReservations?.filter(r => r.first_time_visitor === true).length || 0;
    const repeatCustomers = totalReservations - firstTimeVisitors;

    // ============================================================================
    // BUILD RESPONSE
    // ============================================================================

    const report = {
      period: {
        start: currentStart,
        end: currentEnd,
        label: `${new Date(currentStart).toLocaleDateString()} - ${new Date(currentEnd).toLocaleDateString()}`
      },
      comparison: {
        start: prevStart,
        end: prevEnd
      },
      summary: {
        total_covers: currentCovers,
        previous_covers: prevCovers,
        covers_change_percent: Math.round(coversChange * 10) / 10,
        total_reservations: totalReservations,
        reservation_count: currentReservationCount,
        walk_in_count: currentWalkInCount,
        avg_party_size: Math.round(avgPartySize * 10) / 10,
        cancellation_rate: Math.round(cancellationRate * 10) / 10,
        cancelled_count: cancelledReservations
      },
      busiest: {
        days: busiestDays,
        times: busiestTimes
      },
      demographics: {
        tourist_count: touristCount,
        local_count: localCount,
        tourist_percentage: Math.round(touristPercentage * 10) / 10,
        first_time_visitors: firstTimeVisitors,
        repeat_customers: repeatCustomers
      },
      preferences: {
        dietary_restrictions: dietaryRestrictions,
        languages: languageDistribution,
        seating: seatingPreferences,
        occasions: specialOccasions
      }
    };

    return res.status(200).json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Weekly report generation error:', error);
    throw error;
  }
}
