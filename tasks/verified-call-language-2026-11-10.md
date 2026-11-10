# Verified completed-call language

- [x] Start an isolated branch from origin/main `ae3585e8`.
- [x] Inspect only relevant language fields in private call archives 112 and 113.
- [x] Reproduce metadata pt overriding verified native en/es switch results.
- [x] Prefer the last successful agent language-detection result; validate fallback metadata.
- [x] Verify ingestion guards, focused tests and syntax; prepare the local commit without pushing.

## Evidence and scope

Both full archived provider calls report metadata.main_language=pt. Their agent
transcript tool results contain explicit successful language_detection events with
language=en and language=es respectively. No user speech or tool-call arguments
are language authority. Only successful native results count, and a later failure
must not discard an earlier valid success. Unknown final language is null.

Do not reset fetched markers, reingest historical calls, repair database rows,
change provider settings, or touch operator scripts. The parent owns any reviewed
historical repair. Tenant/booking/outcome/dedup guards and LLM behavior stay intact.

## Verification

The English/Spanish regression cases failed before the fix. Six focused suites
then passed all 92 tests, covering malformed/error results, last successful
switches, user/system/assistant lookalikes, metadata fallback and unknown=null,
tenant binding, booking outcomes, deduplication, webhook ingestion, hourly sync,
and analysis retry. Provider sentiment avoids any additional LLM call in the new
language-selection tests.

Writer audit: the only production reader of `main_language` is this ingestor.
`api/elevenlabs-post-call.js` and `api/_crons/sync-conversation-data.js` both call
it. Hourly sync selects only rows with `elevenlabs_fetched_at IS NULL` and forwards
the full provider event unchanged. Inline enrichment and hourly analysis retry
write summary/sentiment/analysis markers, never language. No cron or analysis
source changes are needed, and completed-row deduplication is unchanged.

The full backend/frontend/build/API-syntax checks are run separately; results are
reported with the commit handoff. No external provider API, database row,
historical repair, or provider/model/operator setting is changed by this task.

## DTO compatibility follow-up

Full archives 112/113 contain both decoded `result` objects and JSON `result_value`
strings, with `type=system` and `tool_has_been_called=true`. When decoded result is
absent/null, the same positive payload validation applies to raw result_value.
When both are present, both must validate to the same normalized language;
malformed or conflicting representations preserve the previous valid switch.
An invalid present decoded result is not rescued by a raw alternative.

Explicit non-system type or any present non-true execution flag is rejected.
Missing flags remain compatible with legacy/sanitized DTOs, while the agent-turn,
tool-name, explicit is_error=false, result_type, status and language checks remain
mandatory. Twelve compatibility regressions failed before the follow-up fix.
After the fix, all 114 focused tests across six ingestion/guard suites passed,
as did the changed logger syntax and whitespace checks.
