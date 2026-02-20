---
name: phase-status
description: Show current Seatable roadmap phase status from CLAUDE.md
allowed-tools: Read, Grep
---

# Seatable Phase Status

## Current Roadmap
```
!`grep -A 80 "## Current Roadmap" /c/Users/stefa/restaurant-ai-mcp/CLAUDE.md | head -100`
```

## Instructions

Parse the roadmap above and display a clear status summary:

1. Show which phase is current (IN PROGRESS)
2. Count completed vs total items for each active phase
3. List the next 3-5 unchecked items that need work
4. Suggest which item to tackle next based on priority

Format as a clean summary, not raw markdown.
