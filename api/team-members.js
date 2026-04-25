/**
 * Team Members API
 *
 * GET    /api/team-members  — list all members for the restaurant
 * POST   /api/team-members  — invite a new member (owner only)
 * PATCH  /api/team-members  — update role (owner only)
 * DELETE /api/team-members  — remove member (owner only)
 */

const { verifyAuth } = require('./_lib/auth');
const { getTeamMembers, addTeamMember, updateTeamMemberRole, removeTeamMember } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { sendInviteEmail } = require('./_lib/email');
const { initSentry, captureException } = require('./_lib/sentry');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

initSentry();
const logger = createSecureLogger('TeamMembers');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rateLimited = await checkAndApplyRateLimit(req, res, 'team_members', 30, 60);
  if (rateLimited) return;

  const { user, error: authError, status: authStatus } = await verifyAuth(req);
  if (authError) return res.status(authStatus).json({ success: false, error: authError });

  const restaurantId = user.restaurant_id;

  try {
    if (req.method === 'GET') {
      const result = await getTeamMembers(restaurantId);
      if (!result.success) return res.status(500).json({ success: false, error: result.error });
      return res.status(200).json({ success: true, members: result.members });
    }

    if (user.role !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only restaurant owners can manage team members' });
    }

    if (req.method === 'POST') {
      const { email, role } = req.body || {};
      if (!email || !role) {
        return res.status(400).json({ success: false, error: 'email and role are required' });
      }

      const result = await addTeamMember(restaurantId, { email, role, invitedBy: user.sub });
      if (!result.success) return res.status(400).json({ success: false, error: result.error });

      const inviteUrl = `${process.env.CLIENT_URL || 'https://seatable.one'}/join?token=${result.member.invite_token}`;
      // Await so Vercel doesn't kill the Lambda mid-Resend (same shape as
      // booking confirmation race fixed in a39320c0). Wrapped in race+timeout
      // to bound worst-case latency.
      await Promise.race([
        sendInviteEmail({ to: email, inviteUrl, role }).catch(err => {
          logger.error('Failed to send invite email:', err.message);
        }),
        new Promise(resolve => setTimeout(resolve, 6000)),
      ]);

      logger.info(`Team member invited: ${email} as ${role}`);
      return res.status(201).json({ success: true, member: result.member });
    }

    if (req.method === 'PATCH') {
      const { memberId, role } = req.body || {};
      if (!memberId || !role) {
        return res.status(400).json({ success: false, error: 'memberId and role are required' });
      }
      const result = await updateTeamMemberRole(restaurantId, memberId, role);
      if (!result.success) return res.status(400).json({ success: false, error: result.error });
      return res.status(200).json({ success: true, member: result.member });
    }

    if (req.method === 'DELETE') {
      const { memberId } = req.body || {};
      if (!memberId) {
        return res.status(400).json({ success: false, error: 'memberId is required' });
      }
      const result = await removeTeamMember(restaurantId, memberId);
      if (!result.success) return res.status(400).json({ success: false, error: result.error });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    captureException(err);
    logger.error('Team members error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
