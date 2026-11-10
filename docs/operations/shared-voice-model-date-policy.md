# Shared voice model, date policy and complete booking readback

Real English/Spanish phone consultations showed that the current model could understand the caller without selecting their output language. A Spanish call also guessed 2023 for a date without a year. The server-side availability guard must be live before this operation: an incorrect model date must never receive available=true.

The controlled comparison kept all external tools mocked with unmatched calls raising an error. The candidate changes only the LLM from gpt-4o-mini to gpt-4.1-mini and one exact date-policy paragraph. It requires the restaurant-local clock before every availability/create call, resolves missing years from that clock, refuses explicit past dates without moving the year, and distinguishes validation errors from transport/auth failures. Binding, scope, WhatsApp truthfulness and language built-ins are unchanged. The follow-on readback refinement keeps the configured gpt-4.1-mini model and requires the complete latest guest name plus restaurant/date/time/party size to be read back before a separate explicit confirmation and create call. Corrections remain pending until the revised summary is confirmed; post-create changes still require restaurant-team help.

Candidate acceptance passed 18/18 trace and evaluator checks: implicit English, Spanish after Portuguese, explicit English, Portuguese control, rejected restaurant suggestion and past-date handling, three repetitions each. All nine availability flows used the correct clock/date/party/time. There were no create calls or fallback model tags. Simulator language was fixed per case; this is candidate validation, not pure model A/B and not telephone evidence. PAST_DATE recovery included a seeded validation result; other validation codes were not separately simulated. Temporary tests were deleted and verified absent.

The complete-name readback candidate separately passed 18/18 actual trace checks: PT/EN complete names, Driver-to-River correction with a new confirmation, an explicit refusal, consultation-only intent and rejected restaurant suggestions. All nine positive runs created exactly once after the latest complete-name summary and a separate yes. The negative runs made no create calls. No fallback model tags were observed. Post-create reconfirmation was exercised in only 1/9 positive runs because the others ended first; do not claim complete post-create coverage from these simulations.

The accepted full policy produces operator-report `afterPromptHash` `17a446441b9889f76ec16ce32b4b7f7453f866ed587aee337b733220e0cfd67e`. Compare this field before applying; a different base prompt requires renewed candidate review. The operator accepts the exact original date paragraph or its known date-only intermediate and rejects mixed/unknown states. It applies only the one reviewed paragraph replacement and pinned model, including a prompt-only refinement when that model is already configured.

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
