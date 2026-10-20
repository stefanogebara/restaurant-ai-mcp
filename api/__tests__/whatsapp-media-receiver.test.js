'use strict';

const { MetaAdapter } = require('../_lib/channels/meta-adapter');
const { TwilioAdapter } = require('../_lib/channels/twilio-adapter');
const { WAHAAdapter } = require('../_lib/channels/waha-adapter');

test('unsupported Meta media is queued for verified routing, not sent during parsing', async () => {
  const adapter = new MetaAdapter();
  adapter.sendMessage = jest.fn();
  const parsed = await adapter.parseIncoming({ body: { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '11111111111' },
    messages: [{ from: '15550001111', id: 'wamid.media', type: 'sticker' }],
  } }] }] } });
  expect(parsed).toEqual(expect.objectContaining({ phoneNumberId: '11111111111',
    preprocessReply: expect.stringContaining('texto') }));
  expect(adapter.sendMessage).not.toHaveBeenCalled();
});

test('Twilio media without a text Body still reaches the verified pipeline', async () => {
  const adapter = new TwilioAdapter();
  adapter.sendMessage = jest.fn();
  const parsed = await adapter.parseIncoming({ body: {
    From: 'whatsapp:+15550001111', To: 'whatsapp:+15550002222',
    MessageSid: 'SM123', NumMedia: '1', Body: '',
  } });
  expect(parsed).toEqual(expect.objectContaining({ messageId: 'SM123',
    phoneNumberId: '+15550002222', preprocessReply: expect.any(String) }));
  expect(adapter.sendMessage).not.toHaveBeenCalled();
});

test('unsupported WAHA media is queued for verified routing', async () => {
  const adapter = new WAHAAdapter({ testMode: true });
  adapter.sendMessage = jest.fn();
  const parsed = await adapter.parseIncoming({ body: { event: 'message', session: 'seatable',
    payload: { id: 'waha-media', from: '15550001111@c.us', type: 'audio', fromMe: false } } });
  expect(parsed).toEqual(expect.objectContaining({ phoneNumberId: 'seatable',
    preprocessReply: expect.stringContaining('audios') }));
  expect(adapter.sendMessage).not.toHaveBeenCalled();
});
