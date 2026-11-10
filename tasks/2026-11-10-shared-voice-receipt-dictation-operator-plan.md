# Plan: replace only the shared voice guest tools with dictation-capable tools

Status: plan only. Implementation and all provider operations are held until the backend contract and exact source snapshot are confirmed.
Base: origin/main 4b0067da4ad8dcaba8ef1bcdcca2cc90f6770587, in a new isolated worktree.

## Observed source and coordination

- Main's api/_lib/shared-voice-guest.js currently accepts only reservation_id. No reservation_code_spelling contract is present.
- The existing seven tools are identify_restaurant, get_current_datetime, check_availability, create_reservation, lookup_reservation, modify_reservation, cancel_reservation.
- Reuse inspect/parseArgs/project/workspace/owned-phone/zero-procedure guards from the existing shared-voice operators, plus assertCreatedTool and assertToolMirror from enable-shared-voice-guest-changes.cjs (#304 helpers). Do not edit their historical preimages.
- The prompt-only repair currently pins the earlier 720 source. It is not a valid source pin for this operation. The requested serving source is 920, with full prompt hash beginning c87717; a prefix is insufficient.
- The app's send_message_to_thread tool rejected a message to the native ancestor. No native collaboration messaging tool is exposed. Relay the prerequisites through the parent in this chat.

## Inputs required before implementation

1. Locke's stable commit and backend acceptance-test result, including the exact spelling grammar, handling of both/missing fields, error codes, and modify-field vocabulary/types.
2. The exact full serving version ID for 920 and a private verified snapshot path containing the full prompt, seven attached tool records, expanded mirror, original mocks, native headers/vault references, branch/phone state, and both zero-procedure inventories.
3. The full source prompt hash and its exact hashing convention. Derive the known old policy text from that snapshot and compare it with the current repair's REPAIRED_POLICY; do not assume equivalence.
4. Before any later apply: the exact tested/deployed main commit containing Locke's contract and its CI evidence. Creating tools is also a provider write and remains prohibited until publication is authorized.

## Backend and provider schema contract

- lookup_reservation and cancel_reservation expose exactly reservation_id and reservation_code_spelling, both string properties.
- modify_reservation exposes those same two properties plus exactly new_date (string), new_time (string), and new_party_size (number), subject to Locke's stable contract.
- Every provider request_body_schema has type=object and required=[]. Do not emit unsupported oneOf. The backend deterministically enforces exactly one proof field, rejects both/missing, and retains native ownership verification.
- A dictated proof is sent verbatim in reservation_code_spelling. The model must never decode, concatenate, case-fold, repair, shorten, or reconstruct it into reservation_id. Use reservation_id only when the complete exact receipt token itself is available.
- Retain full prefix, receipt-date provenance, all twelve suffix characters, 25-character decoded shape, explicit upper/lowercase NATO, digit zero through nine, hyphen and underscore requirements. No inference from booking/current date, name, phone, or caller ID.
- Preserve successful restaurant binding, verified lookup, readback and subsequent consent, modification/cancellation rules, deterministic-error handling, uncertain-result recovery, and no unsupported messaging claims. Only the specific reviewed guest-proof policy sentences may change.

## Planned implementation scope and execution

- New standalone script: scripts/enable-shared-voice-receipt-dictation.cjs.
- New focused acceptance tests: api/__tests__/shared-voice-receipt-dictation-operator.test.js. An operation leaf may document the reviewed command and release prerequisite. No backend, client, old tool, helper, or previous-operator edits.
- Default dry-run is read-only: inspect the exact project/workspace/agent/live main branch/owned phone/version/model and published plus draft-aware zero procedures; fetch all seven attached records and validate their one-to-one mirror.
- Fail closed for an unknown full prompt hash, unknown/duplicate policy preimage, wrong names/count, duplicate/missing IDs, altered endpoints/native identity headers/auth/vault references, or unexpected tool schemas.
- Preserve all four original references, configs, and mocks at their positions. Clone each existing guest tool with only its reviewed description/body-schema delta. Never modify or delete any of the seven existing workspace records.
- Create exactly three new tools, verify unique returned IDs and full schemas through assertCreatedTool, then replace only the three attached guest IDs. The final attached inventory remains seven distinct names, not ten.
- Recheck full source state and every existing record before any write. Open an exclusive mode-600 fsynced journal in a private directory; write the before snapshot, complete old IDs/records, intended prompt/tool delta, and protected hashes before creation. Journal each returned created ID before its verification GET and journal the final PATCH preimage before PATCH.
- After tool creation, recheck agent/branch/phones/procedures and all original records again. PATCH only prompt.prompt and prompt.tool_ids with explicit procedures={}; never send the expanded tools array or alter builtin tools.
- Verify the final full prompt, ordered seven IDs, exact tool names, newly created full records/mirror, all seven old records/mocks, four retained attached tools, system/builtin mirrors, model/voice/language/ASR/auth/workflow/backup config/phone/procedures, and normalized branch state.
- Protect the complete relevant snapshot, allowing only the exact reviewed prompt/ID/custom-mirror delta and provider version bookkeeping. Restore ASR keywords to the protected comparison because the shared fingerprint excludes them by default.
- Stop on any create/PATCH/verification error, record uncertainty, and retain every known created ID and preimage. No automatic retry, rollback, cleanup, or deletion. Existing tools may be referenced elsewhere.

## Planned acceptance matrix (all APIs mocked; zero live operations)

- Full expected schema for each of the three tools: exact keys/types, required=[], absent oneOf, proof descriptions, no model-supplied identity/authority fields, native headers and vault reference unchanged.
- Reject wrong workspace/project/agent/main branch/owned phone/source version/full hash/model, duplicate or modified preimages, nonempty or unknown published/draft procedures.
- Reject seven-tool inventory drift, duplicate IDs/names, crossed identities, original record/mocks drift, custom-mirror mismatch, missing or mutated builtin tools.
- Reject created-tool schema normalization that changes types, assignments, query schemas, headers, identity sources, constants, omissions, enum constraints, redirect policy, or mock data. Accept only the helper's known empty provider defaults.
- Prove read-only dry-run makes no create/PATCH/journal calls. Prove unauthorized apply or missing deployment evidence fails before any write. Test exclusive/fsynced journal ordering and created-ID recording before readback.
- Prove successful apply creates exactly three and performs exactly one narrow agent PATCH. Verify the original four positions/mocks, all seven old records, seven final names, full protected state, and every new record after publication.
- Inject create failure, missing/duplicate created ID, partial creation, midflight source/record drift, PATCH timeout, and readback drift. Assert no retry or existing-record mutation/deletion and a retained failed journal entry.
- Once implemented, report actual new-operator test count, existing related operator-suite count, syntax results, and the source/deployment evidence separately. No test pass or backend release is claimed by this plan.

No provider/API calls, database writes, telephone calls, push, deployment, or publication were performed for this plan.
