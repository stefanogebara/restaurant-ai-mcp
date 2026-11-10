# Shared voice language recovery

The live English consultation case was understood correctly but answered in Portuguese. No booking or message was made. The serving agent had English/Spanish presets, a language-detection builtin with an empty description and switching restricted to the first two user turns. Portuguese examples in its prompt were being repeated as spoken replies.

This manual operation changes only language instructions and the existing language-detection builtin. It explicitly selects the caller's supported language before business tools, permits a clear later language request, and excludes proper names or background speech as reasons to switch. The default Portuguese greeting and configured voices/languages remain unchanged. A final reservation response in another language must translate the backend's facts faithfully; requested sending must never become promised delivery.

The patch sends prompt text and the complete existing `built_in_tools` map with only language detection's description/window changed. It never sends the expanded external `tools` list or rewrites webhook IDs, URLs, headers or authentication. Readback checks the builtin and its expanded representation, all other builtin definitions, ASR vocabulary, supported-language presets, phone assignments, workflow and platform settings.

Use only tested main after the related backend/UI release checks pass. The operation reuses the Seatable workspace, project, owned phone, serving main branch/version and zero published/draft-procedure checks from [the ASR operation](shared-voice-vocabulary.md). It pins `procedures: {}` explicitly, so unknown or draft-bearing procedure inventories abort before writing.

```sh
node scripts/repair-shared-voice-language.cjs \
  --project-ref ckforlwdhewexyqljsaf \
  --workspace-id 638a74e2dad648c4a0745edc358d7eae \
  --branch-id agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e
```

The default is read-only. Review the dry-run hashes/version, then add `--apply --expected-version FRESH_VERSION --manifest /private/secure-location/language-rollback.jsonl`. The exclusive 0600 journal records the previous prompt/builtin state before PATCH. No concurrent agent editors are allowed; the API has no conditional PATCH, so repeated guards and readback detect changes but cannot make publication atomic.

On an uncertain response, inspect the current published state and journal before retrying. Do not retry blindly or automatically roll back over later edits. A reviewed rollback restores only the recorded language prompt/builtin configuration on the same verified branch and checks all protected settings again.

Configuration readback is not telephone proof. Repeat real English and Spanish consultation calls and a Portuguese booking with notices disabled. Confirm the actual spoken language, canonical tenant, absence of unintended bookings/messages, honest WhatsApp wording and distinct in-progress versus ended call statistics. A simulated provider failure test does not prove real WhatsApp delivery.
