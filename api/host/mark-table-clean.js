const { getTables, updateTableStatus } = require('../_lib/airtable');

/**
 * Mark Table Clean Endpoint
 *
 * After cleaning, mark tables as available again
 *
 * POST /api/host/mark-table-clean
 * Body: {
 *   table_record_ids: ["recABC123", "recDEF456"]
 * }
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: true,
      message: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { table_record_ids } = req.body;

    // Validate input
    if (!table_record_ids || !Array.isArray(table_record_ids) || table_record_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing required field: table_record_ids (array of Airtable record IDs)'
      });
    }

    // 1. Fetch table details to validate
    const tablePromises = table_record_ids.map(id =>
      getTables(`RECORD_ID() = '${id}'`)
    );

    const tableResults = await Promise.all(tablePromises);

    const tables = tableResults
      .filter(r => r.success && r.data.records && r.data.records.length > 0)
      .map(r => r.data.records[0]);

    if (tables.length !== table_record_ids.length) {
      return res.status(404).json({
        success: false,
        error: true,
        message: 'One or more table IDs not found'
      });
    }

    // 2. Validate tables are in "Being Cleaned" status
    const invalidTables = tables.filter(t => t.fields.Status !== 'Being Cleaned');

    if (invalidTables.length > 0) {
      const invalidNumbers = invalidTables.map(t => t.fields['Table Number']).join(', ');
      return res.status(400).json({
        success: false,
        error: true,
        message: `Tables must be in "Being Cleaned" status. Invalid: ${invalidNumbers}`
      });
    }

    // 3. Update all tables to "Available"
    const updatePromises = tables.map(table =>
      updateTableStatus(table.id, 'Available')
    );

    await Promise.all(updatePromises);

    // 4. Return success
    return res.status(200).json({
      success: true,
      message: `${tables.length} table(s) marked as available`,
      tables: tables.map(t => ({
        table_number: t.fields['Table Number'],
        capacity: t.fields.Capacity,
        location: t.fields.Location,
        status: 'Available'
      }))
    });

  } catch (error) {
    console.error('Mark table clean error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to update table status. Please try again.'
    });
  }
};
