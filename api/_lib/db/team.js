/**
 * Team member operations
 * Extracted from supabase.js
 */

const { supabaseAdmin } = require('./clients');

// ─── Team Members ────────────────────────────────────────────────────────────

const VALID_ROLES = ['owner', 'manager', 'host', 'staff'];

const getTeamMembers = async (restaurantId) => {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .select('id, email, role, status, user_id, created_at, invite_expires_at')
    .eq('restaurant_id', restaurantId)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, members: data };
};

const addTeamMember = async (restaurantId, { email, role, invitedBy }) => {
  if (!VALID_ROLES.includes(role) || role === 'owner') {
    throw new Error(`Invalid role: ${role}`);
  }

  const crypto = require('crypto');
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .upsert(
      {
        restaurant_id: restaurantId,
        email: email.toLowerCase().trim(),
        role,
        status: 'pending',
        invited_by: invitedBy,
        invite_token: inviteToken,
        invite_expires_at: inviteExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'restaurant_id,email', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

const updateTeamMemberRole = async (restaurantId, memberId, newRole) => {
  if (!VALID_ROLES.includes(newRole) || newRole === 'owner') {
    throw new Error(`Invalid role: ${newRole}`);
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

const removeTeamMember = async (restaurantId, memberId) => {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

const acceptInvite = async (inviteToken, userId) => {
  const { data: invite, error: findError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .select('id, restaurant_id, invite_expires_at, status')
    .eq('invite_token', inviteToken)
    .eq('status', 'pending')
    .single();

  if (findError || !invite) return { success: false, error: 'Invalid or expired invitation' };
  if (new Date(invite.invite_expires_at) < new Date()) {
    return { success: false, error: 'Invitation has expired' };
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .update({
      user_id: userId,
      status: 'active',
      invite_token: null,
      invite_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

module.exports = {
  getTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  acceptInvite,
};
