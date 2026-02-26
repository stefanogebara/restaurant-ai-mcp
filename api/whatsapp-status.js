// WhatsApp integration status check
// Returns Meta Cloud API approval status + Twilio configuration status

const { verifyAuth } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await verifyAuth(req);
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ error: authResult.error });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  const result = {
    meta: {
      configured: !!(phoneNumberId && accessToken),
      approved: false,
      phone_number: null,
      display_name: null,
      quality_rating: null,
      error: null
    },
    twilio: {
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    }
  };

  if (result.meta.configured) {
    try {
      const url = `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating&access_token=${accessToken}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        result.meta.error = data.error.message || 'Meta API error';
        result.meta.approved = false;
      } else {
        result.meta.approved = true;
        result.meta.phone_number = data.display_phone_number || null;
        result.meta.display_name = data.verified_name || null;
        result.meta.quality_rating = data.quality_rating || null;
      }
    } catch (err) {
      result.meta.error = err.message;
      result.meta.approved = false;
    }
  }

  return res.status(200).json(result);
};
