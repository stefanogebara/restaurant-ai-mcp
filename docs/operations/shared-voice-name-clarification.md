# Shared phone name clarification

An inserted connector in telephone transcription can prevent exact identification even with canonical ASR vocabulary. The backend may return a nonbinding suggestion when the exact city and all canonical words match after removing exactly one inserted interior `e`, `and` or `y`. It does not rank approximate names, use aliases for suggestions, fall back to the only restaurant, or bind a candidate automatically.

The agent must say the suggested official name and city, wait for a separate caller response, and only after explicit identity confirmation retry the existing exact identification path. Identity confirmation is separate from consent to book. An unknown, rejected, unclear or ambiguous name leaves restaurant operations unavailable. Existing exact-match collision and immutable call-binding checks remain authoritative.

The backend has trusted call identity, not independently authenticated user-turn evidence. This confirmation is an agent contract. A real telephone transcript must prove the caller answered before canonical identification; tests or a model-authored boolean are not that proof.

## Apply the reviewed prompt paragraph

Run only after the backend is deployed and tested main passes. Use the same Seatable project, workspace and live branch checks described in [the ASR operation](shared-voice-vocabulary.md). The script uses those guards, including both empty published/draft procedure inventories, and sends an explicit `procedures: {}` pin. It changes one exact reviewed paragraph; unknown or repeated preimages abort.

```sh
node scripts/clarify-shared-voice-name.cjs \
  --project-ref ckforlwdhewexyqljsaf \
  --workspace-id 638a74e2dad648c4a0745edc358d7eae \
  --branch-id agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e
```

The default is read-only. Apply with `--apply --expected-version FRESH_VERSION --manifest /private/secure-location/name-prompt.jsonl` after reviewing that dry run. The exclusive 0600 journal records the previous prompt before PATCH. Do not run concurrent agent editors. The provider has no conditional PATCH; repeat preflight checks and readback detect changes but cannot make the operation atomic.

Readback protects ASR keywords, tool definitions/IDs, workflow, platform security, phone assignments and all other prompt configuration. Reapplying the same paragraph is a no-op. On an uncertain result, inspect the live version and private journal before retrying. Do not blindly retry or roll back over later edits. A reviewed rollback restores the journal's exact previous prompt on the same verified branch and verifies every protected setting again.

Do not claim a passing telephone flow until the official canonical name reaches identification, a real reservation appears once, Meta provides an actual delivery receipt, and the dashboard shows matching records. Keep the existing aliases unchanged throughout the test.
