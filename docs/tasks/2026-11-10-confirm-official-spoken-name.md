# Recover an inserted spoken connector without a restaurant alias

- [x] Reproduce the remaining failure after canonical ASR vocabulary: the provider heard `Seatable e CI Sandbox`, and exact identification correctly refused it.
- [x] Return a nonbinding official-name suggestion only for one inserted connector between otherwise identical words in an exact city.
- [x] Require a separate spoken confirmation before the agent retries exact canonical identification. Keep this distinct from booking consent.
- [x] Test eligibility, ambiguity, collisions including opted-out restaurants, immutable binding and unbound operational-tool refusal.
- [x] Test a guarded prompt-only provider update that preserves ASR, tools, authentication, workflows, phone assignments and procedure drafts.
- [ ] Review and merge one bounded PR; wait for green main and verify the exact production deployment before applying the prompt.
- [ ] Run real positive and nonexistent-restaurant telephone cases; verify canonical tool parameters, correct tenant, one booking and actual WhatsApp delivery.
- [ ] Check real dashboard statuses, cancel tagged bookings, restore notices and remove temporary credentials.

The suggestion contains only the official name and city, never a restaurant ID. It creates no binding. The backend still accepts only an exact official/configured name through the existing guarded path. No alias is added, no caller-ID restaurant inference is introduced, and no endpoint authentication changes.

The API receives trusted call headers but not trusted user-turn evidence. Waiting for the next spoken confirmation is an agent conversation contract, not an independently verified backend assertion. Verify the actual transcript and tool ordering; a model-generated confirmation flag would not prove caller consent and is deliberately not added.

## Initial evidence

The failed baseline call used the official literal name and produced `Seatable & The Sandbox`. After the tested ASR update, the next call produced `Seatable e CI Sandbox` twice. Both failed safely without a tenant binding, reservation or WhatsApp send. Canonical vocabulary is retained, aliases remain unchanged, and sandbox notices were restored to disabled while the recovery fix is developed.

## Review before publication

Independent review found no blockers. All 194 focused tests across binding, webhook scope, ASR and prompt operations passed. The operator dry run matches the live published version and changes only the reviewed failure-recovery paragraph; it has not been applied. The source update adds no aliases, schemas, auth exceptions or phone routes. Full backend verification and release checks remain required before publication.
