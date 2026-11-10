# Single-sheet onboarding recovery

Target: fc3125fa. Preserve DESIGN.md warm canvas, serif 400, hairlines and semantic status. Adapt Fo's public task-to-result proof pattern; do not infer its authenticated onboarding.

- [x] Add regression coverage for real submitted hours, explicit country/code and optional type, accepted seating, success/partial readiness and retry.
- [x] Add a compact hours editor and explicit seating acceptance without introducing a wizard or chat.
- [x] Replace universal Google provenance with manual/demo/Google evidence and require manual location confirmation and optional type.
- [x] Render saved completion inline with booking link and dashboard action; prevent repeated creation.
- [x] Run focused frontend tests and TypeScript; review scoped diff and commit without pushing.
- [ ] Parent runs the integrated frontend/build batch and live fresh-owner walkthrough.

No backend, provider, browser or database changes. Parent owns live fresh-restaurant verification.

## Review

- Red first: five sheet submission regressions failed before implementation.
- Final focused Vitest run: 53 tests passed across five related files.
- TypeScript build check passed. The local Vite bundle build was stopped before completion because the parent requested the commit promptly and owns the integrated build.
- Regression coverage includes Brazil/BR submission, optional restaurant type, manual provenance, edited/closed days, invalid-hour blocking, explicit estimated/default seating acceptance, exact submitted areas, partial/unknown readiness, HTTP failure and HTTP-200 failure, plus reload without another creation request.
- Successful creation is recorded separately from live phone/WhatsApp verification. No provider, browser or DB actions were executed.
