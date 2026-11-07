# Recover post-call analysis

- [x] Confirm the live `agent_conversations` schema and constraints.
- [x] Confirm provider `main_language` and `sentiment_analysis.overall_label` from a real completed preview; persist these without another LLM call.
- [x] Add bounded retry state for calls whose transcript was saved but sentiment analysis did not finish.
- [x] Claim retry work atomically in the existing sync cron; never repeat successful analysis.
- [x] Cover timeout, duplicate claim, valid result, and exhausted attempts.
- [x] Run backend tests, frontend tests, API syntax check, and frontend build.
- [ ] Apply the additive migration, merge a green PR, verify the exact production deployment and live smoke.

## Review

Local verification: 319 backend suites / 4,568 tests, 138 frontend files / 1,107 tests, API syntax and frontend build passed before the provider-field adjustment. The first backend run failed because the new isolated worktree had no node_modules link; dependencies were linked from the original checkout before the passing run. The provider-field adjustment passed focused post-call tests and awaits PR CI for the full gate.
