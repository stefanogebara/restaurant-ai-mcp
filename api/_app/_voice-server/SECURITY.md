# Voice ingress rollout — local changes, not deployed

The OpenAI Media Streams path requires both:

1. The Twilio SDK validates `X-Twilio-Signature` during the WebSocket upgrade against configured `VOICE_WS_URL`, never request Host/forwarded headers. Only `/ws` without a query is accepted. The equivalent WSS/HTTPS handshake representations and Twilio's documented trailing-slash signing variation are accepted.
2. A 120-second single-use opaque grant, issued by the signed HTTP voice webhook and carried in a TwiML custom Parameter, binds the restaurant, caller, CallSid, AccountSid and canonical WebSocket URL. Shared Redis atomically issues/consumes capabilities. No in-memory replay fallback is permitted.

A call-specific tombstone lasts seven days. HTTP retries reuse the original capability, including after consumption; they cannot overwrite or recreate the live grant. This bounds HTTP replay protection to seven days, not forever: Twilio's signature does not carry a timestamp. No grant may be reused after consumption, expiration, or receiver/context mismatch. Redis must be shared across webhook and every voice server instance, preserve its data, and not evict grant/tombstone keys prematurely.

## Required configuration

- `VOICE_WS_URL`: explicit canonical `wss://your-voice-host/ws`, identical on Vercel and voice server. No credentials, query strings, alternate path or arbitrary per-restaurant destination. A restaurant override must match the canonical URL.
- `TWILIO_AUTH_TOKEN` and `TWILIO_ACCOUNT_SID`: matching provider account on both services.
- Shared `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or the existing `KV_REST_API_URL` / `KV_REST_API_TOKEN` aliases).
- Existing OpenAI/Supabase credentials remain required for the subsequent authenticated session.

Missing or failed grant storage rejects streaming. The HTTP endpoint returns safe spoken error TwiML; it does not silently open an unauthenticated socket. The ElevenLabs managed path does not use these grants. Deploy the receiver and issuer together; old grant-less TwiML cannot enter the hardened receiver. Do not roll back only the receiver to unauthenticated acceptance.

Each socket is bound to one accepted stream ID; foreign media/mark/stop messages and duplicate starts close the socket. Start authorization has a ten-second deadline; message payloads are capped at 64 KiB. Messages are processed in arrival order, with a 500-message/1 MiB queue limit while the grant and AI backend initialize. Session collision checks occur before taking ownership, so a rejected socket cannot destroy an existing call.

The packaging fix in PR #258 is already deployed to Fly as release v5. This authentication change has not been deployed, and actual provider calls have not been exercised in this work.

## Evidence and limitations

Focused tests exercise actual local WebSocket upgrades using Twilio SDK signatures, mocked Redis and mocked AI (no provider calls). They verify unsigned ingress, missing/replayed/tampered grants, shared-store failures, valid initialization/audio, duplicate starts and stream-ID collision isolation. On 2026-11-08, a synthetic grant against the live shared Upstash instance passed issuance, consumption, webhook retry, and replay rejection. The configured Twilio account credentials were verified read-only against its active account. No real telephone call has been tested for this change.

Primary sources:
- [Twilio Media Streams security requirements](https://www.twilio.com/docs/voice/media-streams)
- [Twilio signature validation and WSS trailing-slash note](https://www.twilio.com/docs/usage/security)
- [Stream custom parameters and 500-character limit](https://www.twilio.com/docs/voice/twiml/stream)
- [Media Streams start/message contract](https://www.twilio.com/docs/voice/media-streams/websocket-messages)
