/**
 * Deploy-time waste audit — one-shot parallel scan.
 *
 * Fans out 5 independent agents that each hunt a distinct category of
 * Vercel build-time waste. Each agent reads the repo, returns structured
 * findings via a JSON schema. The synthesis stage merges, sorts by
 * estimated savings, and emits a single prioritized report.
 *
 * Run with:
 *   Workflow({ scriptPath: 'scripts/workflows/deploy-time-audit.workflow.mjs' })
 *
 * Notes for the agents (this stays here for the script author — each
 * agent's prompt re-states what it needs to know since agents start
 * with no context):
 *   - Repo is a Vercel-deployed app. Every .js file under api/ becomes
 *     a serverless function unless excluded.
 *   - api/_lib/* is the established library convention (underscore = lib).
 *   - Current build is 15-17 min for ~238 functions. Per-function NFT
 *     trace ~3.4s. Cutting 20 functions saves ~1 min.
 *   - We already KNOW api/services/ (43 files) is library code wrongly
 *     deployed as functions — agents should skip that and find OTHER cases.
 */

export const meta = {
  name: 'deploy-time-audit',
  description: 'Find every Vercel deploy-time waste pattern across the repo and produce a prioritized fix plan',
  whenToUse: 'After /api/demo is unblocked, before applying any deploy-time refactor. Surfaces dead endpoints, mis-classified library dirs, heavy top-level imports, over-tight crons, and unused npm deps.',
  phases: [
    { title: 'Scan',       detail: 'parallel agents investigate 5 distinct waste categories' },
    { title: 'Synthesize', detail: 'merge findings, sort by estimated saving, print one report' },
  ],
}

// One schema for every agent — keeps the synthesis simple.
const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      description: 'One of: library-dirs, heavy-deps, cron-frequency, unused-endpoints, top-level-imports',
    },
    summary: {
      type: 'string',
      description: 'One-paragraph overall summary of what the agent found',
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item: { type: 'string', description: 'File path / package name / cron path' },
          evidence: { type: 'string', description: 'Why this is wasteful — concrete quote or count' },
          estimatedSavingSec: {
            type: 'number',
            description: 'Build seconds saved if the fix is applied. For invocation/cost savings, set to 0 and explain in fix.',
          },
          risk: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'How risky the fix is — low = mechanical, medium = touches imports, high = behaviour change',
          },
          fix: { type: 'string', description: 'Concrete remediation, including any cost/safety considerations' },
        },
        required: ['item', 'evidence', 'fix', 'risk', 'estimatedSavingSec'],
      },
    },
  },
  required: ['category', 'summary', 'findings'],
}

// ---------------------------------------------------------------------
// Agent prompts. Each is fully self-contained — no shared context.
// Each is ~150-300 words. Each tells the agent what tools to use, what
// to return, and what to skip.
// ---------------------------------------------------------------------

const LIB_DIRS_PROMPT = `
Audit a Vercel-deployed Node.js repo for DIRECTORIES under api/ whose files
are library code (export an object via \`module.exports = { ... }\`) but get
auto-deployed as serverless functions because they're under api/. Each such
file wastes ~3.4s of NFT-trace + bundle time per build, plus exposes a
broken URL that returns FUNCTION_INVOCATION_FAILED.

You're hunting for OTHER directories with this pattern. SKIP api/services/
(already known — 43 files, will be moved to api/_services/ separately).

Vercel convention: any file under api/ becomes a function UNLESS it's in
a directory starting with underscore (api/_lib/, api/_services/, etc.) or
the filename itself starts with underscore.

How to find them:
  1. List directories directly under api/ that DON'T start with underscore.
     Use Glob \`api/*/\`.
  2. For each non-underscore directory, sample 3-5 files. Look at their
     last \`module.exports = ...\` line (use Grep "^module.exports" or
     Read the file's tail).
     - \`module.exports = async (req, res) =>\` or \`module.exports = function (req,\` → real handler, KEEP
     - \`module.exports = { something }\` → library, FLAG
  3. If MOST files in a directory are library-shaped, flag the whole
     directory as a candidate to move to api/_<name>/.

Known good directories that should NOT be flagged:
  - api/cron/ (real handlers, scheduled by vercel.json)
  - api/onboarding/ (likely handlers)
  - api/instagram/ (likely handlers)
  - api/ml/ (mostly handlers but verify)

For each directory you flag, include:
  - item: the dir path (e.g. "api/foo/")
  - evidence: count of library-shape files vs handler-shape files
  - estimatedSavingSec: number-of-library-files × 3.4
  - risk: "medium" (touches import paths)
  - fix: rename suggestion + estimated import-site count

Return a FindingReport with category="library-dirs".
`.trim()

const HEAVY_DEPS_PROMPT = `
Audit a Vercel-deployed Node.js repo for HEAVY npm dependencies that are
top-level required by many handlers but only USED in a small code path.
NFT statically traces \`require('pkg')\` at module top and bundles the
entire package into every importing function — even if the runtime never
calls it. Lazy-requiring inside the specific function that needs it lets
NFT prune.

Step 1 — read package.json's "dependencies" block. Heavy packages to
focus on (large install size, native addons, or big transitive trees):
  - twilio
  - stripe
  - @sentry/node
  - pdf-parse
  - web-push
  - @anthropic-ai/sdk
  - openai
  - jwks-rsa

Step 2 — for each heavy package, count how many api/*.js files require
it at module-top:
  Grep -n "^const.*require\\('twilio'\\)" -r api --type js

Step 3 — for each file that top-level requires a heavy dep, briefly read
the file and decide: is the dep used in EVERY code path, or only ONE
function? If only one, it's a lazy-load candidate.

Output ONE finding per (package, file) pair that's lazy-load-able. Skip
files where the dep is used pervasively.

For each finding:
  - item: "api/<file>.js — requires <pkg>"
  - evidence: "Top-level require, used only in <function-name>"
  - estimatedSavingSec: 0.5 (NFT trace overhead — small but adds up)
  - risk: "low" (move require inside function)
  - fix: "Move \`const { X } = require('<pkg>')\` from line N to inside <function-name>"

DO NOT flag api/_lib/* files — those are libs shared across handlers
where pervasive use is expected.

Return a FindingReport with category="heavy-deps".
`.trim()

const CRON_AUDIT_PROMPT = `
Audit a Vercel project for cron schedules that are tighter than they need
to be. Every cron invocation costs CPU-seconds — \`*/5 * * * *\` (every
5 min) at 288 runs/day is 9.6× as expensive as \`30 * * * *\` (every hour,
24 runs/day). The repo's CLAUDE.md says: "Crons: NEVER more than */15
unless absolutely required" and "Default to hourly or daily, not every-N-
minutes". A previous $375/month Vercel bill incident traces to over-tight
crons.

Step 1 — read vercel.json, look at the "crons" array.

Step 2 — for each cron with a "*/N" schedule (or "* * * * *" which is
every minute), open the handler file and decide if the work is actually
time-sensitive:
  - Time-sensitive (keep tight cadence): late-reservation detection,
    no-show flagging, real-time conversation sync, campaign sends with
    drift sensitivity.
  - NOT time-sensitive (relax to hourly/daily): cache warming,
    analytics rollups, reflections, briefings, churn-score recompute,
    proactive comms, monitoring polls, anything that batches its own
    work internally.

Step 3 — for each over-tight cron, recommend a relaxed schedule and
estimate the daily invocation reduction.

For each finding:
  - item: "<cron path> — <current-schedule>"
  - evidence: "Handler does <X>, which doesn't need <current-frequency>"
  - estimatedSavingSec: 0 (cost saving, not build saving — explain in fix)
  - risk: "low" if the handler is idempotent and just relaxes schedule,
    "medium" if it might miss a time-sensitive event
  - fix: "Change schedule to '<new-schedule>'. Saves N daily invocations."

Return a FindingReport with category="cron-frequency".
`.trim()

const UNUSED_ENDPOINTS_PROMPT = `
Audit a Vercel project for api/ handlers that NO ONE calls. Dead endpoints
still consume ~3.4s of NFT + bundle per build, plus they're a security
surface (every URL is hittable in prod).

For each candidate handler file at api/*.js (top-level only, ~125 files),
check whether ANYTHING references its route. The route for a file at
\`api/<name>.js\` is \`/api/<name>\`. The route for \`api/<dir>/<name>.js\`
is \`/api/<dir>/<name>\`. For \`api/<name>/index.js\` it's \`/api/<name>\`.

References to look for:
  1. vercel.json: "rewrites" pointing to /api/<name> or /api/<name>.js
  2. vercel.json: "crons" with path /api/<name>
  3. client/ code: \`fetch('/api/<name>')\` or any string literal
     "/api/<name>" — Grep for the path
  4. Other api/ handlers: \`require('./<name>')\` (cross-handler imports
     ARE A KNOWN VERCEL BUG that drops functions, but they DO count as
     a reference for this audit)

If NONE of the four reference types hits → likely dead, flag.

Skip these known-good even-if-no-direct-reference handlers:
  - api/api-not-found.js (catch-all target)
  - api/sitemap.js (referenced via /sitemap.xml rewrite)
  - api/_lib/* (not function files)
  - Webhook receivers (whatsapp-webhook, stripe-webhook, etc.) — only
    flag these if you can't find their secret-keyed config anywhere.

For each flagged handler:
  - item: "api/<file>.js"
  - evidence: "No rewrite, no cron, no client fetch, no internal require"
  - estimatedSavingSec: 3.4
  - risk: "low" if obviously dead, "medium" if might be a webhook
    receiver called by an external service
  - fix: "Delete the file. If it might be an external webhook,
    \`git mv\` it to \`/api/_unused/<name>.js\` for safety instead."

Return a FindingReport with category="unused-endpoints".
`.trim()

const TOP_LEVEL_IMPORTS_PROMPT = `
Audit handlers for IMPORTS THAT NEVER NEED TO LOAD AT REQUEST START.
Pattern to find: api/*.js files that top-level require modules whose
SOLE caller is one specific function inside the same file. Hoisting that
require into the function (lazy-load pattern) lets Vercel NFT prune the
dependency from cold-start and from the function's bundle.

This is different from the heavy-deps audit (which focuses on the
npm package). Here we're hunting:
  - require('./_lib/X') — local library where the X is only used in
    one path. Bundle still includes it, but if the path is rare,
    lazy-load shaves cold start.
  - require('crypto'), require('node:fs') and similar — Node builtins
    are free, SKIP these.

For each candidate:
  1. Find all top-level requires in the file (just the first 50 lines).
  2. For each required binding (the destructured names), Grep within the
     same file for usages. Count occurrences.
  3. If a binding is used in only ONE function, that's a candidate.

Skip files under 100 lines (refactor isn't worth it).

For each finding:
  - item: "api/<file>.js — <binding-name> from <module>"
  - evidence: "Used only inside <function-name> at line N"
  - estimatedSavingSec: 0.3 (small per-file, but adds up)
  - risk: "low" (mechanical move)
  - fix: "Move require inside <function-name>. Example diff: ..."

Be conservative — only flag clear single-call-site patterns. If a
binding is used in 2+ functions, leave it alone.

Return a FindingReport with category="top-level-imports".
`.trim()

// ---------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------

log('Starting deploy-time audit — 5 parallel agents.')
phase('Scan')

const auditResults = await parallel([
  () => agent(LIB_DIRS_PROMPT,         { label: 'lib-dirs',         schema: FINDING_SCHEMA }),
  () => agent(HEAVY_DEPS_PROMPT,       { label: 'heavy-deps',       schema: FINDING_SCHEMA }),
  () => agent(CRON_AUDIT_PROMPT,       { label: 'cron-frequency',   schema: FINDING_SCHEMA }),
  () => agent(UNUSED_ENDPOINTS_PROMPT, { label: 'unused-endpoints', schema: FINDING_SCHEMA }),
  () => agent(TOP_LEVEL_IMPORTS_PROMPT,{ label: 'top-level-imports',schema: FINDING_SCHEMA }),
])

phase('Synthesize')

const reports = auditResults.filter(Boolean)
log(`Got ${reports.length}/5 reports back`)

// Flatten findings, tag each with its source category, sort by estimated
// build-second saving (cost savings are weighted by counting as 1s per
// 100 daily invocations saved — keeps the ranking sane).
const flat = []
for (const r of reports) {
  for (const f of r.findings) {
    flat.push({ category: r.category, ...f })
  }
}

flat.sort((a, b) => (b.estimatedSavingSec || 0) - (a.estimatedSavingSec || 0))

// Group by category for the report
const byCategory = {}
for (const r of reports) {
  byCategory[r.category] = {
    summary: r.summary,
    count: r.findings.length,
    totalSavingSec: r.findings.reduce((s, f) => s + (f.estimatedSavingSec || 0), 0),
  }
}

const totalSavingSec = flat.reduce((s, f) => s + (f.estimatedSavingSec || 0), 0)
const totalFindings = flat.length

log(`Total findings: ${totalFindings}`)
log(`Total estimated build-time saving: ${totalSavingSec.toFixed(0)}s (~${(totalSavingSec/60).toFixed(1)} min)`)

return {
  totalFindings,
  totalEstimatedSavingSec: Math.round(totalSavingSec),
  totalEstimatedSavingMin: +(totalSavingSec / 60).toFixed(1),
  byCategory,
  // Top 25 highest-impact findings — full list is in the .top field
  topFindings: flat.slice(0, 25),
  allFindings: flat,
}
