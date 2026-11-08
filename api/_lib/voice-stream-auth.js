'use strict';
const { randomBytes, createHash } = require('node:crypto');
const twilio = require('twilio');
const { createRedisClient } = require('./redis-client');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALL = /^CA[0-9a-f]{32}$/i;
const ACCOUNT = /^AC[0-9a-f]{32}$/i;
const STREAM = /^MZ[0-9a-f]{32}$/i;
const GRANT_SECONDS = 120;
// A webhook retry reuses its original capability and can never overwrite it.
// Keep the CallSid tombstone beyond Twilio's retry period; never release on close.
const CALL_REPLAY_SECONDS = 7 * 24 * 60 * 60;
let redis;
function denied() { return new Error('VOICE_STREAM_UNAUTHORIZED'); }
function unavailable() { return new Error('VOICE_STREAM_UNAVAILABLE'); }
function config() {
  const raw = process.env.VOICE_WS_URL;
  let url;
  try { url = new URL(raw); } catch { throw unavailable(); }
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/ws' || !process.env.TWILIO_AUTH_TOKEN || !ACCOUNT.test(process.env.TWILIO_ACCOUNT_SID || '')) throw unavailable();
  return { url: url.href, account: process.env.TWILIO_ACCOUNT_SID };
}
function store() {
  if (!redis) redis = createRedisClient('VoiceStreamGrant');
  // Unlike best-effort rate limiting, replay protection MUST NOT fall back locally.
  if (!redis) throw unavailable();
  return redis;
}
function verifyVoiceUpgrade(req) {
  try {
    const { url } = config();
    const signature = req.headers['x-twilio-signature'];
    if (req.method !== 'GET' || req.url !== '/ws' || typeof signature !== 'string' || signature.length > 128) return false;
    // Validate against configuration, never request Host or forwarded headers.
    // WSS is carried by an HTTPS upgrade; accept only these equivalent canonical
    // representations and Twilio's documented trailing-slash variation.
    const httpsUrl = url.replace(/^wss:/, 'https:');
    return [url, httpsUrl, `${url}/`, `${httpsUrl}/`].some(candidate =>
      twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, candidate, {}));
  } catch { return false; }
}
const ISSUE = `
local existing = redis.call('GET', KEYS[1])
if existing then return existing end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
return ARGV[1]`;
const CONSUME = `local grant = redis.call('GET', KEYS[1]); if grant then redis.call('DEL', KEYS[1]) end; return grant`;
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const digest = value => createHash('sha256').update(value).digest('hex');

async function issueVoiceStreamGrant({ restaurantId, callerNumber, callSid, accountSid, wsUrl }) {
  const configured = config();
  // Caller ID may be withheld. TwiML then sends an empty custom parameter,
  // which remains bound to this specific call and restaurant.
  const boundCallerNumber = callerNumber ?? '';
  if (typeof restaurantId !== 'string' || !UUID.test(restaurantId) || !CALL.test(callSid || '') ||
      accountSid !== configured.account || wsUrl !== configured.url || typeof boundCallerNumber !== 'string' ||
      boundCallerNumber.length > 64 || /[\x00-\x1f]/.test(boundCallerNumber)) throw denied();
  const binding = { restaurantId, callerNumber: boundCallerNumber, callSid, accountSid, wsUrl };
  const fingerprint = digest(JSON.stringify(binding));
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + GRANT_SECONDS * 1000;
  try {
    const issued = parse(await store().eval(ISSUE,
      [`voice:{${accountSid}:${callSid}}:issued`, `voice:{${accountSid}:${callSid}}:grant:${digest(token)}`],
      [JSON.stringify({ token, fingerprint, expiresAt }), JSON.stringify({ ...binding, expiresAt }), CALL_REPLAY_SECONDS, GRANT_SECONDS]));
    if (!issued || issued.fingerprint !== fingerprint || issued.expiresAt <= Date.now() ||
        typeof issued.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(issued.token)) throw denied();
    return issued.token;
  } catch { throw unavailable(); }
}

async function consumeVoiceStreamGrant(start) {
  const configured = config();
  const token = start?.customParameters?.stream_grant;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !STREAM.test(start?.streamSid || '') || !CALL.test(start?.callSid || '') ||
      start?.accountSid !== configured.account) throw denied();
  let grant;
  try { grant = parse(await store().eval(CONSUME, [`voice:{${start.accountSid}:${start.callSid}}:grant:${digest(token)}`], [])); }
  catch { throw unavailable(); }
  const params = start.customParameters;
  if (!grant || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now() ||
      typeof grant.restaurantId !== 'string' || !UUID.test(grant.restaurantId) || grant.wsUrl !== configured.url ||
      grant.callSid !== start.callSid || grant.accountSid !== start.accountSid ||
      grant.restaurantId !== params.restaurant_id || grant.callerNumber !== (params.caller_number ?? '') ||
      grant.callSid !== params.call_sid) throw denied();
  return { restaurantId: grant.restaurantId, callerNumber: grant.callerNumber, callSid: grant.callSid };
}
module.exports = { issueVoiceStreamGrant, consumeVoiceStreamGrant, verifyVoiceUpgrade };
