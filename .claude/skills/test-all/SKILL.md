---
name: test-all
description: Run all Seatable test suites (Jest backend + Vitest frontend) and report results
allowed-tools: Bash(npx jest *), Bash(npx vitest *), Bash(cd *)
---

# Run All Seatable Tests

## Current test results

Backend (Jest):
```
!`cd /c/Users/stefa/restaurant-ai-mcp && npx jest --forceExit 2>&1 | tail -15`
```

Frontend (Vitest):
```
!`cd /c/Users/stefa/restaurant-ai-mcp/client && npx vitest run 2>&1 | tail -15`
```

## Instructions

Report the results above. If any tests failed:
1. List the failing test names and files
2. Show the error messages
3. Suggest fixes if obvious

If all tests pass, report the total counts (e.g., "164 backend + 100 frontend = 264 tests passing").
