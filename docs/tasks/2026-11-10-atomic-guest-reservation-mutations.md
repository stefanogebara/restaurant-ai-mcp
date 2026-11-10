# Atomic guest reservation changes

## Scope and contract

Follow-up to `7a745dbd` on the isolated WhatsApp branch. Shared core was
explicitly authorized after the initial WhatsApp adapter audit. Native adapter
implementation belongs to the parent. No Supabase barrel/module edits.

Exports from `api/_lib/reservation-mutations.js`:

- `verifyGuestReservation({ restaurantId, reservationId, customerPhone })`
- `modifyGuestReservation({ restaurantId, reservationId, customerPhone, newDate, newTime, newPartySize })`
- `cancelGuestReservation({ restaurantId, reservationId, customerPhone })`

`reservationId` means the entire exact stored public confirmation code, not the
row UUID, a name, or a code prefix. The shared core does not impose the native
adapter's channel-specific code regex on alternate opaque formats. The caller
must supply the authenticated/bound restaurant and transport-authoritative
phone. Model arguments cannot establish that authority. Phone normalization
allows punctuation but compares all international digits, with no suffix match.

All exports resolve to `{ success, changed, reservation, error }`. Errors contain
an allowlisted `{ code, message }`; the reservation is null on failure. Success
contains only owner-safe booking fields. Verification and unchanged retries have
`changed: false`. Cancellation retries are successful no-ops. No automatic RPC
retries, outbound notifications, usage writes, receipt claims, or re-ingestion.
An ambiguous RPC failure requires checking current details before retrying.

WhatsApp mutation tools now call this shared service. They retain the existing
50-person channel limit and the alias `reservation_id` in their tool results.
Sender-scoped WhatsApp lookup remains separate. Neither mutation makes a direct
PostgREST update.

## Admission and locking boundaries

The RPC is service-role only, SECURITY INVOKER with an empty search path. Each
invocation locks the active restaurant config row first, then verifies and locks
one exact reservation using tenant, full code, and normalized authoritative
phone. This matches `book_whatsapp_reservation`'s restaurant lock order.

Only confirmed/pending reservations may change. Completed, seated, no-show, and
other terminal states refuse changes; already-cancelled cancellation is a no-op.
Modifications keep the same row ID, confirmation code, guest data, external key,
source, and other unrelated fields. Strict calendar/time/integer validation,
restaurant-local past checks, advance limit, split/overnight hours, last seating,
and overlapping seat capacity all run inside that transaction. Missing/invalid
restaurant timezone fails closed. Partial changes merge with the locked row.

This is **aggregate seat admission**, not physical table assignment. It sums
active table capacities and overlapping confirmed/seated/pending parties,
excluding the reservation being changed. A changed reservation clears its stale
`table_ids`; it does not invent a replacement table or table combination. A
failed admission does not update the original row. Cancellation clears table
references once. Pending reservations count conservatively toward capacity;
existing WhatsApp creation currently counts confirmed/seated.

**No universal cross-channel concurrency guarantee:** current native voice
creation in `tool-handlers.js` still checks then inserts without taking the
restaurant config lock. Restaurant serialization protects these mutations and
other callers that take the same lock, including the existing WhatsApp booking
RPC. Changing voice creation or all booking admission architecture is outside
this patch.

## Verification and application state

The migration is source only. It was not applied to a local, sandbox, or live
database. No provider requests or writes, deployments, or pushes were performed.
The parent owns migration review and actual sandbox RPC execution before use.

Focused verification passed: **119 tests across 10 Jest suites**, with JavaScript
syntax checks and `git diff --check` passing. The focused Jest suites exercise the shared API validation and response contract,
trusted WhatsApp ownership delegation, receiver/session isolation, inbound Meta
and Twilio flows, and existing booking integrity. SQL behavior is not proved by
these mocked RPC tests.

`scripts/test-reservation-mutations-rpc.cjs` is a separate SQL integration harness.
It refuses remote connections and existing application tables. It creates only
minimal fixtures and the new migration in a fresh disposable Unix-socket cluster
under `/tmp/stb-mutations-*`, with `PGDATABASE=postgres`. It uses two independent
service-role sessions for both lock orderings. Cases include:

- Actual anon/authenticated execution denied, plus service-role grant checks.
- Full-code/phone/tenant proof and malformed direct JSON changes.
- Strict calendar, time, party size, and past-slot refusal.
- Self-exclusion at full capacity and full-row preservation on capacity failure.
- Terminal-state guards, pending cancellation, and no-op retry.
- Split/legacy/overnight hours and unknown timezone refusal.
- Concurrent same-owner partial changes serialize and retain both changes, row
  identity, and protected fields without creating another reservation.

The harness is syntax checked but **not executed**, consistent with the no DB
writes boundary. It needs `pg` installed and a fresh disposable PostgreSQL cluster.
It is not a claim about production-schema constraints, migration application,
live owner verification, or actual phone/WhatsApp delivery.
