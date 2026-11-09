# Reservation WhatsApp receipts

- [x] Map voice send, authenticated dashboard and signed Meta callbacks.
- [x] Persist correlation before send; scope receipts by sender, recipient and random ID.
- [x] Apply receipt transitions atomically; preserve delivery against late sends/failures.
- [x] Verify database transitions, tenant isolation and batched signed webhooks.
- [x] Display translated receipt state beside the reservation.
- [ ] Run full suites, build, isolated review and CI.
- [ ] Release and verify exact production SHA, alias, smoke and sandbox behavior.

Historical messages are not reconstructed. Requested/accepted are not proof of delivery. Never use Inner.

## Local review

Backend: 329 suites / 4,709 passed; 6 pre-existing skipped tests. Frontend: 144 files / 1,171 passed. Final mobile layout: 55 focused tests passed. Playwright fixture: seven states in EN/PT/ES at 320/390/1200 px without overflow; badge occupies one line. Migration applied to seatable-eu; rollback-only SQL regression passed. Service-only table intentionally has no client RLS policy. No historical delivery claims or provider route changes.
