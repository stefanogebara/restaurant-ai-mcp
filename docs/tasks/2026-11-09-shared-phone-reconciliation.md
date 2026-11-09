# Shared Seatable line reconciliation

Current evidence: Twilio number +551150289356, label Seatable BR Sao Paulo, verified platform account, native ElevenLabs inbound/status URLs. In verified My Workspace, two imports point at Pizzeria Webhook Test and Seatable Orchestrator v2. Only the sandbox is explicitly opted into authenticated shared routing. Two legacy restaurant configs still mark this platform line active.

- [x] Inspect Twilio account, exact number, provider assignments and DB claims.
- [x] Protect dedicated routing and legacy phone lookup even after claims are retired.
- [ ] Verify tests, build, review, CI, deployment and exact domain alias.
- [ ] Preserve and mark the two legacy claims needs_review using conditional updates.
- [ ] Align both exact shared-line imports to the existing Orchestrator; label platform/shared and preserve their IDs.
- [ ] Verify Twilio configuration unchanged and repeat a synthetic inbound test.

No restaurant is selected by display name, newest row or query order. No phone import is deleted. Never use Inner. Human speech and delivery to the owner's handset remain separate checks.

## Local review

Eight new regression cases failed before their fixes and pass afterward. Five cover formatted shared-line hints at the authenticated legacy webhook boundary, preventing explicit tenant/agent fallback. Full backend: 4,718 passed, 6 existing skipped. Full frontend: 1,191 passed. Build, API syntax and static audits passed. Independent review found no remaining blockers in the scoped boundary change; 110 relevant tests passed independently. Provider records remain unchanged pending release of the fallback guard.
