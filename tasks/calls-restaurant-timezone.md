# Calls in restaurant time

- [x] Use the restaurant's configured time zone for call list and detail timestamps.
- [x] Label the displayed time zone and make CSV exports unambiguous.
- [x] Cover the Madrid/São Paulo mismatch with a regression test.
- [ ] Verify checks, exact deployment, authenticated 320/390px view, and post-alias smoke.

Review: 138 frontend test files / 1,110 tests, 4,572 backend tests, type check and frontend build passed before the CSV year adjustment. After the adjustment, focused tests and frontend build passed. PR CI will rerun the full gate on the final commit.
