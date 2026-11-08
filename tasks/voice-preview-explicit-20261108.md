# Shared voice preview discriminator

- [x] Inspect an actual Seatable Orchestrator text-preview conversation from ElevenLabs.
- [x] Add a regression test: absent phone metadata alone must not discard an unbound call.
- [x] Require the provider's explicit `metadata.text_only === true` before acknowledging an unbound preview.
- [x] Verify local suites and review the focused diff.
- [ ] Verify PR checks, exact deployment and production behavior.

## Review

The provider's conversation detail returned `metadata.text_only=true`, `metadata.phone_call=null`, and a text-only client override for the preview. Both regression tests failed before their corresponding guard changes. Focused post-call tests: 24/24. Full backend: 320 suites, 4,605 tests passed (one existing skipped suite, six skipped tests). Frontend: 138 suites, 1,111 tests passed. Client build and all API syntax checks passed. Release remains pending.
