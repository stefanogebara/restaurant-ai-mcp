# WhatsApp settings: keep reservation notices separate from inbound routing

## Plan

- [x] Confirm what `whatsapp_enabled` actually gates and reproduce the misleading control.
- [x] Stop the notices toggle from mutating the central restaurant registry.
- [x] Name the control and its effects honestly in EN, PT and ES.
- [x] Add backend and UI regression tests; run focused and full verification.
- [ ] Review the diff, publish one scoped PR, verify main and production by SHA.

## Design reference lock

The existing WhatsApp settings page and `DESIGN.md` are the visual source of truth:
warm canvas, hairline-separated settings, burgundy only for actions, semantic status.
The copywriting craft reference requires operational settings to state status and effect,
not promise. This is a direct-build correction of labels; no new visual language or
decorative component is needed. The control must say that it affects reservation
notices, while the dedicated restaurant number remains a separate inbound connection.

## Review

`whatsapp_enabled` gates reservation notices in the portal and reservation
paths; it is not the inbound tenant-routing flag. Previously, a notices toggle
could set `restaurant_registry.is_active=false`, or upsert with English and a
null dedicated receiver because the config SELECT omitted those fields. The
registry mutation is removed. Focused tests passed (34 backend, 12 UI); full
verification passed (4,450 backend, 1,103 UI, client build, API syntax).

Read-only production census on Seatable EU: 19 non-demo restaurants have notices
off while the registry remains active; one has notices on and registry inactive;
one has both off; one has both on. The two inactive rows have no provisioning
state or dedicated receiver. Do not auto-reactivate them without provenance.
The one dedicated receiver has no provisioning state, which is a separate
read-model issue for the WhatsApp connection page.
