# CI sandbox smoke (2026-11-07)

- [x] Confirm the Seatable EU Supabase project; never use Inner.
- [x] Create a dedicated confirmed Auth user and isolated restaurant with four tables.
- [x] Store the new password and email only in GitHub Actions secrets.
- [x] Replace fixture-specific and mutating production smoke with read-only checks.
- [x] Verify the sandbox login and settings API in production.
- [x] Run the new Playwright suite and slow-network check locally against production.
- [x] Pass local build, API syntax, backend tests, frontend tests, and migration audit.
- [ ] Pass GitHub PR checks.
- [ ] Merge, run the production smoke workflow, and inspect the result.

The synthetic restaurant is `Seatable CI Sandbox` (`0761e937-6eec-44be-b1d7-34b4209c7f30`). WhatsApp, surveys, feedback, and proactive notifications are disabled. The CI suite must verify this identity before relying on its data. Never add real guest contacts to it.

Review: production login and settings returned this restaurant; the new four-test Playwright suite passed before the final isolation assertions were added. Slow 3G passed 6/6 checks. Jest passed 4,493 tests and Vitest passed 1,107. The migration audit now ignores commented rollback SQL and confirmed all 42 live tables. The WhatsApp pipeline audit observed no traffic in the last 24 hours and correctly reported no conclusion about its health.
