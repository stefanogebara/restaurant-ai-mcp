# Reservation changes and owner onboarding

## Scope

- [ ] Reproduce reschedule/cancel paths separately for native phone, WhatsApp engine, and live Meta transport.
- [x] Require tenant binding and independent guest proof before shared-phone reservation details or changes.
- [x] Validate hours, capacity, terminal status and retries atomically; preserve the original booking on failure.
- [x] Walk the current single-sheet onboarding with a separate fictional new restaurant.
- [ ] Repair missing hours editing, accepted seating persistence and visible completion/readiness.
- [ ] Verify focused tests, full suites, browser rendering, production SHA/alias and sandbox cleanup.

## Design lock

Keep Seatable's DESIGN.md palette, typography and Liquid Glass object/content roles. Preserve the user's single-sheet choice. Adapt Fo's official task/result evidence placement from https://wajo.ai/help and https://wajo.ai/join-wajo/dinner-reservation; its authenticated onboarding has not been observed. Show actual work states and returned readiness, never simulated progress or invented discovery sources.

## Evidence boundaries

WhatsApp Web is not connected and the user cannot connect now. Handler/engine replay is not live Meta inbound. Existing authorized sandbox calls may use the verified QA caller; never claim a real call from text simulation. Keep provider routes unchanged until the authenticated mutation contract and regressions pass. Do not use Inner or the original dirty checkout.

## Review

The original fresh-owner production walk created a fictional São Paulo restaurant with country US, New York timezone, English and four fallback tables. The sheet stayed on its editable launch page after a successful response and attributed manual defaults to Google. That disposable restaurant and its provider agent/knowledge document were removed.

A candidate browser walk against the production completion API explicitly selected Brazil, accepted four four-seat tables, edited Monday to 18:00–22:00 and closed Sunday. Database readback confirmed BR, America/Sao_Paulo, Portuguese, those hours and the accepted table configuration. Invalid hours blocked launch at 320px. Completion survived reload and led to the dashboard launch checklist. This is candidate UI evidence, not published UI evidence. That checklist still offered an unavailable phone test to a Free owner; a separate onboarding patch addresses its first action.

Fifty actual PostgreSQL integration cases passed in a fresh disposable local cluster, including both concurrent orderings and assigned-table retention. Eight actual Supabase sandbox RPC scenarios passed against the applied functions: wrong owner, exact code case, closed slot preservation, reschedule identity/table retention, reschedule retry, cancellation/table release, cancellation retry, and terminal-state refusal. Cleanup confirmed zero active sandbox reservations. This is database evidence, not a native call or Meta inbound exchange.

Full local backend verification passed 5,235 tests with six existing skips. The initial full frontend run passed 1,439 tests and failed one existing asynchronous TeamPage assertion under load; the entire six-test TeamPage file passed on isolated rerun. CI must still run the complete integrated suite. Node 26 TypeScript compilation was stopped after making no diagnostic progress for over 20 minutes. The complete TypeScript/Vite/landing-output build passed with the CI-matching Node 22 runtime. Follow-up WhatsApp response/retry and provider-operator regressions passed 58 focused tests.

The provider operator completed a read-only dry run against the unchanged live shared agent. It preserves existing tool records, simulation mocks, provider-vault authorization references and native identity headers, and prepares three separately scoped guest tools. These tools must not be enabled before the exact production backend and public-lookup fix are confirmed. Native serving tools and their live phone tests remain pending publication.
