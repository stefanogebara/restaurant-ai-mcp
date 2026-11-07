const crypto = require('crypto');
const { Readable } = require('stream');

process.env.ELEVENLABS_WEBHOOK_SECRET = 'post-call-test-secret';
const mockIngestCompletedConversation = jest.fn().mockResolvedValue({ ingested: true });
jest.mock('../_services/conversationLogger', () => ({ ingestCompletedConversation: (...args) => mockIngestCompletedConversation(...args) }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
const handler = require('../elevenlabs-post-call');

function request(payload, { signature = true, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(payload);
  const digest = crypto.createHmac('sha256', process.env.ELEVENLABS_WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`).digest('hex');
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST';
  req.headers = signature ? { 'elevenlabs-signature': `t=${timestamp},v0=${digest}` } : {};
  return req;
}
function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const payload = { type: 'post_call_transcription', data: { agent_id: 'agent-1', conversation_id: 'conv-1', status: 'done', transcript: [] } };

beforeEach(() => mockIngestCompletedConversation.mockClear());

test('accepts only a fresh signature over the exact raw body', async () => {
  const res = response();
  await handler(request(payload), res);
  expect(mockIngestCompletedConversation).toHaveBeenCalledWith(payload.data);
  expect(res.status).toHaveBeenCalledWith(200);
});

test('rejects missing and stale signatures', async () => {
  for (const options of [{ signature: false }, { timestamp: Math.floor(Date.now() / 1000) - 3600 }]) {
    const res = response();
    await handler(request(payload, options), res);
    expect(res.status).toHaveBeenCalledWith(401);
  }
  expect(mockIngestCompletedConversation).not.toHaveBeenCalled();
});

test('ignores signed audio payloads without logging or ingesting them', async () => {
  const res = response();
  await handler(request({ type: 'post_call_audio', data: { full_audio: 'sensitive' } }), res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockIngestCompletedConversation).not.toHaveBeenCalled();
});

test('returns retryable error when persistence fails', async () => {
  mockIngestCompletedConversation.mockRejectedValueOnce(new Error('private provider detail'));
  const res = response();
  await handler(request(payload), res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ error: 'Ingestion failed' });
});
