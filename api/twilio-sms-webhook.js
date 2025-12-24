/**
 * Twilio SMS Webhook
 * Receives incoming SMS messages and logs them to Supabase
 * Used to capture Meta WhatsApp verification codes
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET request - retrieve logged messages
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching SMS logs:', error);
        return res.status(500).json({ error: 'Failed to fetch logs' });
      }

      return res.status(200).json({
        success: true,
        messages: data || [],
        count: data?.length || 0
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
