# Expand sandbox call coverage and refine Voice / Calls

- [x] Verify live production SHA, sandbox identity and unchanged shared routing/aliases.
- [x] Run baseline real calls for consultation-only and rejection of a suggested restaurant; confirm no bookings or messages. Language retests remain after the provider repair.
- [ ] Run a real booking with notices disabled; confirm one booking, no WhatsApp request and truthful spoken status.
- [x] Exercise rejected / ambiguous WhatsApp delivery through controlled backend regression tests, without disrupting the live provider.
- [ ] Audit authenticated Voice and Calls at desktop, 390 and 320 pixels; lock a bounded design correction from actual evidence.
- [ ] Implement meaningful fixes with regression coverage, independent review and complete relevant checks.
- [ ] Merge passing PR, test main, promote only its existing READY build, verify the production alias and actual UI.
- [ ] Cancel tagged test bookings, restore sandbox preferences, remove temporary credentials and preserve real call evidence.

Use only the dedicated Seatable CI sandbox. Never select Inner. No temporary restaurant aliases, provider routes, unverified caller IDs, live customer records, intentional production outages or fake delivery receipts. Separate actual telephone / Meta receipt evidence from unit tests and screen verification.

## Design reference lock

Primary target: existing Seatable Liquid Glass v2 (`DESIGN.md`) and the Manager AI page. Preserve warm canvas, Instrument Serif headings, DM Sans body, action-only burgundy, semantic status colors, hairlines and content directly on canvas. Refero tools are unavailable; use its bundled craft-details and copywriting references for visible keyboard focus, clear control labels, honest loading/error states and concise next actions. Existing Voice/Calls captures provide screen and journey references. No generated bitmap assets are needed for these functional screens.

Design decisions will be selected after viewing actual authenticated states. Improve concrete task completion and mobile use; do not add decorative cards or invented success states.

## Evidence and decisions

| Decision | Source | Reason |
| --- | --- | --- |
| Keep phone overview/history readable without paid voice controls | Actual Free sandbox follows Calls to a full-page upgrade block; existing no-agent overview | Preserve task context and read-only status; paid voice queries/controls remain gated |
| Retry failed phone-status reads locally | PhoneIntegrationPanel currently offers only email support; bundled craft/copy references | A temporary read failure needs an immediate safe recovery action, distinct from setup failure |
| Count a call as ended only with a valid end timestamp | Live booking is persisted before hangup; existing pending detail state | Completion statistics must agree with the call's final metadata; booking conversion remains independent |
| Switch actual conversation output language before business tools | Real English consultation returned Portuguese speech despite English input and successful availability | Language policy must change the provider's conversation state, not merely understand the utterance |

Baseline real calls: English consultation `conv_3201m72sheb2ej1t2csh775863vb` checked three people for 2026-11-11 at 20:00, made no reservation/message, but failed spoken-language matching. Rejection `conv_7201m72sw8amfs5rd5xma56zqtsx` received a canonical suggestion then a clear refusal; it stayed unbound, with no reservation/message. The language operation remains dry-run only until reviewed main passes.

Backend boundary tests additionally reproduced fractional/junk guest counts and an impossible calendar date reaching mocked persistence. These must be rejected before any booking or notification effect. Provider rejection/deadline simulations retain the booking, make no second send attempt and never claim delivery.

Local verification: 4,980 backend tests passed (6 existing skips); 1,393 frontend tests passed. Backend party-size/calendar guards, call completion metadata and restricted/read-error UI were independently reviewed. Full production build and final authenticated visual checks remain before release acceptance.
