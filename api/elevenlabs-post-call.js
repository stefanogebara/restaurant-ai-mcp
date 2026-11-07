/** Signed ElevenLabs post-call transcription receiver (configure in workspace settings). */
const crypto = require('crypto');
const { ingestCompletedConversation } = require('./_services/conversationLogger');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('ElevenLabsPostCall');
const MAX_BODY_BYTES = 4 * 1024 * 1024;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook not configured' });

  let raw;
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) return res.status(413).json({ error: 'Payload too large' });
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks);
  } catch (_) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  const signature = req.headers['elevenlabs-signature'] || '';
  const match = /^t=(\d+),v0=([a-f0-9]{64})$/i.exec(signature);
  if (!match || Math.abs(Date.now() / 1000 - Number(match[1])) > 30 * 60) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const expected = crypto.createHmac('sha256', secret).update(match[1]).update('.').update(raw).digest();
  const received = Buffer.from(match[2], 'hex');
  if (!crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (_) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event.type !== 'post_call_transcription') return res.status(200).json({ received: true });
  if (!event.data?.conversation_id || !event.data?.agent_id || !['done', 'failed'].includes(event.data.status)) {
    return res.status(400).json({ error: 'Invalid conversation' });
  }

  try {
    await ingestCompletedConversation(event.data);
    return res.status(200).json({ received: true });
  } catch (_) {
    // ElevenLabs retries 5xx when retries are enabled. Do not log payloads or provider text.
    logger.error('Post-call ingestion failed');
    return res.status(500).json({ error: 'Ingestion failed' });
  }
};

module.exports.config = { api: { bodyParser: false } };
