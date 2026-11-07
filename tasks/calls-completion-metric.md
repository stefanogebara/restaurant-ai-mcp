# Calls completion metric

- [x] Define a completed call from stored outcomes and keep booking conversion separate.
- [x] Cover the API and visible card with focused tests.
- [x] Implement and verify the API and labels.
- [ ] Verify the responsive UI in the authenticated owner account.
- [ ] Run required checks, merge after its own gates, and verify the live owner view.

Review: Jest 318 suites/4563 tests passed (1 suite and 6 tests skipped); Vitest 138 files/1108 tests passed; frontend production build passed. The existing `success_rate` API field remains booking conversion for compatibility, while the card now uses `completion_rate` (bookings plus information calls). The stats query also selects `language`, which its breakdown previously read without fetching.
