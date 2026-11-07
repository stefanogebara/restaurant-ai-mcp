# ElevenLabs tool secret isolation

- [x] Reproduce cross-restaurant routing with a restaurant-scoped secret.
- [x] Bind restaurant-scoped requests to their authenticated restaurant.
- [x] Scope conversation log reads and writes to that restaurant.
- [x] Add regressions for conflicting IDs, phone, agent, session and conversation hints.
- [x] Run focused tests, full backend suite, static audits and syntax checks.
- [ ] Check PR, merge and confirm production by SHA.

## Review

Before the fix, the secret for restaurant A authenticated a request whose
called-number hint selected restaurant B. The booking handler then received B's
ID. A foreign conversation ID could also direct tool and outcome writes to
another restaurant's log. The request now pins A before routing, and scoped
log queries include A's ID. Legacy globally privileged credentials remain a
separate rotation task.
The focused webhook/logger suites pass 58/58. Backend Jest passes 4,511 tests
with six existing skips; both static API audits pass. The frontend is unchanged
from the previously built and verified main commit.
