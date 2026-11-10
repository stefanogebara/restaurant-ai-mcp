# Preserve onboarding country picker compatibility

Follow-up to d4ae0dbd, still in the isolated onboarding-country worktree.
Scope: completion handler, focused completion tests, and this plan leaf only.

- [x] Audit client/src/data/countries.ts in the isolated base, original checkout, and parent checkout. All offer the same 18 countries.
- [x] Identify the backend mismatch: Belgium/BE/fr, Switzerland/CH/fr, Austria/AT/de.
- [x] Confirm existing timezone helper mappings: Europe/Brussels, Europe/Zurich, Europe/Vienna.
- [x] Prove each picker code/name is accepted with its configured voice language and non-UTC valid IANA timezone.
- [x] Add the three missing supported countries; retain Japan and previous aliases.
- [x] Run related tests and syntax checks, review, and commit.

## Review
Ecuador/EC and Uruguay/UY are absent from all three audited UI lists and lack timezone mappings in the current helper. They are not added as an unreviewed new product capability. Missing/unknown country remains fail-closed, with no city/phone inference. No client, DB, provider, or browser writes.

Verification: the new parity checks first failed in 9 cases (BE/CH/AT code/name plus explicit expected timezone cases), with 103 passing tests. After the three-country mapping fix, all 241 tests in 7 related onboarding/timezone suites pass. Syntax checks and git diff --check pass.

The parity fixture reads the actual client country definitions and checks that it parsed every offered code. All 18 codes and full names must complete successfully with the picker language, a non-UTC valid IANA timezone, and the correct Free/Growth subscription. The three new countries also assert exact timezone constants. No timezone-helper or client edits are required.
