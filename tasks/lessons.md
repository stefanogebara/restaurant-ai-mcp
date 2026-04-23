
## 2026-04-20: WAHA test webhooks send real messages
**Mistake**: Sent curl test webhooks to the production WAHA pipeline without suppressing sendMessage — bot replied to fake/random phone numbers via the user's real WhatsApp account.

**Rule**: ALL curl/E2E test webhooks to `/api/waha-webhook` MUST include `X-Test-Mode: true` header. This runs the full AI pipeline (session, routing, AI response) but suppresses the actual WhatsApp send.

**Example**:
```bash
curl -X POST https://seatable.one/api/waha-webhook \
  -H "x-api-key: seatable-waha-key-2026" \
  -H "X-Test-Mode: true" \
  -H "Content-Type: application/json" \
  -d '{"event":"message","session":"default","payload":{"id":"test-001","from":"5511977665544@c.us","fromMe":false,"body":"...","type":"chat","hasMedia":false}}'
```
