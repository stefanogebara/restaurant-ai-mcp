# Seatable Project Wiki

> Auto-compiled via `node scripts/compile-project-wiki.js` (Karpathy LLM Wiki pattern).
> Raw codebase data → Claude Haiku → structured articles.

## Articles

- [[architecture]] — **Architecture Overview** _(2026-04-23)_
- [[recent-changes]] — **Recent Changes** _(2026-04-23)_
- [[api-endpoints]] — **API Endpoints** _(2026-04-23)_
- [[database]] — **Database Schema** _(2026-04-23)_
- [[active-issues]] — **Active Issues & TODOs** _(2026-04-23)_

## Commands

```bash
# Compile all (skips unchanged data)
node scripts/compile-project-wiki.js

# Force recompile everything
node scripts/compile-project-wiki.js --force

# Single article
node scripts/compile-project-wiki.js --slug=recent-changes
```

## Obsidian

Open `docs/wiki/` as an Obsidian vault. `[[wikilinks]]` resolve between articles.
Add this vault to Obsidian → Open folder as vault → select `docs/wiki/`.

## Claude Code Hook

Add to `~/.claude/settings.json` to auto-refresh on session start:
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "restaurant-ai-mcp",
      "hooks": [{"type": "command", "command": "node scripts/compile-project-wiki.js"}]
    }]
  }
}
```
