/**
 * Contact Form Submission
 *
 * Receives { name, email, phone, restaurant, tables, message }.
 * Saves to Supabase `contacts` table and sends a Resend email alert
 * to hello@seatable.one so the owner never misses a new lead.
 */

const { Resend } = require('resend');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('Contact');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const { name, email, phone, restaurant, tables, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email, and message are required' });
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Length caps — prevent a malicious caller from POSTing a 10MB message
  // and forcing an expensive Resend email send / a huge DB row. The
  // server has the final word; the form should also enforce these.
  const LIMITS = { name: 120, email: 254, phone: 32, restaurant: 200, message: 5000 };
  const lengthErrors = [];
  if (typeof name === 'string' && name.length > LIMITS.name) lengthErrors.push(`name must be ${LIMITS.name} characters or less`);
  if (typeof email === 'string' && email.length > LIMITS.email) lengthErrors.push(`email must be ${LIMITS.email} characters or less`);
  if (typeof phone === 'string' && phone.length > LIMITS.phone) lengthErrors.push(`phone must be ${LIMITS.phone} characters or less`);
  if (typeof restaurant === 'string' && restaurant.length > LIMITS.restaurant) lengthErrors.push(`restaurant must be ${LIMITS.restaurant} characters or less`);
  if (typeof message === 'string' && message.length > LIMITS.message) lengthErrors.push(`message must be ${LIMITS.message} characters or less`);
  if (lengthErrors.length > 0) {
    return res.status(400).json({ error: lengthErrors[0], details: lengthErrors });
  }

  // Save to DB (non-fatal if it fails — email alert is the priority)
  try {
    await supabaseAdmin.from('contacts').insert({
      name,
      email,
      phone: phone || null,
      restaurant: restaurant || null,
      tables: tables ? parseInt(tables, 10) : null,
      message,
    });
  } catch (err) {
    logger.warn('Failed to save contact to DB:', err.message);
  }

  // Send email alert via Resend
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'noreply@seatable.one',
      to: 'hello@seatable.one',
      subject: `New contact: ${escapeHtml(name)} — ${escapeHtml(restaurant) || 'no restaurant'}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Email:</b> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        <p><b>Phone:</b> ${escapeHtml(phone) || '—'}</p>
        <p><b>Restaurant:</b> ${escapeHtml(restaurant) || '—'}</p>
        <p><b>Tables:</b> ${escapeHtml(tables) || '—'}</p>
        <hr />
        <p><b>Message:</b></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>
      `,
    });
  } catch (err) {
    logger.error('Failed to send contact email via Resend:', err.message);
    // Still return success — contact was saved to DB
  }

  return res.status(200).json({ ok: true });
};
