# Shared voice model and date policy

Real English/Spanish phone consultations showed that the current model could understand the caller without selecting their output language. A Spanish call also guessed 2023 for a date without a year. The server-side availability guard must be live before this operation: an incorrect model date must never receive available=true.

The controlled comparison kept all external tools mocked with unmatched calls raising an error. The candidate changes only the LLM from gpt-4o-mini to gpt-4.1-mini and one exact date-policy paragraph. It requires the restaurant-local clock before every availability/create call, resolves missing years from that clock, refuses explicit past dates without moving the year, and distinguishes validation errors from transport/auth failures. Binding, consent, scope, WhatsApp truthfulness and language built-ins are unchanged.

Candidate acceptance passed 18/18 trace and evaluator checks: implicit English, Spanish after Portuguese, explicit English, Portuguese control, rejected restaurant suggestion and past-date handling, three repetitions each. All nine availability flows used the correct clock/date/party/time. There were no create calls or fallback model tags. Simulator language was fixed per case; this is candidate validation, not pure model A/B and not telephone evidence. PAST_DATE recovery included a seeded validation result; other validation codes were not separately simulated. Temporary tests were deleted and verified absent.

The accepted candidate produces operator-report `afterPromptHash` `a31fe9e61729ad16e3a3f4cdeaec59a68dc8d504d2b486f1627065d1fb0accf5`. Compare this field before applying; a different base prompt requires renewed candidate review. Local verification passed 5,061 backend tests (6 existing skips), 1,426 frontend tests, build, syntax and static audits. Two independent operator reviews found no blockers.

## Release and apply

1. Release the passing runtime guard and verify its exact production SHA and alias.
2. Run the operation from tested main only after candidate review and passing checks.
3. Inspect the default read-only report and match its prompt to the accepted candidate.
4. Apply with the fresh serving version and a private, exclusive journal path.
5. Verify readback and repeat actual English, Spanish, Portuguese booking/reconfirmation and past-date phone calls.

```sh
node scripts/upgrade-shared-voice-model-policy.cjs \
  --project-ref ckforlwdhewexyqljsaf \
  --workspace-id 638a74e2dad648c4a0745edc358d7eae \
  --branch-id agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e
```

Default is dry-run. Add `--apply --expected-version FRESH_VERSION --manifest /private/path/model-policy-rollback.jsonl` only for the verified release. Never select Inner. The operator repeats the existing shared-agent workspace/project/owned-phone/main-branch/version/zero-procedure checks, journals the prior model and prompt before writing, and reads the new published version back. Only the model and exact date paragraph may change. ASR vocabulary, voices/TTS, language presets/built-ins, webhook IDs/URLs/authentication, routing, workflow, backup-model policy and platform settings are protected. The PATCH sends no external tools or security settings and explicitly pins the already verified empty procedure map.

The API has no conditional PATCH. Avoid concurrent editors; repeated preflight/readback detects drift but cannot make publication atomic. On an uncertain response inspect serving state and the private journal before retrying. No blind retry or automatic rollback is performed. A rollback must restore only the recorded prompt/model after reviewing the current version. Existing fallback-model policy is preserved; configured model and actual per-turn producing model remain distinct evidence.

Preserve raw actual-call evidence and do not count a saved provider configuration or simulation as a telephone/Meta delivery test. Keep WhatsApp disabled for the no-send test and clean up exact tagged sandbox bookings afterwards.
