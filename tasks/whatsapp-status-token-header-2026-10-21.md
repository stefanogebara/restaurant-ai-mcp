# WhatsApp status probe: keep the Meta token out of URLs

## Plan

- [x] Move the Graph API token to the Authorization header and bound the request.
- [x] Add focused regression tests for auth, URL, HTTP errors, and timeout.
- [x] Run full Seatable verification, then open one bounded PR.
- [ ] Confirm the main commit and production alias after merge.

## Review

The status probe no longer places credentials in the request URL. It sends a Bearer header,
aborts after five seconds, and does not return raw network exception text to the client.
It does not change connection, routing, or send behaviour.

| Check | Result |
|---|---|
| Frontend build | PASS; existing chunk-size and mixed-import warnings |
| API syntax | PASS |
| Backend Jest | PASS; 307 suites, 4,457 tests (6 skipped) |
| Frontend Vitest | PASS; 138 files, 1,105 tests |
| Diff whitespace | PASS |

Authenticated production probe requires sandbox credentials and must not be simulated
with the owner's personal account.
