/**
 * GET /api/get-current-datetime
 *
 * Returns the current date and time in multiple formats.
 * This endpoint helps the AI agent understand what "today" and "tomorrow" mean.
 *
 * No parameters required.
 *
 * Response format:
 * {
 *   "success": true,
 *   "timestamp": "2025-10-12T14:30:45.123Z",
 *   "date": "2025-10-12",
 *   "time": "14:30",
 *   "datetime": "2025-10-12 14:30:45",
 *   "day_of_week": "Sunday",
 *   "timezone": "UTC",
 *   "relative_dates": {
 *     "today": "2025-10-12",
 *     "tomorrow": "2025-10-13",
 *     "yesterday": "2025-10-11"
 *   }
 * }
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('DateTime');

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit (60 req/min)
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  // Accept both GET and POST requests (ElevenLabs webhooks use POST)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: true,
      message: 'Method not allowed. Use GET or POST.'
    });
  }

  try {
    // Get timezone from query param, body, or default to UTC
    const timezone = req.query?.timezone || req.body?.timezone || 'UTC';

    // L-20: Validate timezone to prevent invalid timezone strings from throwing
    if (timezone !== 'UTC') {
      let valid = false;
      try {
        // Intl.supportedValuesOf is available in Node 18+
        if (typeof Intl.supportedValuesOf === 'function') {
          const supported = Intl.supportedValuesOf('timeZone');
          valid = supported.includes(timezone);
        } else {
          // Fallback: try to use the timezone — if it throws, it's invalid
          Intl.DateTimeFormat(undefined, { timeZone: timezone });
          valid = true;
        }
      } catch {
        valid = false;
      }

      if (!valid) {
        return res.status(400).json({
          success: false,
          error: true,
          message: `Invalid timezone: "${timezone}". Use IANA timezone names like "America/Sao_Paulo" or "UTC".`
        });
      }
    }

    const now = new Date();

    // Format date as YYYY-MM-DD
    const formatDate = (date) => {
      return date.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA gives YYYY-MM-DD
    };

    // Format time as HH:MM (24-hour)
    const formatTime = (date) => {
      return date.toLocaleTimeString('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    };

    // Get day of week
    const getDayOfWeek = (date) => {
      return date.toLocaleDateString('en-US', {
        timeZone: timezone,
        weekday: 'long'
      });
    };

    // Calculate relative dates
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Build response
    const response = {
      success: true,
      timestamp: now.toISOString(),
      date: formatDate(now),
      time: formatTime(now),
      datetime: `${formatDate(now)} ${formatTime(now)}`,
      day_of_week: getDayOfWeek(now),
      timezone: timezone,
      relative_dates: {
        today: formatDate(now),
        tomorrow: formatDate(tomorrow),
        yesterday: formatDate(yesterday),
        next_week: formatDate(nextWeek)
      },
      unix_timestamp: Math.floor(now.getTime() / 1000)
    };

    return res.status(200).json(response);

  } catch (error) {
    logger.error('Error getting current datetime:', error);

    return res.status(500).json({
      success: false,
      error: true,
      message: 'Failed to get current date/time',
      details: 'An unexpected error occurred'
    });
  }
};
