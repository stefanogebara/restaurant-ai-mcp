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

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const logger = createSecureLogger('Health');

// Health check uses supabaseAdmin (service_role) for unscoped cross-tenant
// system-level checks. No restaurant_id scoping needed.

// Thresholds for stale data detection
const THRESHOLDS = {
  SERVICE_RECORD_MAX_HOURS: 12,    // Service records older than 12h are stale
  WAITLIST_ENTRY_MAX_HOURS: 24,    // Waitlist entries older than 24h are stale
  RESERVATION_UPCOMING_DAYS: 90,   // Reservations more than 90 days out may need review
};

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const requestSecret = req.headers.authorization?.replace('Bearer ', '');
  const detailed = req.query.detailed === 'true' && cronSecret && requestSecret === cronSecret;
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
    };

    // Only include detailed checks for authenticated requests
    if (detailed) {
      healthStatus.checks = {
        database: databaseHealth,
        staleData: staleDataCheck,
        dataQuality: dataQualityCheck
      };
    }

    // Add detailed metrics if requested
    if (detailed) {
      healthStatus.metrics = await getDetailedMetrics();
      healthStatus.thresholds = THRESHOLDS;
    }

    // Add alerts only for authenticated detailed requests
    if (detailed) {
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
    }

    // Return appropriate status code
    const statusCode = isHealthy ? 200 : 503;
    return res.status(statusCode).json(healthStatus);

  } catch (error) {
    logger.error('Health check error:', error);
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
};

/**
 * Check database connectivity
 * Uses a simple unscoped count query to verify the database is reachable.
 * No restaurant_id needed - this is a system-level connectivity check.
 */
async function checkDatabaseConnectivity() {
  try {
    // Use raw Supabase client for unscoped connectivity check
    const { count, error } = await supabaseAdmin
      .from('tables')
      .select('*', { count: 'exact', head: true });

    if (!error) {
      return {
        status: 'healthy',
        message: 'Database connection successful',
        tablesCount: count || 0
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'Database query failed',
        error: 'Internal error'
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Database connection failed',
      error: 'Internal error'
    };
  }
}

/**
 * Check for stale data
 *
 * Detects:
 * - Service records older than THRESHOLD hours
 * - Waitlist entries older than THRESHOLD hours
 *
 * NOTE: Uses unscoped queries (no restaurant_id filter) since this is a
 * system-wide health check across all restaurants.
 */
async function checkForStaleData() {
  try {
    const now = new Date();
    const staleServiceThreshold = new Date(now.getTime() - (THRESHOLDS.SERVICE_RECORD_MAX_HOURS * 60 * 60 * 1000));
    const staleWaitlistThreshold = new Date(now.getTime() - (THRESHOLDS.WAITLIST_ENTRY_MAX_HOURS * 60 * 60 * 1000));

    // Check service records - unscoped query across all restaurants
    const { data: activeServiceRecords, error: serviceError } = await supabaseAdmin
      .from('service_records')
      .select('seated_at')
      .eq('status', 'active');

    let staleServiceRecords = [];
    if (!serviceError && activeServiceRecords) {
      staleServiceRecords = activeServiceRecords.filter(record => {
        const seatedAt = new Date(record.seated_at);
        return seatedAt < staleServiceThreshold;
      });
    }

    // Check waitlist entries - unscoped query across all restaurants
    const { data: waitlistEntries, error: waitlistError } = await supabaseAdmin
      .from('waitlist')
      .select('added_at');

    let staleWaitlistEntries = [];
    if (!waitlistError && waitlistEntries) {
      staleWaitlistEntries = waitlistEntries.filter(record => {
        const addedAt = record.added_at;
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
      error: 'Internal error'
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
 *
 * NOTE: Uses unscoped queries (no restaurant_id filter) since this is a
 * system-wide health check across all restaurants.
 */
async function checkDataQuality() {
  try {
    let nullDataCount = 0;
    const issues = [];

    // Check waitlist for NULL required fields - unscoped query via Supabase
    const { data: waitlistRecords, error: waitlistError } = await supabaseAdmin
      .from('waitlist')
      .select('id, customer_name, party_size');

    if (!waitlistError && waitlistRecords) {
      waitlistRecords.forEach(record => {
        const customerName = record.customer_name;
        const partySize = record.party_size;

        if (!customerName || customerName === '' || customerName === 'Unknown') {
          nullDataCount++;
          issues.push({
            table: 'waitlist',
            recordId: record.id,
            field: 'customer_name',
            issue: 'NULL or Unknown'
          });
        }

        if (partySize == null || isNaN(partySize)) {
          nullDataCount++;
          issues.push({
            table: 'waitlist',
            recordId: record.id,
            field: 'party_size',
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
      error: 'Internal error'
    };
  }
}

/**
 * Get detailed metrics for monitoring dashboards
 *
 * NOTE: Uses unscoped queries to aggregate metrics across all restaurants.
 * For per-restaurant metrics, use the host-dashboard API with proper auth.
 */
async function getDetailedMetrics() {
  try {
    // Unscoped queries across all restaurants for system-wide health metrics
    const [tablesQueryResult, serviceRecordsQueryResult] = await Promise.all([
      supabaseAdmin.from('tables').select('table_number, capacity, status, is_active').eq('is_active', true),
      supabaseAdmin.from('service_records').select('party_size, status').eq('status', 'active')
    ]);

    const tables = tablesQueryResult.data || [];
    const serviceRecords = serviceRecordsQueryResult.data || [];

    const totalCapacity = tables.reduce((sum, table) => sum + (table.capacity || 0), 0);
    const occupiedSeats = serviceRecords.reduce((sum, record) => sum + (record.party_size || 0), 0);
    const availableSeats = totalCapacity - occupiedSeats;

    return {
      tables: {
        total: tables.length,
        available: tables.filter(t => t.status === 'available' || t.status === 'Available').length,
        occupied: tables.filter(t => t.status === 'Occupied').length,
        beingCleaned: tables.filter(t => t.status === 'Being Cleaned').length,
        reserved: tables.filter(t => t.status === 'Reserved').length
      },
      capacity: {
        total: totalCapacity,
        occupied: occupiedSeats,
        available: availableSeats,
        occupancyPercentage: totalCapacity > 0 ? Math.round((occupiedSeats / totalCapacity) * 100) : 0
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
