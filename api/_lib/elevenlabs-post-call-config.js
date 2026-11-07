'use strict';

/** Keep Seatable agents off workspace-wide post-call destinations. */
function postCallWebhookOverrides() {
  const id = (process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    throw new Error('ELEVENLABS_POST_CALL_WEBHOOK_ID is not configured');
  }
  return {
    webhooks: {
      post_call_webhook_id: id,
      events: ['transcript'],
      transcript_format: 'json',
      send_audio: false,
    },
  };
}

module.exports = { postCallWebhookOverrides };
