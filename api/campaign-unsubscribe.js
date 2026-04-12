/**
 * Campaign Unsubscribe Endpoint
 *
 * GET: Renders unsubscribe confirmation page (simple HTML)
 * POST: Records opt-out in customer_consent table
 *
 * Uses HMAC signature to prevent abuse.
 * Query params: rid (restaurant_id), phone (customer_phone), sig (HMAC signature)
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('campaign-unsubscribe');

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * Verify the HMAC signature on the unsubscribe link.
 */
function verifySignature(restaurantId, phone, sig) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is not configured');
  const payload = `${restaurantId}:${phone}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

function he(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * GET: Render unsubscribe confirmation page.
 */
async function handleGet(req, res) {
  const { rid, phone, sig } = req.query || {};

  if (!rid || !phone || !sig) {
    return res.status(400).send(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false));
  }

  try {
    if (!verifySignature(rid, phone, sig)) {
      return res.status(403).send(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false));
    }
  } catch {
    return res.status(403).send(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false));
  }

  // Render confirmation page with a form that POSTs back
  const html = renderPage(
    'Unsubscribe from Marketing Emails',
    'Are you sure you want to unsubscribe? You will no longer receive marketing emails from this restaurant.',
    true,
    rid,
    phone,
    sig,
  );

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}

/**
 * POST: Process unsubscribe and record opt-out.
 */
async function handlePost(req, res) {
  const { rid, phone, sig } = req.body || req.query || {};

  if (!rid || !phone || !sig) {
    return res.status(400).send(renderPage('Error', 'Missing required parameters.', false));
  }

  try {
    if (!verifySignature(rid, phone, sig)) {
      return res.status(403).send(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false));
    }
  } catch {
    return res.status(403).send(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false));
  }

  try {
    // Record opt-out in customer_consent
    const { error } = await supabaseAdmin
      .from('customer_consent')
      .upsert({
        restaurant_id: rid,
        customer_phone: phone,
        consent_type: 'marketing',
        opted_in: false,
        opted_out_at: new Date().toISOString(),
      }, { onConflict: 'restaurant_id,customer_phone,consent_type' });

    if (error) {
      logger.error('Failed to record unsubscribe', { error: error.message });
      return res.status(500).send(renderPage('Error', 'Something went wrong. Please try again later.', false));
    }

    // Also cancel any pending campaign recipients
    await supabaseAdmin
      .from('campaign_recipients')
      .update({ status: 'opted_out' })
      .eq('restaurant_id', rid)
      .eq('customer_phone', phone)
      .eq('status', 'pending');

    logger.info('Customer unsubscribed via email link', {
      restaurantId: rid,
      phone: phone.slice(0, 4) + '***',
    });

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(renderPage(
      'Unsubscribed',
      'You have been successfully unsubscribed from marketing emails. You will no longer receive promotional messages from this restaurant.',
      false,
    ));
  } catch (err) {
    logger.error('Unsubscribe error', { error: err.message });
    return res.status(500).send(renderPage('Error', 'Something went wrong. Please try again later.', false));
  }
}

/**
 * Render a simple branded HTML page.
 */
function renderPage(title, message, showForm, rid, phone, sig) {
  const formHtml = showForm ? `
    <form method="POST" action="/api/campaign-unsubscribe" style="margin-top: 24px;">
      <input type="hidden" name="rid" value="${he(rid)}" />
      <input type="hidden" name="phone" value="${he(phone)}" />
      <input type="hidden" name="sig" value="${he(sig)}" />
      <button type="submit"
        style="background: #9F1239; color: #fff; padding: 12px 32px; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
        Confirm Unsubscribe
      </button>
    </form>
    <p style="color: #A8A29E; font-size: 13px; margin-top: 16px;">
      Changed your mind? Simply close this page.
    </p>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${he(title)} - Seatable</title>
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; background: #FAFAF9; }
    .container { max-width: 480px; margin: 80px auto; padding: 40px 24px; text-align: center; }
    .logo { font-size: 28px; color: #1C1917; font-family: Georgia, serif; margin-bottom: 32px; }
    .logo span { color: #9F1239; }
    h1 { font-size: 22px; color: #1C1917; margin: 0 0 16px 0; }
    p { color: #57534E; font-size: 15px; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Seatable<span>.</span></div>
    <h1>${he(title)}</h1>
    <p>${he(message)}</p>
    ${formHtml}
  </div>
</body>
</html>`;
}
