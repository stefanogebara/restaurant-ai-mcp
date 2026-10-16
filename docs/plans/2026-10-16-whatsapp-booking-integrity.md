# WhatsApp booking integrity — implementation slice

This is the first repair from the 16 October focused audit. The original checkout
and production database must remain untouched while this branch is developed.

## Contract

- A WhatsApp booking command has a stable, server-derived idempotency identity;
  an AI retry or webhook replay cannot create another reservation for that intent.
- The final write checks active seat capacity under one database transaction.
  Two competing WhatsApp bookings for the last seats cannot both succeed.
- Repeated requests for the same active guest/date/time/party return the existing
  booking, not another charge or confirmation.
- A committed booking's result survives a later model error. Retries may reuse
  the result but do not repeat billable or outbound side effects.
- The existing restaurant tenant is never inferred from tool arguments.
- This slice does not claim to serialize dashboard, voice, and web booking paths
  that still write reservations directly. Cross-channel admission is follow-up.

## Steps

- [x] Establish exact schema, availability behavior, and migration/security contract.
- [x] Add a service-role-only transactional booking function with idempotency and
      capacity admission. Exercise it against disposable PostgreSQL with two
      transaction orderings, replay, cancellation/rebooking, and refusal cases.
- [x] Route the WhatsApp create tool through that function with validated inputs
      and a stable inbound identity. Distinguish newly created from replayed.
- [x] Add focused tests for the conversation retry after a committed tool call,
      duplicate explicit action, unavailable capacity, and tenant scoping.
- [ ] Run Seatable verification, review the diff, and report migration/deployment
      sequencing explicitly. No live database change during development.

## Verification record

- Disposable PostgreSQL: function compiles; `anon` and `authenticated` cannot
  execute it; both lock orderings result in one booking and one refusal; replay,
  changed model details, cancellation/rebooking, closing time, advance limit,
  and legacy hours format pass.
- Focused backend suites: 22/22 pass after the retry-key correction.
- Frontend build: pass. Vitest: 138 files / 1,102 tests pass.
- Full backend run before the correction to the unrelated expiring ML fixture:
  4,357 pass, 1 fails (`features.test.js`, hard-coded 2025-10-16). Fixed in
  separate PR #201, not mixed into this change.
- No production migration, deploy, or real WhatsApp message has occurred.

## Known remaining gaps

- Receiver-to-restaurant isolation is a separate P1: an old phone-keyed session
  can still refer to a different dedicated number. Do not claim this PR fixes
  cross-restaurant routing.
- The lock protects bookings that call this RPC. Direct writers from dashboard,
  web, voice, and Google need the same admission contract for global safety.
- Aggregate seat capacity does not prove a physically joinable table placement.
- Outbound WhatsApp confirmation still uses a fire-and-forget send; delivery
  needs a durable receipt/outbox repair.

## Release boundary

The migration must precede application traffic using the function. Green tests
in this worktree are not a production release. A production rollout requires
the exact migration to be applied to `seatable-eu`, its function privileges and
negative paths rechecked, a tested main commit deployed once, then a controlled
sandbox booking whose database and outbound effects are independently observed.
