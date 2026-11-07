# Shared voice line: reject legacy authentication

- [x] Reproduce the missing-agent-ID bypass with a legacy Bearer token and a signed request.
- [x] Reject requests naming the shared line unless they use its dedicated scoped tool secret.
- [x] Run the complete local verification suite.
- [ ] Merge a green PR and verify the exact production deployment and smoke.
- [ ] Recheck the shared-tool endpoint after the production environment variables are included.

## Review

The shared agent ID alone was protected, but a request could omit it and present the shared phone number to the older routing path. The new guard covers the called-number header and legacy phone hints before any restaurant lookup or tool dispatch. The two regression tests returned HTTP 200 before the change and HTTP 403 afterward.

Local verification: 320 backend suites passed (4,602 tests), 138 frontend suites passed (1,111 tests), client production build passed, and API syntax check passed.
