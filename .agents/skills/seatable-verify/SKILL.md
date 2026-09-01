---
name: seatable-verify
description: Full Seatable verification - build, syntax check API, and test. Use after completing any feature or fix.
allowed-tools: Bash(npm *), Bash(npx *), Bash(cd *), Bash(node *), Read, Grep
---

# Seatable Full Verification

Run all verification steps and report results.

## Step 1: Frontend Build
```
!`cd /c/Users/stefa/restaurant-ai-mcp/client && npm run build 2>&1 | tail -5`
```

## Step 2: API Syntax Check
```
!`cd /c/Users/stefa/restaurant-ai-mcp && for f in api/*.js api/_lib/*.js; do node -c "$f" 2>&1 || echo "SYNTAX ERROR: $f"; done 2>&1 | grep "SYNTAX ERROR" || echo "All API files pass syntax check"`
```

## Step 3: Backend Tests (Jest)
```
!`cd /c/Users/stefa/restaurant-ai-mcp && npx jest --forceExit 2>&1 | tail -8`
```

## Step 4: Frontend Tests (Vitest)
```
!`cd /c/Users/stefa/restaurant-ai-mcp/client && npx vitest run 2>&1 | tail -8`
```

## Instructions

Review each step above. Create a summary table:

| Check | Status | Details |
|-------|--------|---------|
| Frontend Build | PASS/FAIL | ... |
| API Syntax | PASS/FAIL | ... |
| Backend Tests | PASS/FAIL | X/Y passing |
| Frontend Tests | PASS/FAIL | X/Y passing |

If anything fails, investigate and suggest fixes. Do NOT make changes - only report.
