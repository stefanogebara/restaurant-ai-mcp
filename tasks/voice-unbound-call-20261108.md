# Shared voice calls without restaurant identification

- [x] Trace post-call 500 on an unbound shared telephone conversation.
- [x] Confirm the hourly sync can fetch a provider transcript after a late binding appears.
- [x] Reproduce the webhook failure with focused tests.
- [x] Acknowledge only conversations with no durable binding and no restaurant, without writing tenant call data.
- [x] Verify full suites and review the focused diff.
- [ ] Verify PR checks, merge, main checks, exact deployment and production behavior.

## Review

The new unbound-call tests failed on `Shared conversation is not bound` before implementation. Focused post-call and sync tests pass (29/29). Existing rows with missing scope still fail; database failures still propagate. Full backend: 320 suites and 4,605 tests passed (one existing skipped suite, six skipped tests). Frontend: 138 suites and 1,111 tests passed. Client build, API syntax, and `git diff --check` passed. Release is pending.
