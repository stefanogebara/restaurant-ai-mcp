# Post-call summary language

- [x] Reproduce English summary for a Portuguese conversation.
- [x] Confirm provider `summary_language` is unset and publish a Portuguese (Brazil) canary.
- [x] Verify the next provider summary and Seatable record are in Portuguese.
- [x] Set an explicit summary language on new agents and cover language mapping.
- [x] Inventory existing agents, update only matching configurations, and verify readback.
- [ ] Verify CI, deployment, and a new production conversation.

Review: canary conversation `conv_0601m6vn9r3bees8e8z7z8jsq2r6` stored a Portuguese summary after the provider change. Of 23 Seatable agents, 22 now have an explicit summary language; the one provider/database language mismatch was preserved. Provider readback matched 23/23 expected states. Local verification before the final regional edge-case adjustment: 4,574 Jest tests, 1,110 Vitest tests, API syntax and frontend build passed. After the adjustment, 17 focused Jest tests and syntax passed; full CI is the release gate.
