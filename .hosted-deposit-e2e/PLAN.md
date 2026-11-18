# Hosted reservation deposit

- [x] Persist a request before creating its Checkout Session. Serialize concurrent requests for one booking and reuse Stripe's idempotency key and the original Checkout parameters.
- [x] Verify the current session, authorization and reservation. Serialize attachment and the decision to release stale holds. Keep this branch of webhook handling separate from subscription events.
- [x] Provide a disposable Postgres/PostgREST and Stripe Sandbox harness. Cover lost responses, duplicates, changed reservations, earlier captures and legacy links.
