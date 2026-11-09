# Keep an open call detail current

The detail query uses infinite freshness and has no polling. Once a user opens an unfinished call, later list refreshes cannot update its separate cached detail. Closing and reopening the same call also reuses that incomplete record.

- [x] Reproduce active-to-completed and close/reopen staleness with failing hook regressions.
- [x] Refresh only an open, unfinished detail for at most ten minutes from the call's original start; pause in background tabs and stop on completion or invalid/expired data.
- [x] Fetch current detail on reopening without changing list or statistics polling.
- [x] Run frontend tests/build and independent review.
- [ ] Confirm CI, exact deployment and authenticated browser behavior.

Do not infer completion from outcome alone: a reservation can be created before the call ends. Preserve the dirty original checkout. No provider routes, messages or production data are modified by this fix.

Three regressions failed before the hook fix. All 1,221 frontend tests and the updated production build passed afterward; independent review passed all 12 focused hook tests with no blockers. Backend code is unchanged from the passing main CI for commit 0719a99.
