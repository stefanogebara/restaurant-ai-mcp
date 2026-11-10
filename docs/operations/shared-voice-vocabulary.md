# Shared voice ASR vocabulary

This manual operation adds official restaurant names to Seatable Orchestrator v2's
Scribe Realtime recognition keywords. It does not change identification, aliases,
phone routing, prompts, tools, security settings, or client override permissions.
It does not create calls. There is no cron or runtime synchronization hook.

Run after an official name or shared-phone opt-in changes, and before publishing
shared-agent configuration. Apply only from tested main, without concurrent agent
editors. The API does not provide a conditional version PATCH: preflight version
checks and post-write fingerprints detect changes, but cannot make it atomic.

Export SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ELEVENLABS_API_KEY using the
approved local secret workflow. The script does not load environment files. Never
commit keys, manifests, or command output containing private directory names.

1. Inspect the dry run (the default; reads only):

```sh
node scripts/sync-shared-voice-vocabulary.cjs \
  --project-ref ckforlwdhewexyqljsaf \
  --workspace-id 638a74e2dad648c4a0745edc358d7eae \
  --branch-id agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e
```

2. Confirm the returned branch/version and proposed keywords. Existing custom
keywords keep their spelling/order. Only active, onboarding-completed, non-demo
restaurants with a literal boolean shared-routing opt-in contribute official
names and their word tokens. Aliases, city, contact and guest data are not read.
A full phrase over 20 characters or merged total over 50 fails; nothing truncates.
Removed restaurants' previous keywords are retained as existing custom terms;
this command adds vocabulary only and does not claim to reconcile deletions.

3. Apply explicitly with the exact version from that fresh dry run:

```sh
node scripts/sync-shared-voice-vocabulary.cjs \
  --project-ref ckforlwdhewexyqljsaf \
  --workspace-id 638a74e2dad648c4a0745edc358d7eae \
  --branch-id agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e \
  --expected-version REPLACE_WITH_FRESH_VERSION \
  --apply --manifest /private/secure-location/shared-asr-rollback.jsonl
```

The existing file must not exist. Its new mode is 0600. The fsynced `before` record
contains previous and proposed keywords and protected-setting fingerprints before
PATCH. Only `conversation_config.asr.keywords` is sent, with explicit branch_id.
Readback verifies keywords, main branch, prompts/tools/workflow/security and owned
phone assignment. A no-op does not PATCH or create a manifest.

If apply or readback fails, retain the private journal. A timeout can follow a
successful provider write. Do not blindly retry or automatically roll back.
Inspect the current branch/version and protected settings first. For a reviewed
rollback, use the journal's exact `before` keywords in a keywords-only PATCH on the
same verified branch, then verify readback. This script intentionally provides no
unguarded restore switch. Keep the applied vocabulary after successful testing;
it is the fix, not a temporary test alias.

This verifies configuration only. A real telephone test using the official name
is still required to evaluate speech recognition.

References: [agent update](https://elevenlabs.io/docs/api-reference/agents/update),
[realtime keyterm limits](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/batch/keyterm-prompting).
