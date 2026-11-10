# Preserve booking details when opening reservation management

Base: origin/main 7c17d83a. Worktree: restaurant-ai-mcp-booking-handoff.

- [x] Trace both booking success handlers, receipt actions, and explicit portal lookup.
- [x] Reproduce missing router handoff with renderer tests before changing production code (2 failed).
- [x] Carry the complete returned receipt and original entered phone in router state.
- [x] Bind the handoff to the exact displayed receipt code and validate the phone string.
- [x] Reject reload/direct history state; leave the existing manual lookup available.
- [x] Preserve formatting in prefilled fields and require explicit server-validated lookup.
- [x] Verify 29 focused renderer tests and compatibility with PR306's separate copy patch.
- [x] Pass TypeScript project checks (tsc -b), focused ESLint, and git diff --check.

The tests exercise the real booking form, confirmation, portal, router, and React Query hooks. Only HTTP and the deposit processor callback are simulated. Both booking success handlers and both receipt management buttons are covered. Prefilled values never populate private results or trigger lookup automatically. API response contracts, authentication, backend handlers, and persistent storage are unchanged. No browser, provider, or database operations were performed.

PR306's patch passes git apply --check against this worktree. This change does not touch its copy, locale files, or test file. No merge or deployment is authorized in this lane.
