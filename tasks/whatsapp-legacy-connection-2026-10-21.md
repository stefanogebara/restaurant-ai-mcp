# Show an existing dedicated WhatsApp connection honestly

## Plan

- [x] Read an existing, active dedicated receiver when no provisioning journey was stored.
- [x] Confirm its display number from Seatable's Meta WABA before offering `wa.me`.
- [x] Show a distinct, non-shareable state when routing exists but the number cannot be verified.
- [x] Test tenant isolation, Meta failure, UI states, and full suites.
- [ ] Release only after PR checks and exact preview; verify main and production SHA.

## Evidence and design lock

Read-only Seatable EU census: among non-demo restaurants, one active Meta
restaurant has a dedicated receiver in `restaurant_registry` but no
`whatsapp_provisioning` state. The current page therefore says to connect a
number even though routing exists. No DB write is needed.

Use the existing WhatsApp settings layout and `DESIGN.md`: warm canvas,
hairline sections, burgundy actions, amber uncertainty, emerald only for a
confirmed state. Refero's product-copy guidance says operational copy must
show status and next action rather than a promise. A registry pointer alone
cannot prove the display number, so never construct `wa.me` without a
verified E.164 result from the matching WABA phone-number ID.

## Review

Backend tests cover exact WABA receiver matching, wrong receiver, Meta failure,
inactive registry and cross-tenant collision. UI tests cover linked and unknown
states without a false `wa.me` link. Focused tests: 21 backend and 14 UI passed.
Full verification: 306 backend suites / 4,453 tests passed, 6 skipped;
138 frontend files / 1,105 tests passed; client build and API syntax passed.
No production messages were sent and no DB rows were changed.
