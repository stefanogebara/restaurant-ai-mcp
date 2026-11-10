# Shared-call stub language

- [x] Check the language column before choosing an unknown value.
- [x] Reproduce the fabricated English language in a new shared-call binding.
- [x] Insert an explicit null without changing final provider-language ingestion.
- [x] Verify binding, post-call, frontend, syntax, and build checks.
- [x] Prepare the local commit without pushing.

## Schema evidence

On 2026-11-10, official Supabase read-only queries against `seatable-eu`
(`ckforlwdhewexyqljsaf`) showed `public.agent_conversations.language` is nullable
`text`, defaults to `'en'::text`, and the table has no CHECK constraints. Explicit
null is required: omitting the column would retain the English default. No database
or provider data was changed.

## Scope

Only the new shared-call binding starts with unknown language. Existing bindings
must not be rewritten, and completed-call ingestion must continue to use the
provider's detected language. Tool handlers, navigation, and provider configuration
are outside this fix.

## Review

The new binding regression failed on the original hardcoded English value for
Portuguese, English, and Spanish restaurant configurations. All 129 focused tests
then passed with explicit null. Reidentification retains existing null or detected
language. Shared post-call tests verify provider `pt-BR`, `en-US`, and `es` still
persist `pt`, `en`, and `es`; missing or invalid detection does not invent a value.

The production change is limited to the binding insert. Post-call ingestion and UI
rendering are unchanged. Calls already hides language until `ended_at` exists, and
its detail view falls back to Unknown for a completed call without a language.

| Check | Result |
| --- | --- |
| Focused backend | 6 suites, 129 tests passed |
| Full backend | 343 suites, 4,993 tests passed; 1 suite / 6 tests skipped |
| Full frontend | 157 files, 1,393 tests passed |
| Production build | TypeScript and Vite passed |
| API syntax | 210 files passed |
| Whitespace | `git diff --check` passed |

Worktree: `seatable-shared-stub-language/restaurant-ai-mcp`.
Branch: `codex/shared-voice-stub-language`, based on `f36c94e8`.
No tool handlers, navigation, database rows, or external providers were changed.
This is local verification; no new telephone call or deployed behavior is claimed.
