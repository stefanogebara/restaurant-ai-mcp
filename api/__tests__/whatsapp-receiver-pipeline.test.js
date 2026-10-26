'use strict';

const mockSessions = new Map();
const mockDemoConfigLookup = jest.fn(async () => ({ data: {
  is_demo: true, demo_expires_at: new Date(Date.now() + 86400000).toISOString() }, error: null }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { schema: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: (...a) => mockDemoConfigLookup(...a) }) }) }),
}) } }));
jest.mock('../_lib/channels/inbound-reply', () => ({
  getPendingReply: jest.fn().mockResolvedValue(null),
  savePendingReply: jest.fn().mockResolvedValue(undefined),
  getRecordedRating: jest.fn().mockResolvedValue(null),
  replyKey: jest.fn(() => 'inbound-reply:test'),
}));
jest.mock('../_lib/channels/inbound-completion', () => ({
  wasCompleted: jest.fn().mockResolvedValue(false),
  markCompleted: jest.fn().mockResolvedValue(undefined),
  wasRateBlocked: jest.fn().mockResolvedValue(false),
  markRateBlocked: jest.fn().mockResolvedValue(undefined),
  claimRateCount: jest.fn().mockResolvedValue(true),
  hasSendAttempt: jest.fn().mockResolvedValue(false),
  reserveSendAttempt: jest.fn().mockResolvedValue(undefined),
  releaseRejectedSend: jest.fn().mockResolvedValue(undefined),
}));
const mockGetOrCreate = jest.fn(async (phone, _conversationId, scope) => {
  const key = `${scope.provider}:${scope.receiver}:${phone}`;
  if (!mockSessions.has(key)) mockSessions.set(key, {
    id: key, sender_phone: phone, inbound_provider: scope.provider,
    inbound_receiver: scope.receiver, restaurant_id: null,
    conversation_history: [], expires_at: new Date(Date.now() + 300000).toISOString(),
  });
  return { ...mockSessions.get(key) };
});
const mockSetRestaurant = jest.fn(async (id, restaurantId) => {
  const updated = { ...mockSessions.get(id), restaurant_id: restaurantId };
  mockSessions.set(id, updated);
  return { ...updated };
});
const mockSaveHistory = jest.fn(async (id, history) => {
  mockSessions.set(id, { ...mockSessions.get(id), conversation_history: history });
  return true;
});
const mockAI = jest.fn(async (_message, session, history) => `${session.restaurant_id}|${history.length}`);
const mockDuplicate = jest.fn().mockResolvedValue(false);
const mockAcquire = jest.fn().mockResolvedValue(true);
const mockRelease = jest.fn().mockResolvedValue(undefined);
const mockRestaurants = [
  { id: 'house-a', restaurant_name: 'Casa A', whatsapp_phone_number_id: '11111111111' },
  { id: 'house-b', restaurant_name: 'Casa B', whatsapp_phone_number_id: '22222222222' },
];

jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}) }));
jest.mock('../_lib/whatsapp-sessions', () => ({
  getOrCreateSession: (...a) => mockGetOrCreate(...a),
  getSessionByPhone: async (phone, scope) => mockSessions.get(`${scope.provider}:${scope.receiver}:${phone}`) || null,
  setSessionRestaurant: (...a) => mockSetRestaurant(...a),
  resetSessionRestaurant: async id => {
    const reset = { ...mockSessions.get(id), restaurant_id: null,
      restaurant_confirmed: false, conversation_history: [], conversation_id: null };
    mockSessions.set(id, reset);
    return { ...reset };
  },
  updateSessionConversationHistory: (...a) => mockSaveHistory(...a),
}));
jest.mock('../_lib/rate-limit', () => ({
  isMessageDuplicate: (...a) => mockDuplicate(...a),
  acquireProcessingLock: (...a) => mockAcquire(...a),
  releaseProcessingLock: (...a) => mockRelease(...a),
}));
jest.mock('../_lib/restaurant-registry', () => ({
  getAllActiveRestaurants: jest.fn(async () => mockRestaurants),
}));
jest.mock('../_lib/whatsapp-sender', () => ({ getWhatsAppProvider: jest.fn(async () => 'meta') }));
jest.mock('../_services/whatsapp/conversation', () => ({
  processWithAI: (...a) => mockAI(...a), cleanHistoryForStorage: messages => messages,
}));
jest.mock('../_services/whatsapp/keyword-handler', () => ({
  handleKeyword: jest.fn(async () => false),
  isVerifiedReportManager: jest.fn(async () => true),
}));
jest.mock('../_services/pdfReportService', () => ({
  sendWeeklyReportViaWhatsApp: jest.fn(async () => ({ success: true })),
}));
jest.mock('../_services/whatsapp/rate-limiter', () => ({ isRateLimited: jest.fn(async () => false) }));
jest.mock('../_services/feedbackService', () => ({ findPendingFeedbackForPhone: jest.fn(async () => null), processFeedbackReply: jest.fn() }));
jest.mock('../_services/surveyReplyHandler', () => ({ handleSurveyReply: jest.fn(async () => null) }));
jest.mock('../_services/memoryExtractor', () => ({ extractMemoriesFromWhatsApp: jest.fn(async () => null) }));
jest.mock('../_lib/whatsapp-interactions', () => ({ simulateTypingDelay: jest.fn(async () => null) }));
jest.mock('../_services/whatsapp/handoff', () => ({ isPaused: jest.fn(() => false) }));

const { processMessage } = require('../_lib/channels/message-processor');
const from = '+15550001111';
const message = (receiver, suffix) => ({ from, phoneNumberId: receiver,
  messageId: `wamid.${suffix}`, text: `message ${suffix}` });
const adapter = () => ({ providerName: 'meta', markAsRead: jest.fn(async () => null),
  sendMessage: jest.fn(async () => ({ success: true })),
  sendInteractiveList: jest.fn(async () => ({ success: true })),
  addReaction: jest.fn(async () => null), removeReaction: jest.fn(async () => null) });

beforeEach(() => {
  mockSessions.clear();
  jest.clearAllMocks();
  mockRestaurants[0].whatsapp_phone_number_id = '11111111111';
  mockRestaurants[1].whatsapp_phone_number_id = '22222222222';
  delete mockRestaurants[0].whatsapp_provider;
  delete mockRestaurants[1].whatsapp_provider;
  mockAcquire.mockResolvedValue(true);
  mockDuplicate.mockResolvedValue(false);
  const receipts = require('../_lib/channels/inbound-completion');
  receipts.wasCompleted.mockResolvedValue(false);
  receipts.wasRateBlocked.mockResolvedValue(false);
  receipts.hasSendAttempt.mockResolvedValue(false);
  receipts.markCompleted.mockResolvedValue(undefined);
  receipts.claimRateCount.mockResolvedValue(true);
  receipts.markRateBlocked.mockResolvedValue(undefined);
  receipts.reserveSendAttempt.mockResolvedValue(undefined);
  receipts.releaseRejectedSend.mockResolvedValue(undefined);
  const replies = require('../_lib/channels/inbound-reply');
  replies.getPendingReply.mockResolvedValue(null);
  replies.savePendingReply.mockResolvedValue(undefined);
  replies.getRecordedRating.mockResolvedValue(null);
  mockDemoConfigLookup.mockResolvedValue({ data: {
    is_demo: true, demo_expires_at: new Date(Date.now() + 86400000).toISOString() }, error: null });
});

test('shared-number picker pages 19 restaurants without exceeding ten total rows', async () => {
  const previousPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const previousOwnerId = process.env.META_RESTAURANT_ID;
  const original = mockRestaurants.map(r => ({ ...r }));
  try {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '99999999999';
    delete process.env.META_RESTAURANT_ID;
    mockRestaurants.splice(0, mockRestaurants.length,
      ...Array.from({ length: 19 }, (_, i) => ({
        id: `shared-${i + 1}`, restaurant_name: `Restaurante ${i + 1}`,
        whatsapp_phone_number_id: null,
      })));
    const channel = adapter();
    const listRows = () => channel.sendInteractiveList.mock.lastCall[3].flatMap(section => section.rows);

    await processMessage(channel, message('99999999999', 'picker-first'));
    expect(listRows()).toHaveLength(9);
    expect(listRows().at(-1).id).toBe('picker_page_1');

    await processMessage(channel, { ...message('99999999999', 'picker-next'),
      interactiveSelection: { id: 'picker_page_1' } });
    expect(listRows()).toHaveLength(10);
    expect(listRows().at(0).id).toBe('restaurant_shared-9');
    expect(listRows().at(-1).id).toBe('picker_page_2');

    await processMessage(channel, { ...message('99999999999', 'picker-last'),
      interactiveSelection: { id: 'picker_page_2' } });
    expect(listRows()).toHaveLength(4);
    expect(listRows().at(0).id).toBe('restaurant_shared-17');
    expect(listRows().at(-1).id).toBe('picker_page_1');

    await processMessage(channel, { ...message('99999999999', 'picker-back'),
      interactiveSelection: { id: 'picker_page_1' } });
    expect(listRows().at(0).id).toBe('restaurant_shared-9');

    await processMessage(channel, { ...message('99999999999', 'picker-invalid'),
      interactiveSelection: { id: 'picker_page_999' } });
    expect(listRows().at(0).id).toBe('restaurant_shared-1');
    expect(mockAI).not.toHaveBeenCalled();

    await processMessage(channel, { ...message('99999999999', 'picker-select'),
      interactiveSelection: { id: 'restaurant_shared-19' } });
    expect(mockSessions.get(`meta:99999999999:${from}`).restaurant_id).toBe('shared-19');
  } finally {
    mockRestaurants.splice(0, mockRestaurants.length, ...original);
    if (previousPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneId;
    if (previousOwnerId === undefined) delete process.env.META_RESTAURANT_ID;
    else process.env.META_RESTAURANT_ID = previousOwnerId;
  }
});

test('old page navigation is ignored after the guest chose a restaurant', async () => {
  const previousPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const previousOwnerId = process.env.META_RESTAURANT_ID;
  try {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '99999999999';
    delete process.env.META_RESTAURANT_ID;
    mockRestaurants.forEach(r => { r.whatsapp_phone_number_id = null; });
    const channel = adapter();
    await processMessage(channel, { ...message('99999999999', 'selected'),
      interactiveSelection: { id: 'restaurant_house-a' } });
    const stale = await processMessage(channel, { ...message('99999999999', 'old-page'),
      interactiveSelection: { id: 'picker_page_1', title: 'Mais / More' } });
    expect(stale).toMatchObject({ handled: true, skipped: 'stale_picker_page' });
    const oldRow = await processMessage(channel, { ...message('99999999999', 'old-row'),
      interactiveSelection: { id: 'restaurant_house-a', title: 'Casa A' } });
    expect(oldRow).toMatchObject({ handled: true, skipped: 'stale_restaurant_selection' });
    expect(mockSessions.get(`meta:99999999999:${from}`).restaurant_id).toBe('house-a');
    expect(channel.sendMessage).toHaveBeenCalledTimes(1);
    expect(channel.sendInteractiveList).not.toHaveBeenCalled();
    expect(mockAI).not.toHaveBeenCalled();
  } finally {
    if (previousPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneId;
    if (previousOwnerId === undefined) delete process.env.META_RESTAURANT_ID;
    else process.env.META_RESTAURANT_ID = previousOwnerId;
  }
});

test('old shared-picker page cannot become AI text when receiver becomes dedicated', async () => {
  const previousPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const previousOwnerId = process.env.META_RESTAURANT_ID;
  try {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '99999999999';
    delete process.env.META_RESTAURANT_ID;
    mockRestaurants.forEach(r => { r.whatsapp_phone_number_id = null; });
    const channel = adapter();
    await processMessage(channel, message('99999999999', 'before-dedicated'));
    expect(channel.sendInteractiveList).toHaveBeenCalledTimes(1);
    mockRestaurants[0].whatsapp_phone_number_id = '99999999999';

    const stale = await processMessage(channel, { ...message('99999999999', 'after-dedicated'),
      interactiveSelection: { id: 'picker_page_1', title: 'Mais / More' } });
    expect(stale).toMatchObject({ handled: true, skipped: 'stale_picker_page' });
    const oldRow = await processMessage(channel, { ...message('99999999999', 'old-row-after-dedicated'),
      interactiveSelection: { id: 'restaurant_house-b', title: 'Casa B' } });
    expect(oldRow).toMatchObject({ handled: true, skipped: 'stale_restaurant_selection' });
    expect(mockSessions.get(`meta:99999999999:${from}`).restaurant_id).toBeNull();
    expect(channel.sendMessage).not.toHaveBeenCalled();
    expect(mockAI).not.toHaveBeenCalled();
  } finally {
    if (previousPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneId;
    if (previousOwnerId === undefined) delete process.env.META_RESTAURANT_ID;
    else process.env.META_RESTAURANT_ID = previousOwnerId;
  }
});

test('explicitly rejected picker send releases its reservation and retries safely', async () => {
  const previousPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const previousOwnerId = process.env.META_RESTAURANT_ID;
  try {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '99999999999';
    delete process.env.META_RESTAURANT_ID;
    mockRestaurants.forEach(r => { r.whatsapp_phone_number_id = null; });
    const receipts = require('../_lib/channels/inbound-completion');
    const attempts = new Set();
    receipts.hasSendAttempt.mockImplementation(async (_identity, id) => attempts.has(id));
    receipts.reserveSendAttempt.mockImplementation(async (_identity, id) => { attempts.add(id); });
    receipts.releaseRejectedSend.mockImplementation(async (_identity, id) => { attempts.delete(id); });
    const channel = adapter();
    channel.sendInteractiveList
      .mockResolvedValueOnce({ success: false, error: 'Meta rejected list', definitiveFailure: true })
      .mockResolvedValueOnce({ success: true });
    const inbound = message('99999999999', 'picker-retry');
    const failed = await processMessage(channel, inbound);
    expect(failed).toMatchObject({ handled: false, retryable: true, skipped: 'picker_rejected' });
    expect(receipts.releaseRejectedSend).toHaveBeenCalledTimes(1);
    expect(attempts.size).toBe(0);

    const delivered = await processMessage(channel, inbound);
    expect(delivered.handled).toBe(true);
    expect(channel.sendInteractiveList).toHaveBeenCalledTimes(2);
    expect(mockAI).not.toHaveBeenCalled();
  } finally {
    if (previousPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneId;
    if (previousOwnerId === undefined) delete process.env.META_RESTAURANT_ID;
    else process.env.META_RESTAURANT_ID = previousOwnerId;
  }
});

test('same guest A → B → A keeps tenant, history, and reply sender separate', async () => {
  const a = adapter();
  const b = adapter();
  const first = await processMessage(a, message('11111111111', 'a1'));
  const second = await processMessage(b, message('22222222222', 'b1'));
  const third = await processMessage(a, message('11111111111', 'a2'));
  expect([first.response, second.response, third.response]).toEqual(['house-a|0', 'house-b|0', 'house-a|2']);
  expect(mockSessions.size).toBe(2);
  expect(a.sendMessage).toHaveBeenLastCalledWith(from, 'house-a|2',
    expect.objectContaining({ receiver: '11111111111' }));
  expect(b.sendMessage).toHaveBeenCalledWith(from, 'house-b|0',
    expect.objectContaining({ receiver: '22222222222' }));
  expect(mockRelease).toHaveBeenCalledTimes(3);
  expect(mockRelease.mock.calls[0][0]).not.toBe(mockRelease.mock.calls[1][0]);
  const rateKeys = require('../_services/whatsapp/rate-limiter').isRateLimited.mock.calls.map(call => call[0]);
  expect(rateKeys[0]).toBe(rateKeys[2]);
  expect(rateKeys[0]).not.toBe(rateKeys[1]);
});

test('unknown receiver cannot open a session or send a reply', async () => {
  const channel = adapter();
  const result = await processMessage(channel, message('33333333333', 'unknown'));
  expect(result.skipped).toBe('unknown_receiver');
  expect(mockGetOrCreate).not.toHaveBeenCalled();
  expect(channel.sendMessage).not.toHaveBeenCalled();
});

test('Meta cannot route a dedicated number owned by a Twilio restaurant into keyword or feedback handlers', async () => {
  mockRestaurants[0].whatsapp_provider = 'twilio';
  const channel = adapter();
  const result = await processMessage(channel, { ...message('11111111111', 'wrong-provider'), text: 'RELATORIO' });
  expect(result.skipped).toBe('unknown_receiver');
  expect(require('../_services/whatsapp/keyword-handler').handleKeyword).not.toHaveBeenCalled();
  expect(require('../_services/feedbackService').findPendingFeedbackForPhone).not.toHaveBeenCalled();
  expect(channel.sendMessage).not.toHaveBeenCalled();
});

test('old picker reply cannot switch an already-bound tenant', async () => {
  const channel = adapter();
  await processMessage(channel, message('11111111111', 'first'));
  const result = await processMessage(channel, { ...message('11111111111', 'stale'),
    interactiveSelection: { id: 'restaurant_house-b', title: 'Casa B' } });
  expect(result.skipped).toBe('stale_restaurant_selection');
  expect(mockAI).toHaveBeenCalledTimes(1);
  expect(mockSessions.get(`meta:11111111111:${from}`).restaurant_id).toBe('house-a');
});

test('failed delivery stays retryable; completion is recorded only after success', async () => {
  const receipts = require('../_lib/channels/inbound-completion');
  const replies = require('../_lib/channels/inbound-reply');
  const completed = new Set();
  let pending = null;
  const key = (identity, id) => `${identity.provider}:${identity.receiver}:${id}`;
  receipts.wasCompleted.mockImplementation(async (identity, id) => completed.has(key(identity, id)));
  receipts.markCompleted.mockImplementation(async (identity, id) => { completed.add(key(identity, id)); });
  receipts.claimRateCount.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  replies.savePendingReply.mockImplementation(async (_identity, _id, replyText, purpose) => {
    pending = { reply_text: replyText, purpose };
  });
  replies.getPendingReply.mockImplementation(async () => pending);
  const channel = adapter();
  channel.sendMessage.mockResolvedValueOnce({ success: false, error: 'Meta rejected request', definitiveFailure: true });
  const inbound = message('11111111111', 'retry-1');
  const failed = await processMessage(channel, inbound);
  expect(failed.retryable).toBe(true);
  expect(receipts.markCompleted).not.toHaveBeenCalled();

  const delivered = await processMessage(channel, inbound);
  expect(delivered.handled).toBe(true);
  expect(delivered.skipped).toBe('pending_reply_replayed');
  expect(receipts.markCompleted).toHaveBeenCalledTimes(1);

  await processMessage(channel, inbound);
  expect(mockAI).toHaveBeenCalledTimes(1);
  expect(require('../_services/whatsapp/rate-limiter').isRateLimited).toHaveBeenCalledTimes(1);
});

test('completed external send is never repeated if completion write fails', async () => {
  const receipts = require('../_lib/channels/inbound-completion');
  const attempts = new Set();
  receipts.hasSendAttempt.mockImplementation(async (_identity, id) => attempts.has(id));
  receipts.reserveSendAttempt.mockImplementation(async (_identity, id) => { attempts.add(id); });
  receipts.markCompleted.mockRejectedValueOnce(new Error('database unavailable'));
  const channel = adapter();
  const inbound = message('11111111111', 'accepted-no-receipt');
  await expect(processMessage(channel, inbound)).rejects.toThrow('database unavailable');
  const retry = await processMessage(channel, inbound);
  expect(retry).toMatchObject({ skipped: 'send_uncertain', retryable: false });
  expect(channel.sendMessage).toHaveBeenCalledTimes(1);
  expect(mockAI).toHaveBeenCalledTimes(1);
});

test('rate-limited inbound stays blocked when its completion write fails', async () => {
  const receipts = require('../_lib/channels/inbound-completion');
  const rate = require('../_services/whatsapp/rate-limiter');
  const blocked = new Set();
  receipts.wasRateBlocked.mockImplementation(async (_identity, id) => blocked.has(id));
  receipts.markRateBlocked.mockImplementation(async (_identity, id) => { blocked.add(id); });
  receipts.markCompleted.mockRejectedValueOnce(new Error('database unavailable'));
  rate.isRateLimited.mockResolvedValueOnce(true);
  const channel = adapter();
  const inbound = message('11111111111', 'rate-blocked');
  await expect(processMessage(channel, inbound)).rejects.toThrow('database unavailable');
  const retry = await processMessage(channel, inbound);
  expect(retry).toMatchObject({ handled: true, skipped: 'rate_limited' });
  expect(mockAI).not.toHaveBeenCalled();
  expect(rate.isRateLimited).toHaveBeenCalledTimes(1);
});

test('receiver reassignment clears old tenant and history before routing new owner', async () => {
  const channel = adapter();
  await processMessage(channel, message('11111111111', 'old-owner'));
  mockRestaurants[0].whatsapp_phone_number_id = '33333333333';
  mockRestaurants[1].whatsapp_phone_number_id = '11111111111';
  const result = await processMessage(channel, message('11111111111', 'new-owner'));
  expect(result.response).toBe('house-b|0');
  expect(mockSessions.get(`meta:11111111111:${from}`)).toEqual(
    expect.objectContaining({ restaurant_id: 'house-b' }));
  expect(mockAI).toHaveBeenCalledTimes(2);
});

test('demo link is cleared when shared receiver route owner changes', async () => {
  const oldPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const oldOwnerId = process.env.META_RESTAURANT_ID;
  try {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '99999999999';
    process.env.META_RESTAURANT_ID = 'house-b';
    mockRestaurants[0].whatsapp_phone_number_id = null;
    mockRestaurants[1].whatsapp_phone_number_id = null;
    const key = `meta:99999999999:${from}`;
    mockSessions.set(key, { id: key, sender_phone: from, inbound_provider: 'meta',
      inbound_receiver: '99999999999', restaurant_id: 'old-demo',
      conversation_id: 'demo-old-demo:route:house-a', conversation_history: [{ role: 'user', content: 'private' }],
      expires_at: new Date(Date.now() + 300000).toISOString() });
    const channel = adapter();
    const result = await processMessage(channel, message('99999999999', 'new-shared-owner'));
    expect(result.response).toBe('house-b|0');
    expect(mockSessions.get(key).restaurant_id).toBe('house-b');
  } finally {
    if (oldPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = oldPhoneId;
    if (oldOwnerId === undefined) delete process.env.META_RESTAURANT_ID;
    else process.env.META_RESTAURANT_ID = oldOwnerId;
  }
});

test('demo link is cleared when a shared receiver changes from group A/B to C/D', async () => {
  const previousPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const previousOwnerId = process.env.META_RESTAURANT_ID;
  const original = mockRestaurants.map(r => ({ ...r }));
  try {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '99999999999';
    delete process.env.META_RESTAURANT_ID;
    mockRestaurants[0] = { id: 'house-c', restaurant_name: 'Casa C', whatsapp_phone_number_id: null };
    mockRestaurants[1] = { id: 'house-d', restaurant_name: 'Casa D', whatsapp_phone_number_id: null };
    const { demoConversationId } = require('../_lib/channels/receiver-identity');
    const oldStamp = demoConversationId('old-demo', { picker: original });
    const key = `meta:99999999999:${from}`;
    mockSessions.set(key, { id: key, sender_phone: from, inbound_provider: 'meta',
      inbound_receiver: '99999999999', restaurant_id: 'old-demo',
      conversation_id: oldStamp, conversation_history: [{ role: 'user', content: 'private' }],
      expires_at: new Date(Date.now() + 300000).toISOString() });
    const channel = adapter();
    const result = await processMessage(channel, message('99999999999', 'new-group'));
    expect(result.handled).toBe(true);
    expect(mockSessions.get(key)).toEqual(expect.objectContaining({
      restaurant_id: null, conversation_history: [],
    }));
    expect(channel.sendInteractiveList).toHaveBeenCalledTimes(1);
    expect(channel.sendMessage).not.toHaveBeenCalled();
    expect(mockAI).not.toHaveBeenCalled();
  } finally {
    mockRestaurants[0] = original[0];
    mockRestaurants[1] = original[1];
    if (previousPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneId;
    if (previousOwnerId === undefined) delete process.env.META_RESTAURANT_ID;
    else process.env.META_RESTAURANT_ID = previousOwnerId;
  }
});

test('feedback acknowledgement rejection retries its saved text without writing rating twice', async () => {
  const feedback = require('../_services/feedbackService');
  const replies = require('../_lib/channels/inbound-reply');
  let pending = null;
  feedback.findPendingFeedbackForPhone.mockResolvedValueOnce({ restaurantId: 'house-a' });
  feedback.processFeedbackReply.mockResolvedValueOnce({ rating: 5, comment: null });
  replies.savePendingReply.mockImplementation(async (_identity, _id, replyText, purpose) => {
    pending = { reply_text: replyText, purpose };
  });
  replies.getPendingReply.mockImplementation(async () => pending);
  const channel = adapter();
  channel.sendMessage.mockResolvedValueOnce({ success: false, error: 'rejected', definitiveFailure: true });
  const inbound = { ...message('11111111111', 'feedback-retry'), text: '5' };
  const failed = await processMessage(channel, inbound);
  expect(failed).toMatchObject({ handled: false, retryable: true, skipped: 'feedback_ack_failed' });
  const replayed = await processMessage(channel, inbound);
  expect(replayed).toMatchObject({ handled: true, skipped: 'pending_reply_replayed' });
  expect(feedback.processFeedbackReply).toHaveBeenCalledTimes(1);
  expect(mockAI).not.toHaveBeenCalled();
  expect(channel.sendMessage.mock.calls[1][1]).toBe(channel.sendMessage.mock.calls[0][1]);
});

test('failed feedback write remains retryable and never falls through to the AI', async () => {
  const feedback = require('../_services/feedbackService');
  feedback.findPendingFeedbackForPhone.mockResolvedValue({ restaurantId: 'house-a' });
  feedback.processFeedbackReply.mockRejectedValueOnce(new Error('database unavailable'));
  const channel = adapter();
  const inbound = { ...message('11111111111', 'feedback-db'), text: '5' };
  const failed = await processMessage(channel, inbound);
  expect(failed).toMatchObject({ handled: false, retryable: true, skipped: 'feedback_write_failed' });
  expect(mockAI).not.toHaveBeenCalled();
  expect(require('../_lib/channels/inbound-completion').markCompleted).not.toHaveBeenCalled();
  feedback.processFeedbackReply.mockResolvedValueOnce({ rating: 5 });
  expect((await processMessage(channel, inbound)).handled).toBe(true);
  expect(feedback.processFeedbackReply).toHaveBeenCalledTimes(2);
  expect(mockAI).not.toHaveBeenCalled();
});

test('failed survey storage remains retryable rather than interpreting a rating as a booking', async () => {
  const survey = require('../_services/surveyReplyHandler');
  survey.handleSurveyReply.mockRejectedValueOnce(new Error('database unavailable'));
  const channel = adapter();
  const result = await processMessage(channel, { ...message('11111111111', 'survey-db'), text: '5' });
  expect(result).toMatchObject({ handled: false, retryable: true, skipped: 'survey_write_failed' });
  expect(mockAI).not.toHaveBeenCalled();
  expect(channel.sendMessage).not.toHaveBeenCalled();
});

test('saved feedback recovers its acknowledgement if writing reply intent fails', async () => {
  const feedback = require('../_services/feedbackService');
  const replies = require('../_lib/channels/inbound-reply');
  feedback.findPendingFeedbackForPhone.mockResolvedValueOnce({ restaurantId: 'house-a' });
  feedback.processFeedbackReply.mockResolvedValueOnce({ rating: 5, comment: null });
  replies.getRecordedRating.mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ rating: 5, comment: null, purpose: 'feedback' });
  replies.savePendingReply.mockRejectedValueOnce(new Error('reply table unavailable'));
  const channel = adapter();
  const inbound = { ...message('11111111111', 'feedback-after-write'), text: '5' };
  await expect(processMessage(channel, inbound)).rejects.toThrow('reply table unavailable');
  expect(channel.sendMessage).not.toHaveBeenCalled();
  expect(require('../_lib/channels/inbound-completion').markCompleted).not.toHaveBeenCalled();
  const recovered = await processMessage(channel, inbound);
  expect(recovered).toMatchObject({ handled: true, skipped: 'rating_reply_recovered' });
  expect(channel.sendMessage).toHaveBeenCalledTimes(1);
  expect(feedback.processFeedbackReply).toHaveBeenCalledTimes(1);
  expect(mockAI).not.toHaveBeenCalled();
});

test('saved survey recovers its acknowledgement if writing reply intent fails', async () => {
  const survey = require('../_services/surveyReplyHandler');
  const replies = require('../_lib/channels/inbound-reply');
  survey.handleSurveyReply.mockResolvedValueOnce({ rating: 4, comment: 'Great', restaurantId: 'house-a' });
  replies.getRecordedRating.mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ rating: 4, comment: 'Great', purpose: 'pesquisa' });
  replies.savePendingReply.mockRejectedValueOnce(new Error('reply table unavailable'));
  const channel = adapter();
  const inbound = { ...message('11111111111', 'survey-after-write'), text: '4 - Great' };
  await expect(processMessage(channel, inbound)).rejects.toThrow('reply table unavailable');
  const recovered = await processMessage(channel, inbound);
  expect(recovered).toMatchObject({ handled: true, skipped: 'rating_reply_recovered' });
  expect(survey.handleSurveyReply).toHaveBeenCalledTimes(1);
  expect(mockAI).not.toHaveBeenCalled();
});

test('pending reply from a prior account owner is never sent after receiver reassignment', async () => {
  const replies = require('../_lib/channels/inbound-reply');
  replies.getPendingReply.mockResolvedValue({ reply_text: 'Private answer from A',
    purpose: 'resposta-ia', restaurant_id: 'house-a' });
  mockRestaurants[0].whatsapp_phone_number_id = '33333333333';
  mockRestaurants[1].whatsapp_phone_number_id = '11111111111';
  const channel = adapter();
  const result = await processMessage(channel, message('11111111111', 'old-pending'));
  expect(result).toMatchObject({ skipped: 'pending_tenant_changed', retryable: false });
  expect(channel.sendMessage).not.toHaveBeenCalled();
  expect(mockAI).not.toHaveBeenCalled();
});

test('pending demo reply replays only while its scoped demo and shared route still match', async () => {
  const previousPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const previousOwnerId = process.env.META_RESTAURANT_ID;
  const original = mockRestaurants.map(r => ({ ...r }));
  try {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '99999999999';
    delete process.env.META_RESTAURANT_ID;
    mockRestaurants[0].whatsapp_phone_number_id = null;
    mockRestaurants[1].whatsapp_phone_number_id = null;
    const { demoConversationId } = require('../_lib/channels/receiver-identity');
    const key = `meta:99999999999:${from}`;
    mockSessions.set(key, { id: key, restaurant_id: 'demo-id',
      conversation_id: demoConversationId('demo-id', { picker: mockRestaurants }) });
    const replies = require('../_lib/channels/inbound-reply');
    replies.getPendingReply.mockResolvedValue({ reply_text: 'Demo reply',
      purpose: 'resposta-ia', restaurant_id: 'demo-id' });
    const channel = adapter();
    const inbound = message('99999999999', 'pending-demo');
    expect((await processMessage(channel, inbound)).skipped).toBe('pending_reply_replayed');
    expect(channel.sendMessage).toHaveBeenCalledWith(from, 'Demo reply',
      expect.objectContaining({ receiver: '99999999999' }));
    channel.sendMessage.mockClear();
    mockRestaurants[0].id = 'house-c';
    mockRestaurants[1].id = 'house-d';
    expect((await processMessage(channel, inbound)).skipped).toBe('pending_tenant_changed');
    expect(channel.sendMessage).not.toHaveBeenCalled();
  } finally {
    mockRestaurants[0] = original[0];
    mockRestaurants[1] = original[1];
    if (previousPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneId;
    if (previousOwnerId === undefined) delete process.env.META_RESTAURANT_ID;
    else process.env.META_RESTAURANT_ID = previousOwnerId;
  }
});

test('report PDF send intent is reserved before external delivery', async () => {
  const keyword = require('../_services/whatsapp/keyword-handler');
  keyword.handleKeyword.mockImplementationOnce(async (_text, _from, _session, context) => {
    await context.beforeReportSend();
    return true;
  });
  const channel = adapter();
  const result = await processMessage(channel, { ...message('11111111111', 'report'), text: 'RELATORIO' });
  expect(result.handled).toBe(true);
  expect(require('../_lib/channels/inbound-completion').reserveSendAttempt).toHaveBeenCalledTimes(1);
  expect(channel.sendMessage).not.toHaveBeenCalled();
});
