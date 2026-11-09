# Sandbox telephone reservation and WhatsApp confirmation

- [x] Preserve the dirty original checkout; use an isolated branch from released main.
- [x] Confirm the owned sandbox restaurant and current provider routes without changing the shared production line.
- [x] Find an owned, verified automated caller that can receive WhatsApp and use the existing supported Meta sender.
- [x] Place a bounded real provider telephone call with a uniquely named sandbox reservation.
- [x] Verify initial call completion, reservation linkage, actual WhatsApp receipts and matching dashboard states; fail the journey on duplicate booking/message.
- [ ] Fix reproducible gaps with tests, release through main checks and repeat the affected real journey.
- [ ] Cancel the tagged reservation and remove temporary credentials; preserve redacted evidence.

Never spoof the owner's caller identity or use Inner. A simulated callback, an accepted send, a dashboard row and actual delivery are distinct evidence. No invented delivery or manual rewriting of provider receipt states. Never weaken tenant or caller binding to make the test pass.

## Reproduced production failure

One authorized automated Twilio call used the owner's provider-verified Spanish caller ID. The caller repeated confirmation of the same booking. The shared conversation created two reservations and sent two WhatsApp templates, both delivered. Both exact tagged sandbox records were cancelled and their tables cleared; call and receipt evidence remains.

Fix design: bind each shared conversation to one durable voice booking through the existing unique `(restaurant_id, source, external_id)` index. Sequential replay returns the existing booking before availability checks. Concurrent insert losers resolve the same key. Neither replay sends another message nor repeats billing/email side effects. Different requested booking details require an explicit change flow, never another create. Only verified server context supplies this key; model arguments cannot choose it. Respect disabled outbound notices separately. No shared-number routing changes.

The trusted conversation binding records the writer protocol for new calls. Existing calls recover only through durable reservation linkage or one unambiguous successful tool result; missing/contradictory legacy evidence fails closed. Replays repair missing conversation linkage through a caller/tenant-scoped conditional write. Post-call ingestion uses a guarded snapshot and bounded retry so it cannot replace a concurrent booking outcome with information-only. Both changes received independent review.

The existing production external-ID index was inspected and verified unique/valid/ready. Migration `20261109231933_voice_booking_external_key_guard.sql` records and asserts the same contract for fresh environments; it was applied successfully without changing production columns/index definitions, privileges or routing.

## Evidence before repair

- Actual Twilio call `CA418bcac208ffedefecbbda3ad3abd0b8`, completed, 130 seconds.
- Provider conversation `conv_5501m7181g24f7eaq3tkezjrc6m6`, sandbox restaurant `0761e937-6eec-44be-b1d7-34b4209c7f30`.
- Two bookings: `RES-20261109-9RwrLeSthZy0`, `RES-20261109-k6mSDBD6i6Zb`; two independent Meta-delivered receipts.
- Both exact records cancelled and table assignments released; zero active tagged bookings remain.
- Calls updated to the completed duration, Portuguese language/transcript and booking result without a document reload. These observations do not make the duplicate journey pass.

## Release verification

Frontend: 152 suites / 1,326 tests passed; TypeScript/Vite build passed, existing large-chunk warnings only. Final backend: 337 suites / 4,814 tests passed, with six pre-existing skips. All 773 API JavaScript files passed syntax checks; fire-and-forget and phantom-column audits passed. After release, repeat the real phone call with repeated confirmation, require exactly one keyed reservation and one delivered Meta receipt, then verify matching Calls and reservation message states in the authenticated dashboard. Restore the original sandbox outbound-notification setting and cancel all new tagged test bookings after verification.
