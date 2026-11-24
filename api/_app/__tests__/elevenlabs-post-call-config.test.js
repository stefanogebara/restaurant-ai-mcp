'use strict';

const { postCallWebhookOverrides } = require('../_lib/elevenlabs-post-call-config');

describe('Seatable post-call destination', () => {
  const original = process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID;
    else process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID = original;
  });

  it('refuses to create an agent with an unconfigured or malformed destination', () => {
    delete process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID;
    expect(postCallWebhookOverrides).toThrow('ELEVENLABS_POST_CALL_WEBHOOK_ID');
    process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID = 'stevi-voz-postcall';
    expect(postCallWebhookOverrides).toThrow('ELEVENLABS_POST_CALL_WEBHOOK_ID');
  });

  it('uses transcript-only JSON events on the assigned webhook', () => {
    process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID = '009feaa21d50415bbd87da12d0379704';
    expect(postCallWebhookOverrides().webhooks).toMatchObject({
      post_call_webhook_id: '009feaa21d50415bbd87da12d0379704',
      events: ['transcript'],
      transcript_format: 'json',
      send_audio: false,
    });
  });
});
