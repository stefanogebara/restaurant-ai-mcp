'use strict';

const { createHash } = require('node:crypto');
const { centralSupabase } = require('../central-supabase');
const { supabaseAdmin } = require('../supabase');

function replyKey(identity, messageId) {
  if (!identity?.provider || !identity?.receiver || !messageId) return null;
  return `inbound-reply:${createHash('sha256')
    .update(`${identity.provider}\0${identity.receiver}\0${identity.senderPhone || ''}\0${messageId}`)
    .digest('hex')}`;
}

async function getPendingReply(identity, messageId) {
  const key = replyKey(identity, messageId);
  if (!key || !centralSupabase) throw new Error('Inbound reply store unavailable');
  const { data, error } = await centralSupabase.from('whatsapp_inbound_replies')
    .select('reply_text,purpose,restaurant_id').eq('inbound_key', key).maybeSingle();
  if (error) throw new Error(`Inbound reply lookup failed: ${error.code || 'database'}`);
  return data;
}

async function savePendingReply(identity, messageId, replyText, purpose, restaurantId = null) {
  const key = replyKey(identity, messageId);
  if (!key || !centralSupabase || !replyText || !purpose) {
    throw new Error('Invalid inbound reply reservation');
  }
  const { error } = await centralSupabase.from('whatsapp_inbound_replies')
    .insert({ inbound_key: key, reply_text: replyText, purpose, restaurant_id: restaurantId });
  if (error && error.code !== '23505') {
    throw new Error(`Inbound reply write failed: ${error.code || 'database'}`);
  }
}

async function getRecordedRating(identity, messageId, restaurantId) {
  const key = replyKey(identity, messageId);
  if (!key || !restaurantId) return null;
  const feedback = await supabaseAdmin.from('guest_feedback')
    .select('rating,comment').eq('whatsapp_inbound_key', key)
    .eq('restaurant_id', restaurantId).maybeSingle();
  if (feedback.error) throw new Error('Recorded feedback lookup failed');
  if (feedback.data) return { ...feedback.data, purpose: 'feedback' };
  const survey = await supabaseAdmin.schema('restaurant').from('survey_responses')
    .select('rating,comment').eq('whatsapp_inbound_key', key)
    .eq('restaurant_id', restaurantId).maybeSingle();
  if (survey.error) throw new Error('Recorded survey lookup failed');
  return survey.data ? { ...survey.data, purpose: 'pesquisa' } : null;
}

module.exports = { replyKey, getPendingReply, savePendingReply, getRecordedRating };
