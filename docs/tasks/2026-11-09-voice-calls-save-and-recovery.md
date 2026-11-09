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

- [ ] Reproduce the remaining save, engine, persona and Calls cases with component tests and read-only browser checks.
- [ ] Fix confirmed defects and refine layout/copy using the locked references.
- [ ] Integrate isolated workers and independently review the final batch.
- [ ] Run complete verification before one batched push and PR.
- [ ] Verify the exact preview, merge, main checks, production SHA/alias and post-alias smoke.
- [ ] Test the published journeys; delete temporary auth files and document remaining limits.

Browser save-response fixtures must be labeled. They are not proof of provider writes. Existing call history, generated audio and a real telephone reservation are separate evidence.
