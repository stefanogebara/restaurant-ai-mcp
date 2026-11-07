# Recover post-call analysis

- [x] Confirm the live `agent_conversations` schema and constraints.
- [x] Add bounded retry state for calls whose transcript was saved but sentiment analysis did not finish.
- [x] Claim retry work atomically in the existing sync cron; never repeat successful analysis.
- [x] Cover timeout, duplicate claim, valid result, and exhausted attempts.
- [x] Run backend tests, frontend tests, API syntax check, and frontend build.
- [ ] Apply the additive migration, merge a green PR, verify the exact production deployment and live smoke.

## Review

Local verification: 319 backend suites / 4,568 tests, 138 frontend files / 1,107 tests, API syntax and frontend build passed. The first backend run failed because the new isolated worktree had no node_modules link; dependencies were linked from the original checkout before the passing run. A later bounded timeout adjustment passed the focused post-call tests and awaits PR CI for the full gate.
