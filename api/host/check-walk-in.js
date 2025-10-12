const { getAvailableTables } = require('../_lib/airtable');
const { assignTables, getAllTableOptions } = require('../_lib/table-assignment');

/**
 * Check Walk-in Availability Endpoint
 *
 * When a walk-in customer arrives, check if we can seat them immediately
 *
 * GET /api/host/check-walk-in?party_size=4&preferred_location=Patio
 *
 * Query params:
 * - party_size (required): Number of guests
 * - preferred_location (optional): "Main Room", "Patio", "Bar", "Private Room"
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: true,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    const { party_size, preferred_location } = req.query;

    // Validate input
    if (!party_size) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing required query parameter: party_size'
      });
    }

    const partySizeNum = parseInt(party_size);

    if (isNaN(partySizeNum) || partySizeNum < 1) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Invalid party_size. Must be a positive number.'
      });
    }

    // 1. Get available tables
    const tablesResult = await getAvailableTables();

    if (!tablesResult.success) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Failed to retrieve available tables'
      });
    }

    const availableTables = tablesResult.data.records || [];

    // 2. Check if we can accommodate this party
    if (availableTables.length === 0) {
      return res.status(200).json({
        success: true,
        can_seat: false,
        message: 'No tables currently available',
        recommendation: null,
        all_options: [],
        wait_time_estimate: 'Unknown - no active service records to estimate'
      });
    }

    // 3. Get table assignment recommendations
    const recommendation = assignTables(partySizeNum, availableTables, preferred_location || null);

    // 4. Get all options ranked by quality
    const allOptions = getAllTableOptions(partySizeNum, availableTables, preferred_location || null);

    // 5. Determine if we can seat them
    const canSeat = recommendation.success;

    if (!canSeat) {
      return res.status(200).json({
        success: true,
        can_seat: false,
        message: `Cannot accommodate party of ${partySizeNum} with available tables`,
        recommendation: null,
        all_options: [],
        available_tables_count: availableTables.length,
        largest_available_capacity: Math.max(...availableTables.map(t => t.fields.Capacity)),
        next_step: 'Add to waitlist or suggest alternative time'
      });
    }

    // 6. Return availability with table suggestions
    return res.status(200).json({
      success: true,
      can_seat: true,
      message: `Can seat party of ${partySizeNum} immediately`,
      party_size: partySizeNum,
      preferred_location: preferred_location || 'Any',
      recommendation: {
        match_quality: recommendation.match,
        reason: recommendation.reason,
        tables: recommendation.tables.map(t => ({
          table_number: t.fields['Table Number'],
          capacity: t.fields.Capacity,
          location: t.fields.Location,
          table_type: t.fields['Table Type'],
          record_id: t.id
        })),
        total_capacity: recommendation.total_capacity,
        location: recommendation.location
      },
      all_options: allOptions.slice(0, 5).map(opt => ({
        match: opt.match,
        score: opt.score,
        tables: opt.tableNumbers,
        total_capacity: opt.totalCapacity,
        waste_seats: opt.wasteSeats,
        location: opt.location,
        table_records: opt.tables.map(t => ({
          table_number: t.fields['Table Number'],
          capacity: t.fields.Capacity,
          location: t.fields.Location,
          record_id: t.id
        }))
      })),
      next_step: 'Use /api/host/seat-party with type="Walk-in" to seat the party'
    });

  } catch (error) {
    console.error('Check walk-in error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to check availability. Please try again.'
    });
  }
};
