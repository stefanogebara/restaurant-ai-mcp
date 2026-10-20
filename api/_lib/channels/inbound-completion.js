'use strict';

const { createHash } = require('node:crypto');
const { centralSupabase } = require('../central-supabase');

function markerKey(prefix, identity, messageId) {
  if (!identity?.provider || !identity?.receiver || !messageId) return null;
  return `${prefix}:${createHash('sha256')
    .update(`${identity.provider}\0${identity.receiver}\0${identity.senderPhone || ''}\0${messageId}`)
    .digest('hex')}`;
}

const completionKey = (identity, messageId) => markerKey('inbound', identity, messageId);
const sendKey = (identity, messageId) => markerKey('inbound-send', identity, messageId);
const rateBlockedKey = (identity, messageId) => markerKey('inbound-rate-blocked', identity, messageId);

async function wasRateBlocked(identity, messageId) {
  const key = rateBlockedKey(identity, messageId);
  if (!key || !centralSupabase) throw new Error('Inbound rate store unavailable');
  const { data, error } = await centralSupabase.from('whatsapp_message_dedup')
    .select('message_id').eq('message_id', key).maybeSingle();
  if (error) throw new Error(`Inbound rate-block lookup failed: ${error.code || 'database'}`);
  return !!data;
}

async function markRateBlocked(identity, messageId) {
  const key = rateBlockedKey(identity, messageId);
  if (!key || !centralSupabase) throw new Error('Inbound rate store unavailable');
  const { error } = await centralSupabase.from('whatsapp_message_dedup')
    .insert({ message_id: key });
  if (error && error.code !== '23505') {
    throw new Error(`Inbound rate-block write failed: ${error.code || 'database'}`);
  }
}

async function hasSendAttempt(identity, messageId) {
  const key = sendKey(identity, messageId);
  if (!key) return false;
  if (!centralSupabase) throw new Error('Inbound send store unavailable');
  const { data, error } = await centralSupabase.from('whatsapp_message_dedup')
    .select('message_id').eq('message_id', key).maybeSingle();
  if (error) throw new Error(`Inbound send lookup failed: ${error.code || 'database'}`);
  return !!data;
}

// An external send has no atomic transaction with Postgres. Reserve BEFORE
// calling Meta/Twilio so an accepted send cannot be repeated if the completion
// write fails. An uncertain result remains reserved for manual investigation.
async function reserveSendAttempt(identity, messageId) {
  const key = sendKey(identity, messageId);
  if (!key) throw new Error('Inbound message ID required for safe outbound send');
  if (!centralSupabase) throw new Error('Inbound send store unavailable');
  const { error } = await centralSupabase.from('whatsapp_message_dedup')
    .insert({ message_id: key });
  if (error) throw new Error(`Inbound send reservation failed: ${error.code || 'database'}`);
}

// Only use after an explicit provider rejection: a network timeout may have
// occurred AFTER the provider accepted the message and is not safe to replay.
async function releaseRejectedSend(identity, messageId) {
  const key = sendKey(identity, messageId);
  if (!key || !centralSupabase) throw new Error('Inbound send store unavailable');
  const { error } = await centralSupabase.from('whatsapp_message_dedup')
    .delete().eq('message_id', key);
  if (error) throw new Error(`Inbound send release failed: ${error.code || 'database'}`);
}

// Unlike isMessageDuplicate(), these markers mean processing COMPLETED.
// A transient error before completion must remain retryable by the provider.
async function wasCompleted(identity, messageId) {
  const key = completionKey(identity, messageId);
  if (!key) return false;
  if (!centralSupabase) throw new Error('Inbound completion store unavailable');
  const { data, error } = await centralSupabase.from('whatsapp_message_dedup')
    .select('message_id').eq('message_id', key).maybeSingle();
  if (error) throw new Error(`Inbound completion lookup failed: ${error.code || 'database'}`);
  return !!data;
}

async function markCompleted(identity, messageId) {
  const key = completionKey(identity, messageId);
  if (!key) return;
  if (!centralSupabase) throw new Error('Inbound completion store unavailable');
  const { error } = await centralSupabase.from('whatsapp_message_dedup')
    .insert({ message_id: key });
  if (error && error.code !== '23505') {
    throw new Error(`Inbound completion write failed: ${error.code || 'database'}`);
  }
}

// Rate limiting counts each provider message once, even when delivery or the
// session fails and the provider retries that same message ID.
async function claimRateCount(identity, messageId) {
  const key = markerKey('inbound-rate', identity, messageId);
  if (!key) return true;
  if (!centralSupabase) throw new Error('Inbound rate marker store unavailable');
  const { error } = await centralSupabase.from('whatsapp_message_dedup')
    .insert({ message_id: key });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`Inbound rate marker write failed: ${error.code || 'database'}`);
}

module.exports = { completionKey, sendKey, hasSendAttempt, reserveSendAttempt,
  releaseRejectedSend, wasCompleted, markCompleted, claimRateCount,
  wasRateBlocked, markRateBlocked };
