/**
 * Twilio SMS Webhook
 * Receives incoming SMS messages and logs them to Supabase
 * Used to capture Meta WhatsApp verification codes
 *
 * Features:
 * - GET: JSON API or HTML viewer (based on Accept header or ?format=html)
 * - POST: Receive incoming SMS from Twilio
 * - Detailed logging with timestamps
 * - Auto-refresh HTML viewer
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Generate HTML viewer for SMS logs
function generateHtmlViewer(messages) {
  const messageRows = messages.map(msg => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${new Date(msg.created_at).toLocaleString()}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${msg.from_number || 'Unknown'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${msg.to_number || 'Unknown'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #059669;">${msg.body || ''}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${msg.from_city || ''} ${msg.from_state || ''} ${msg.from_country || ''}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>SMS Logs - Seatable</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #1f2937; margin-bottom: 8px; }
    .subtitle { color: #6b7280; margin-bottom: 24px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f9fafb; padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    .empty { padding: 48px; text-align: center; color: #9ca3af; }
    .refresh-badge { background: #10b981; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .code-highlight { background: #fef3c7; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>SMS Logs</h1>
        <p class="subtitle">Incoming SMS messages to +1 762-994-3997 (auto-refreshes every 10s)</p>
      </div>
      <span class="refresh-badge">Live</span>
    </div>
    <div class="card">
      ${messages.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>From</th>
              <th>To</th>
              <th>Message</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${messageRows}
          </tbody>
        </table>
      ` : `
        <div class="empty">
          <p>No SMS messages received yet.</p>
          <p style="font-size: 14px; margin-top: 8px;">Waiting for Meta WhatsApp verification code...</p>
        </div>
      `}
    </div>
    <p style="text-align: center; color: #9ca3af; margin-top: 16px; font-size: 14px;">
      Last updated: ${new Date().toLocaleString()}
    </p>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET request - retrieve logged messages (JSON or HTML)
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching SMS logs:', error);
        return res.status(500).json({ error: 'Failed to fetch logs' });
      }

      const messages = data || [];

      // Check if HTML format is requested
      const wantsHtml = req.query.format === 'html' ||
                        (req.headers.accept && req.headers.accept.includes('text/html') && !req.query.format);

      if (wantsHtml) {
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(generateHtmlViewer(messages));
      }

      return res.status(200).json({
        success: true,
        messages: messages,
        count: messages.length,
        last_updated: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST request - receive incoming SMS from Twilio
  if (req.method === 'POST') {
    try {
      // Twilio sends data as form-urlencoded
      const {
        From,
        To,
        Body,
        MessageSid,
        AccountSid,
        NumMedia,
        FromCity,
        FromState,
        FromCountry
      } = req.body;

      console.log('=== INCOMING SMS ===');
      console.log('From:', From);
      console.log('To:', To);
      console.log('Body:', Body);
      console.log('MessageSid:', MessageSid);
      console.log('====================');

      // Log to Supabase
      const { data, error } = await supabase
        .from('sms_logs')
        .insert([{
          from_number: From,
          to_number: To,
          body: Body,
          message_sid: MessageSid,
          account_sid: AccountSid,
          num_media: NumMedia ? parseInt(NumMedia) : 0,
          from_city: FromCity,
          from_state: FromState,
          from_country: FromCountry,
          created_at: new Date().toISOString()
        }])
        .select();

      if (error) {
        console.error('Error logging SMS:', error);
        // Still respond to Twilio even if logging fails
      }

      // Respond with TwiML (required by Twilio)
      // Empty response = don't send any reply SMS
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`);

    } catch (err) {
      console.error('Error processing SMS:', err);
      // Still respond to Twilio
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
