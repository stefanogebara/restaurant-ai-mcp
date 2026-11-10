# WhatsApp reservation changes: scoped audit and deterministic guards

Base: `fc3125fa`. Worktree: `seatable-whatsapp-reservation-changes`.
The original checkout and phone handlers are outside this task.

## Actual Meta path

1. `api/whatsapp-webhook.js` verifies the signed payload through `MetaAdapter` and awaits processing before acknowledging it.
2. `api/_lib/channels/message-processor.js` validates the provider/receiving account, binds the transport sender to a receiver-scoped session, and checks that its restaurant remains eligible for that receiving account.
3. Free text reaches `processWithAI`. Interactive `cancel_reservation_<id>` and `modify_reservation_<id>` selections become structured hints for the same AI pipeline. Generic change/cancel menu actions are also reachable. Plain MODIFY/CANCEL keywords only ask for identifying details; they do not themselves mutate a reservation.
4. `api/_services/whatsapp/conversation.js` exposes lookup/modify/cancel tools and passes the receiving account, message ID, restaurant timezone and language to `executeTool`.
5. Lookup and changes use the session restaurant and transport sender. Reservation codes are identifiers, not credentials. Lookup filters returned rows by sender ownership; mutations compare the exact stored phone after normalized ownership verification.
6. Tool results go back to the AI, whose reply is sent through the original verified receiving account. The processor guards send attempts, persists pending replies, and adds assistant history only after the send is accepted. No second template/email is sent by the modify/cancel tools.

## Reproduced and fixed

Eleven selected new unit cases failed before the runtime changes. They demonstrated truncated fractional/junk party sizes, impossible dates or clock times reaching UPDATE, a past-date update, concurrent changes being overwritten, and cancelled reservations retaining table references.

- Reschedules validate the merged date/time/party input. Digit strings remain supported; zero/null/fraction/junk and the existing greater-than-50 limit fail without UPDATE.
- Past slots are compared with the restaurant-local clock. A missing timezone refuses a change instead of guessing. Repeated unchanged values are read-only successes, including retries after a committed change.
- UPDATE retains tenant/phone/status predicates and also compares the original date/time/party snapshot. A concurrent change produces a failed tool result without overwriting the newer booking.
- Cancellation changes only status and clears `table_ids`; it does not change physical table status, historical receipts, billing or usage.
- Contradictory joined-session/FK tenant identifiers fail before reservation reads.

The Meta integration tests now require successful tool results and actual mutation payloads. Previously their model stubs could say “cancelled” or “modified” after an ownership refusal because their reservation fixture lacked a customer phone.

## Remaining gap and release limit

This is not transactional capacity-safe rescheduling. The existing modify tool still bypasses the create-booking admission RPC: it has no atomic capacity/business-hours admission and does not reassign previously allocated tables. A safe admission contract must exclude the current reservation from its own occupancy and coordinate competing writes. Other channels must participate before claiming cross-channel capacity guarantees. No migration or database change is included here.

The parent owns `api/_lib/reservation-mutations.js` and any atomic RPC/migration. No Supabase module or shared core is edited here. Its adapter contract needs the trusted restaurant/sender, original reservation identifier, requested fields and inbound identity; it must atomically verify ownership/status/date/hours/capacity, preserve the original identifier, update table allocations and return committed facts or a refusal. The adapter owns language and sending. Native shared-phone lookup/modify/cancel remains blocked until guest verification; WhatsApp sender evidence must not relax that phone boundary.

Existing terminal-status policy is also unchanged: the tools explicitly reject cancelled reservations but do not define a complete seated/completed/no-show change policy. The parent should not interpret this patch as a completed audit of that policy.

Modify/cancel replies are ordinary channel messages, not new tracked booking-confirmation attempts. Existing confirmation delivery rows remain historical evidence; neither a tool success nor Meta API acceptance proves delivery of a change/cancellation reply.

## Verification

Nine focused backend suites passed 97 tests, including 27 direct change-flow cases, Meta routing/tool execution, Twilio compatibility, booking replay, tenant/sender ownership, receiver isolation, scoped sessions and inbound reply recovery. Old ownership fixtures now use explicit timezones and frozen clocks. API/test syntax and whitespace checks passed.

No provider/DB writes, real messages, deployment, credentials or original-checkout edits occurred. The parent owns actual sandbox messaging and release verification.

Reference: [Supabase update and returned-row behavior](https://supabase.com/docs/reference/javascript/update).
