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

## Review correction: consume proof instead of only rejecting reloads

Navigation type alone prevents prefill on reload but leaves the phone in persisted browser history. Both confirmation and portal now capture validated proof once in component-local state and replace the current route state through React Router, removing receiptId/customerPhone even when invalid. All other route state, pathname, search, and hash survive. The confirmation management action rechecks the displayed receipt before forwarding its captured handoff. Portal fields survive replacement locally; returning through history or remounting cannot recover proof. BrowserRouter tests inspect history.state.usr plus the router index and key; MemoryRouter tests cover immediate prefill, Back/Forward, and reload-style remounts.

The new consumption assertions failed in 5 cases before implementation. All 34 focused tests now pass, including a cache update that changes the displayed receipt after local capture. No lookup occurs during state replacement. The draft remains for review.
