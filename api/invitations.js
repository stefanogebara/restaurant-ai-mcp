/**
 * Invitations API
 *
 * GET  /api/invitations?token=xxx — validate token (no auth, preflight check)
 * POST /api/invitations            — accept invite (requires auth)
 */

const { verifyAuth } = require('./_lib/auth');
const { acceptInvite, supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { initSentry, captureException } = require('./_lib/sentry');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

initSentry();
const logger = createSecureLogger('Invitations');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const token = req.query?.token;
      if (!token) return res.status(400).json({ success: false, error: 'token is required' });

      const { data, error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_members')
        .select('email, role, invite_expires_at')
        .eq('invite_token', token)
        .eq('status', 'pending')
        .single();

      if (error || !data) return res.status(404).json({ success: false, error: 'Invalid invitation' });
      if (new Date(data.invite_expires_at) < new Date()) {
        return res.status(410).json({ success: false, error: 'Invitation expired' });
      }

      return res.status(200).json({ success: true, email: data.email, role: data.role });
    }

    if (req.method === 'POST') {
      const { user, error: authError, status: authStatus } = await verifyAuth(req);
      if (authError) return res.status(authStatus).json({ success: false, error: authError });

      const { token } = req.body || {};
      if (!token) return res.status(400).json({ success: false, error: 'token is required' });

      const result = await acceptInvite(token, user.sub);
      if (!result.success) return res.status(400).json({ success: false, error: result.error });

      logger.info(`Invite accepted by ${user.email} for restaurant ${result.member.restaurant_id}`);
      return res.status(200).json({ success: true, member: result.member });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    captureException(err);
    logger.error('Invitations error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
