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
 *   "timezone": "Europe/Amsterdam",
 *   "relative_dates": {
 *     "today": "2025-10-12",
 *     "tomorrow": "2025-10-13",
 *     "yesterday": "2025-10-11"
 *   }
 * }
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  // Accept both GET and POST requests (ElevenLabs webhooks use POST)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: true,
      message: 'Method not allowed. Use GET or POST.'
    });
  }

  try {
    // Get current date/time in Amsterdam timezone
    const timezone = 'Europe/Amsterdam';
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
    console.error('Error getting current datetime:', error);

    return res.status(500).json({
      success: false,
      error: true,
      message: 'Failed to get current date/time',
      details: error.message
    });
  }
}
