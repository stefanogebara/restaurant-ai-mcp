# Voice and Calls: save, recovery and interaction polish

Continue from production 949d114d without requiring an owner handset call. Preserve the dirty original checkout and use isolated worktrees. No phone routing, caller identity, subscription or guest-message changes are part of this batch.

## Reference lock

Design for restaurant hosts using DESIGN.md Liquid Glass v2: warm canvas, restrained serif hierarchy, hairline sections, glass for controls and forms, action burgundy and semantic status colors. Use Refero's bundled craft-details.md for keyboard/focus/form feedback, and copywriting.md for explicit action scope and recovery. Live Refero tools are unavailable. Refine the existing design; do not introduce a new theme.

| Decision | Evidence | Intent |
| --- | --- | --- |
| Name each save action by its scope | Separate voice and presentation endpoints | Prevent users expecting one save to persist unrelated fields. |
| Retain newer edits when an earlier save finishes | Current callbacks clear pending state unconditionally | Avoid losing work while the network is slow. |
| Show load/sync failures beside the affected form | Persona errors currently fall through to empty fields/toasts | Make retry and remaining work clear. |
| Preserve focus while call details refresh | Call modal lifecycle depends on a recreated callback | Avoid interrupting keyboard use during polling. |
| Keep engine changes explicitly staged | No phone route should change while browsing options | Make cancel/save behavior clear and remove unsupported preview promises. |

## Plan

- [x] Reproduce the remaining save, engine, persona and Calls cases with component tests and read-only browser checks.
- [x] Fix confirmed defects and refine layout/copy using the locked references.
- [x] Integrate isolated workers and independently review the final batch.
- [x] Run complete verification before one batched push and PR.
- [ ] Verify the exact preview, merge, main checks, production SHA/alias and post-alias smoke.
- [ ] Test the published journeys; delete temporary auth files and document remaining limits.

Browser save-response fixtures must be labeled. They are not proof of provider writes. Existing call history, generated audio and a real telephone reservation are separate evidence.

## Local review evidence

- Full backend: 4,756 passed, six existing skips. Added a red-before list-projection regression for `ended_at`.
- Full frontend: 1,313 passed across 151 suites, including the final focus-removal regression.
- Independent cross-review approved save-state isolation, presentation draft persistence, call details, filter reset, pagination and modal lifecycle. The stale Spanish-copy assertion was corrected before the passing full run.
- Browser reads used the signed-in owner for Voice and the dedicated CI restaurant for Calls. No new calls, messages, reservations, routing or owner-setting changes were made during local review.
- Explicit response fixtures verified slow-save edit preservation, partial-save retry, engine lookup recovery, persona load failure and agent/knowledge-base partial-sync recovery. These do not prove provider writes.
- Actual Calls GETs verified history, transcript, loading-to-error-to-retry recovery, filter reset, CSV download, guest drawer, Escape and focus restoration. Browser testing found focus loss when a retry button unmounted; a red-before regression and shared lifecycle fix now pass.
- Screenshots at 320, 390 and 1200 px show no horizontal document overflow on Voice or Calls. Voice draft actions remain above the mobile navigation. Direct-voice choices and staging are localized and do not promise unavailable audio previews.

## Release verification

768 API JavaScript files passed syntax checks. Changed-file ESLint, fire-and-forget and phantom-column audits passed. Frontend production build passed, with the existing large-chunk and browser-dataset warnings.

Preview, main CI, exact production SHA/alias and post-alias journeys remain pending. A real telephone reservation and its WhatsApp confirmation remain a separate unverified journey; they are not required for this batch.
