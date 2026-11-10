# Shared voice receipt dictation: guarded tool replacement

Status: implemented locally; publication is held. Current production does not accept the new dictation field. No provider operation is authorized by this document.

## Exact reviewed source

- Agent: Seatable Orchestrator v2, `agent_1101km6f8n10ehhv062j9xfep9y8`, workspace `638a74e2dad648c4a0745edc358d7eae`.
- Main branch: `agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e`.
- Version: `agtvrsn_9201m73fm1c9e36ba4g7baq4pf65`.
- Full prompt digest: `c87717a656b9cd420542420302e05014d3ac302588fd817eb5867a8bf818ba69`.
- Digest convention: SHA-256 of JSON.stringify of the stable value, using the existing `digest` helper; this is not the SHA-256 of unquoted prompt bytes.
- The script pins all seven source IDs and record hashes, plus the complete protected agent/owned-phone state and normalized branch state. A different version, hash, inventory, native identity header, authorization, record, mock, or protected configuration fails closed.

## Backend prerequisite and representation

Locke's PR #310 initially implements the contract in `da46ddef3f75ca3bacb336bde6aeff2d8619ee34`. That commit is not a production-release assertion. The final tested revision must also include the requested sentence-period delimiter support, then pass CI and be verified at the production deployment before publication is considered.

The guest tool body exposes `reservation_id` and `reservation_code_spelling` as optional strings. Modify additionally retains only `new_date`, `new_time`, and `new_party_size`. `required=[]`; unsupported provider `oneOf` is not emitted. The existing literal property and all modification properties remain unchanged. The spelling field description states the 1500-character bound; the backend enforces that bound, grammar and full code shape. Provider support for `maxLength` is not assumed.

Send spelling only in the POST body and OMIT `reservation_id` entirely. Both properties present, even when one is null/empty, are a proof conflict (403). Invalid/missing proof is a business refusal (200/success=false), not an outage. Missing restaurant binding is 200/success=false with `requires_restaurant_identification`; invalid native authentication/context remains 403.

Spelling uses an explicit uppercase/lowercase directive for EVERY letter (including RES), followed by a NATO word or single ASCII letter; digits may use zero-nine/0-9 with an optional digit label. Symbols are the words hyphen/underscore. Preserve the complete caller spelling in order; never manually decode, case-fold or repair it. The server requires exactly `RES-` + eight receipt-date digits + `-` + all twelve suffix characters (25 decoded characters). A successful lookup's exact proof representation/value must be reused for mutation; corrections require fresh verification. Binding, canonical confirmation, consent, clock and uncertain-result rules remain.

## Read-only review

`scripts/enable-shared-voice-receipt-dictation.cjs` defaults to read-only inspection. The reviewed source arguments are mandatory, including the full version even for dry-run:

```sh
node scripts/enable-shared-voice-receipt-dictation.cjs \
  --project-ref ckforlwdhewexyqljsaf \
  --workspace-id 638a74e2dad648c4a0745edc358d7eae \
  --branch-id agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e \
  --expected-version agtvrsn_9201m73fm1c9e36ba4g7baq4pf65
```

Credentials must already be supplied privately in the process environment. Do not print headers/full configurations. Live read-only inspection also checks the project URL, workspace, owned native phone, live main branch and both published/draft-aware zero-procedure inventories.

The initial validation used the parent-provided private snapshot, not a live API call. Private evidence lives under `/tmp/seatable-reschedule-onboarding-20261110/dictation-operator/`: `snapshot-dry-run.json` and exact policy `policy.json`, mode 0600 in a mode-0700 directory. This proves that the real source preimages match; it is not fresh provider/deployment/telephone evidence.

## Publication hold and transaction

`BACKEND_RELEASE` is immutable source data with no command-line/environment override. It is deliberately unset. The CLI rejects `--apply` before creating clients or making requests. A reviewed follow-up must pin the exact backend commit, passing CI evidence and production verification after the final grammar fix. Do not bypass the CLI through the exported low-level transaction; that export exists for mocked acceptance testing. No apply command is supplied while held.

When eventually released, the transaction creates exactly three new guest tool records and replaces only the three attached guest IDs. It keeps seven attached names, retains the original four IDs in place, and never updates/deletes any existing record. Headers, vault references, original mocks, language/system tools, model/backup configuration, ASR, voices, phone assignments, auth, workflow, procedures and other protected fields are unchanged.

The exclusive private journal is fsynced before creation, after every returned ID (before verification GET), and before the one narrow agent PATCH. PATCH includes only the reviewed prompt text, seven exact tool IDs, and explicit `procedures={}`. No expanded tools array is sent. The final readback rechecks all seven old records, the three new records, their one-to-one mirror and the complete protected state. Only provider version/update timestamps and observational tool usage statistics are excluded; all remaining record fields/config/mocks are compared.

Any partial creation, source drift, request failure or readback mismatch stops and records every known returned ID. A timeout can follow a committed write. There is no automatic retry, rollback, cleanup or old-record deletion. Retain the journal and inspect the actual state manually before any further operation.

## Validation

- 92 new mocked operator tests, including exact schema checks for all three guest tools, native authority/source pins, preserved records/mocks, private journal ordering, concurrent drift, created-tool normalization, wire payload, ambiguous failures, no retry/delete and CLI publication hold.
- 213 tests pass across five related operator/guest suites.
- Script/test syntax and whitespace checks pass.
- Real private version-920 offline snapshot dry-run passes without external reads/writes. No provider changes, backend deployment, phone calls or push were performed.
