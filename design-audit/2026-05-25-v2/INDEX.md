# Seatable Design Audit (v2)

Generated 2026-05-25T22:38:21.680Z against https://seatable.one.
Demo token: `bf0ff637-aeb4-400c-a9a3-8ca6f4fdb64e`

## Legend
- **status** = the prod-side HTTP response.
- **landed → /login** means the page is auth-gated; without a Google
  OAuth session the prod screenshot is just the login screen.
- **orphan_mockup** means no shipped page (or the page needs
  a context we cannot construct without auth, e.g. a real reservation).

| Mockup | Route | Status | Auth? | Pair | Note |
|---|---|---|:---:|---|---|
| `analytics` | `/analytics` | http_200 → `/login` | 🔒 | [mockup](analytics-mockup.png) · [prod](analytics-prod.png) |  |
| `booking` | _(orphan)_ | orphan_mockup |  | [mockup](booking-mockup.png) · _no prod_ | no public demo slug — needs an owned restaurant slug |
| `booking-confirmation` | _(orphan)_ | orphan_mockup |  | [mockup](booking-confirmation-mockup.png) · _no prod_ | flow needs a real reservation |
| `call-tracking` | `/host-dashboard/calls` | http_200 → `/login` | 🔒 | [mockup](call-tracking-mockup.png) · [prod](call-tracking-prod.png) |  |
| `customer-portal` | `/customer` | http_200 |  | [mockup](customer-portal-mockup.png) · [prod](customer-portal-prod.png) |  |
| `dashboard` | `/demo/bf0ff637-aeb4-400c-a9a3-8ca6f4fdb64e` | http_200 |  | [mockup](dashboard-mockup.png) · [prod](dashboard-prod.png) | comparing against DemoDashboard (same design system, public route) |
| `landing` | `/` | http_200 |  | [mockup](landing-mockup.png) · [prod](landing-prod.png) |  |
| `live-demo` | `/live-demo` | http_200 |  | [mockup](live-demo-mockup.png) · [prod](live-demo-prod.png) |  |
| `login` | `/login` | http_200 |  | [mockup](login-mockup.png) · [prod](login-prod.png) |  |
| `not-found` | `/this-route-does-not-exist-on-purpose` | http_200 |  | [mockup](not-found-mockup.png) · [prod](not-found-prod.png) |  |
| `onboarding` | `/onboarding` | http_200 → `/login` | 🔒 | [mockup](onboarding-mockup.png) · [prod](onboarding-prod.png) |  |
| `reports` | `/host-dashboard/reports` | http_200 → `/login` | 🔒 | [mockup](reports-mockup.png) · [prod](reports-prod.png) |  |
| `subscription` | `/subscription/manage` | http_200 → `/login` | 🔒 | [mockup](subscription-mockup.png) · [prod](subscription-prod.png) |  |
| `table-config` | `/host-dashboard/tables` | http_200 → `/login` | 🔒 | [mockup](table-config-mockup.png) · [prod](table-config-prod.png) |  |
| `voice-settings` | `/host-dashboard/voice-settings` | http_200 → `/login` | 🔒 | [mockup](voice-settings-mockup.png) · [prod](voice-settings-prod.png) |  |
