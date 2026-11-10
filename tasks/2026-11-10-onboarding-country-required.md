# Require an explicit supported onboarding country

Base: fc3125faec0c97ae37229c9100f07260bcc25633.
Scope: api/onboarding/complete.js and its focused tests only, plus this plan leaf.
No live database, provider, browser, or account actions.

- [x] Read the handler, country resolver, timezone helper, and existing tests.
- [x] Prove missing/unsupported country fails before all writes; prove BR defaults with real timezone logic.
- [x] Validate country with the existing supported code/name mapping, without city or phone inference.
- [x] Run focused onboarding and timezone tests, review the diff, and commit.

## Review
The completion suite first failed with 14 failing and 57 passing tests. After the fix, all 71 completion tests passed.
Seven focused onboarding/timezone suites passed: 200 tests total. Both changed JavaScript files pass node --check; git diff --check passes.

Invalid input (missing, blank, unknown, unsupported ISO, inherited object keys, and non-string values) returns structured HTTP 400 field=country with no database calls, user creation, agent creation, knowledge sync, or fetch.
Explicit BR and supported Brazil names persist BR / America/Sao_Paulo / pt / Free. Explicit US remains US despite the Brazilian city and phone. Existing demo-language and explicit voice overrides remain covered with valid country fixtures.

Only the handler, focused completion tests, and this plan leaf changed. No live writes, push, client changes, or guest changes.
