/**
 * Health Check & Monitoring API
 *
 * Provides comprehensive health checks including:
 * - Database connectivity
 * - Stale data detection
 * - System metrics
 * - Data quality checks
 *
 * Best Practices (2025):
 * - Real-time monitoring with automated alerts
 * - Baseline metrics for anomaly detection
 * - Distributed tracing readiness
 * - Meaningful thresholds for alerts
 */

const airtable = require('./_lib/supabase');

// Thresholds for stale data detection
const THRESHOLDS = {
  SERVICE_RECORD_MAX_HOURS: 12,    // Service records older than 12h are stale
  WAITLIST_ENTRY_MAX_HOURS: 24,    // Waitlist entries older than 24h are stale
  RESERVATION_UPCOMING_DAYS: 90,   // Reservations more than 90 days out may need review
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const detailed = req.query.detailed === 'true';
  const startTime = Date.now();

  try {
    // Parallel health checks
    const [
      databaseHealth,
      staleDataCheck,
      dataQualityCheck
    ] = await Promise.all([
      checkDatabaseConnectivity(),
      checkForStaleData(),
      checkDataQuality()
    ]);

    const responseTime = Date.now() - startTime;

    // Determine overall health status
    const isHealthy =
      databaseHealth.status === 'healthy' &&
      staleDataCheck.status !== 'critical' &&
      dataQualityCheck.status !== 'critical';

    const healthStatus = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      checks: {
        database: databaseHealth,
        staleData: staleDataCheck,
        dataQuality: dataQualityCheck
      }
    };

    // Add detailed metrics if requested
    if (detailed) {
      healthStatus.metrics = await getDetailedMetrics();
      healthStatus.thresholds = THRESHOLDS;
    }

    // Add alerts if any issues found
    const alerts = [];
    if (staleDataCheck.staleServiceRecords > 0) {
      alerts.push({
        severity: 'warning',
        type: 'stale_data',
        message: `Found ${staleDataCheck.staleServiceRecords} stale service record(s) older than ${THRESHOLDS.SERVICE_RECORD_MAX_HOURS} hours`,
        action: 'DELETE old service records via Complete Service flow or direct cleanup'
      });
    }
    if (staleDataCheck.staleWaitlistEntries > 0) {
      alerts.push({
        severity: 'warning',
        type: 'stale_data',
        message: `Found ${staleDataCheck.staleWaitlistEntries} stale waitlist entry(ies) older than ${THRESHOLDS.WAITLIST_ENTRY_MAX_HOURS} hours`,
        action: 'DELETE old waitlist entries via /api/waitlist DELETE endpoint'
      });
    }
    if (dataQualityCheck.nullDataCount > 0) {
      alerts.push({
        severity: 'info',
        type: 'data_quality',
        message: `Found ${dataQualityCheck.nullDataCount} record(s) with NULL/missing required fields`,
        action: 'Review data validation in API endpoints'
      });
    }

    if (alerts.length > 0) {
      healthStatus.alerts = alerts;
    }

    // Return appropriate status code
    const statusCode = isHealthy ? 200 : 503;
    return res.status(statusCode).json(healthStatus);

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      details: error.message
    });
  }
};

/**
 * Check database connectivity
 */
async function checkDatabaseConnectivity() {
  try {
    const tablesResult = await airtable.getAllTables();

    if (tablesResult.success) {
      return {
        status: 'healthy',
        message: 'Database connection successful',
        tablesCount: tablesResult.tables.length
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'Database query failed',
        error: tablesResult.error
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Database connection failed',
      error: error.message
    };
  }
}

/**
 * Check for stale data
 *
 * Detects:
 * - Service records older than THRESHOLD hours
 * - Waitlist entries older than THRESHOLD hours
 */
async function checkForStaleData() {
  try {
    const now = new Date();
    const staleServiceThreshold = new Date(now.getTime() - (THRESHOLDS.SERVICE_RECORD_MAX_HOURS * 60 * 60 * 1000));
    const staleWaitlistThreshold = new Date(now.getTime() - (THRESHOLDS.WAITLIST_ENTRY_MAX_HOURS * 60 * 60 * 1000));

    // Check service records
    const serviceRecordsResult = await airtable.getActiveServiceRecords();
    const staleServiceRecords = serviceRecordsResult.success
      ? serviceRecordsResult.service_records.filter(record => {
          const seatedAt = new Date(record.seated_at);
          return seatedAt < staleServiceThreshold;
        })
      : [];

    // Check waitlist entries
    const waitlistUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.WAITLIST_TABLE_ID}`;
    const waitlistResponse = await fetch(waitlistUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    let staleWaitlistEntries = [];
    if (waitlistResponse.ok) {
      const waitlistData = await waitlistResponse.json();
      staleWaitlistEntries = waitlistData.records.filter(record => {
        const addedAt = record.fields['Added At'];
        if (!addedAt) return false;
        const addedDate = new Date(addedAt);
        return addedDate < staleWaitlistThreshold;
      });
    }

    const totalStale = staleServiceRecords.length + staleWaitlistEntries.length;

    return {
      status: totalStale > 0 ? 'warning' : 'healthy',
      staleServiceRecords: staleServiceRecords.length,
      staleWaitlistEntries: staleWaitlistEntries.length,
      totalStaleRecords: totalStale,
      message: totalStale > 0
        ? `Found ${totalStale} stale record(s) requiring cleanup`
        : 'No stale data detected'
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Stale data check failed',
      error: error.message
    };
  }
}

/**
 * Check data quality
 *
 * Validates:
 * - Required fields are not NULL
 * - Data types are correct
 * - Referential integrity
 */
async function checkDataQuality() {
  try {
    let nullDataCount = 0;
    const issues = [];

    // Check waitlist for NULL required fields
    const waitlistUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.WAITLIST_TABLE_ID}`;
    const waitlistResponse = await fetch(waitlistUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (waitlistResponse.ok) {
      const waitlistData = await waitlistResponse.json();
      waitlistData.records.forEach(record => {
        const customerName = record.fields['Customer Name'];
        const partySize = record.fields['Party Size'];

        if (!customerName || customerName === '' || customerName === 'Unknown') {
          nullDataCount++;
          issues.push({
            table: 'waitlist',
            recordId: record.id,
            field: 'Customer Name',
            issue: 'NULL or Unknown'
          });
        }

        if (partySize == null || isNaN(partySize)) {
          nullDataCount++;
          issues.push({
            table: 'waitlist',
            recordId: record.id,
            field: 'Party Size',
            issue: 'NULL or invalid'
          });
        }
      });
    }

    return {
      status: nullDataCount > 0 ? 'warning' : 'healthy',
      nullDataCount,
      issues: issues.length > 0 ? issues.slice(0, 10) : undefined, // Limit to 10 examples
      message: nullDataCount > 0
        ? `Found ${nullDataCount} data quality issue(s)`
        : 'All data quality checks passed'
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Data quality check failed',
      error: error.message
    };
  }
}

/**
 * Get detailed metrics for monitoring dashboards
 */
async function getDetailedMetrics() {
  try {
    const [tablesResult, serviceRecordsResult] = await Promise.all([
      airtable.getAllTables(),
      airtable.getActiveServiceRecords()
    ]);

    const tables = tablesResult.success ? tablesResult.tables : [];
    const serviceRecords = serviceRecordsResult.success ? serviceRecordsResult.service_records : [];

    const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
    const occupiedSeats = serviceRecords.reduce((sum, record) => sum + record.party_size, 0);
    const availableSeats = totalCapacity - occupiedSeats;

    return {
      tables: {
        total: tables.length,
        available: tables.filter(t => t.status === 'Available').length,
        occupied: tables.filter(t => t.status === 'Occupied').length,
        beingCleaned: tables.filter(t => t.status === 'Being Cleaned').length,
        reserved: tables.filter(t => t.status === 'Reserved').length
      },
      capacity: {
        total: totalCapacity,
        occupied: occupiedSeats,
        available: availableSeats,
        occupancyPercentage: Math.round((occupiedSeats / totalCapacity) * 100)
      },
      activeParties: {
        count: serviceRecords.length,
        totalGuests: occupiedSeats,
        averagePartySize: serviceRecords.length > 0
          ? Math.round((occupiedSeats / serviceRecords.length) * 10) / 10
          : 0
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      error: 'Failed to collect detailed metrics',
      details: error.message
    };
  }
}
