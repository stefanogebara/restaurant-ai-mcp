# Owner-bound voice agent retry

- [x] Reproduce empty-body retry failure and client-selected tenant risk.
- [x] Resolve the restaurant from the authenticated owner and server config.
- [x] Use canonical ElevenLabs creation with a restaurant-scoped secret.
- [x] Reject duplicate agents and false success after a failed database link.
- [x] Run focused tests, full backend Jest, syntax checks and API audits.
- [ ] Check PR, merge, and verify production by SHA.

## Review

The Voice Settings retry button sends no request body. The old endpoint
required restaurant ID, name, and voice ID from the caller, then created
legacy webhook tools without restaurant authentication. The endpoint now
accepts the existing button request, reads the active non-demo restaurant
owned by the authenticated user, and uses the canonical agent service. The
agent ID is linked only if no other agent was linked during provider creation.
Concurrent retries can still create an unlinked provider agent; they cannot
overwrite the restaurant's linked agent.
Focused tests pass 18/18. Full backend Jest passes 4,523 tests with six
pre-existing skips. Syntax and both static API audits pass. Frontend is unchanged.
