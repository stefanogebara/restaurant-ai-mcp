const {
  getServiceRecords,
  completeServiceRecord,
  updateReservation,
  getTables,
  updateTableStatus
} = require('../_lib/airtable');

/**
 * Complete Service Endpoint
 *
 * When a party leaves:
 * 1. Mark service record as completed with actual departure time
 * 2. Update all tables to "Being Cleaned"
 * 3. Update reservation to "Completed" if applicable
 *
 * POST /api/host/complete-service
 * Body: {
 *   service_record_id: "recXYZ123"  // Airtable record ID
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
    const { service_record_id } = req.body;

    // Validate input
    if (!service_record_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing required field: service_record_id'
      });
    }

    // 1. Look up service record
    const serviceRecordResult = await getServiceRecords(`RECORD_ID() = '${service_record_id}'`);

    if (!serviceRecordResult.success || !serviceRecordResult.data.records || serviceRecordResult.data.records.length === 0) {
      return res.status(404).json({
        success: false,
        error: true,
        message: 'Service record not found'
      });
    }

    const serviceRecord = serviceRecordResult.data.records[0];
    const fields = serviceRecord.fields;

    // 2. Validate service record status
    if (fields.Status === 'Completed') {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'This service is already completed'
      });
    }

    if (fields.Status !== 'Seated' && fields.Status !== 'Eating' && fields.Status !== 'Paying') {
      return res.status(400).json({
        success: false,
        error: true,
        message: `Cannot complete service with status: ${fields.Status}`
      });
    }

    // 3. Mark service record as completed
    const departureTime = new Date();
    const completeResult = await completeServiceRecord(serviceRecord.id);

    if (!completeResult.success) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Failed to complete service record'
      });
    }

    // 4. Get table IDs from service record
    const tableRecordIds = fields.Tables || [];

    if (tableRecordIds.length === 0) {
      // No tables linked (shouldn't happen, but handle gracefully)
      return res.status(200).json({
        success: true,
        message: 'Service completed, but no tables were linked',
        service_record: {
          id: service_record_id,
          service_id: fields['Service ID'],
          customer_name: fields['Customer Name'],
          actual_departure: departureTime.toISOString()
        }
      });
    }

    // 5. Fetch table details
    const tablePromises = tableRecordIds.map(id =>
      getTables(`RECORD_ID() = '${id}'`)
    );

    const tableResults = await Promise.all(tablePromises);

    const tables = tableResults
      .filter(r => r.success && r.data.records && r.data.records.length > 0)
      .map(r => r.data.records[0]);

    // 6. Update all tables to "Being Cleaned"
    const tableUpdatePromises = tables.map(table =>
      updateTableStatus(table.id, 'Being Cleaned')
    );

    await Promise.all(tableUpdatePromises);

    // 7. Update reservation to "Completed" if linked
    const reservationRecordIds = fields.Reservation || [];

    if (reservationRecordIds.length > 0) {
      const reservationId = reservationRecordIds[0]; // Should only be one
      await updateReservation(reservationId, {
        'Status': 'Completed',
        'Updated At': new Date().toISOString().split('T')[0]
      });
    }

    // 8. Calculate service duration
    const seatedAt = new Date(fields['Seated At']);
    const durationMinutes = Math.round((departureTime - seatedAt) / 60000);

    // 9. Return success with details
    return res.status(200).json({
      success: true,
      message: `Service completed for ${fields['Customer Name']}`,
      service_record: {
        id: service_record_id,
        service_id: fields['Service ID'],
        customer_name: fields['Customer Name'],
        party_size: fields['Party Size'],
        seated_at: fields['Seated At'],
        actual_departure: departureTime.toISOString(),
        duration_minutes: durationMinutes,
        expected_duration_minutes: fields['Expected Duration'],
        type: fields.Type
      },
      tables_freed: tables.map(t => ({
        table_number: t.fields['Table Number'],
        location: t.fields.Location,
        status: 'Being Cleaned'
      })),
      reservation_completed: reservationRecordIds.length > 0,
      next_step: 'Tables marked "Being Cleaned". Use /api/host/mark-table-clean to make them available again'
    });

  } catch (error) {
    console.error('Complete service error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to complete service. Please try again.'
    });
  }
};
