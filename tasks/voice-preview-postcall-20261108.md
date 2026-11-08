# Shared voice preview post-call handling

- [x] Reproduce the unbound text-preview post-call failure with a focused test.
- [x] Acknowledge only unbound non-telephony shared-agent previews without writing call data.
- [x] Keep unbound telephone calls and conflicting bindings fail-closed.
- [x] Run focused and full verification, then review the diff and release separately.

## Review

The new test failed on the existing `Shared conversation is not bound` exception, then passed after the narrow guard. Focused post-call suites: 22/22 passing. Full backend: 320 suites and 4,603 tests passed (one pre-existing skipped suite, six skipped tests). Frontend: 138 suites and 1,111 tests passed. Production build and all API syntax checks passed. `git diff --check` passed. Release and production behavior still need independent verification.
