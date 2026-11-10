# Tell guests what the booking confirmation actually proves

Base: origin/main 94be95aa. Scope: confirmation renderer, focused tests, and three locale files with two focused text entries per language; no backend or delivery tracking changes.

- [x] Inspect the portal reserve/lookup responses and notification conditions.
- [x] Prove the real renderer (real hooks, router, and translation bundles) handles no guest email and disabled WhatsApp in EN/PT-BR/ES, after booking and after reload.
- [x] Replace the unconditional delivery assertion with a recorded-reservation statement.
- [x] Add the missing localized save-confirmation instructions.
- [x] Run focused tests/checks, review, and commit. No deploy, merge, browser, or live writes.

API observation: notifications are conditional and awaited with a time ceiling. The successful reservation DTO does not report delivery receipts. A successful booking alone cannot prove email/phone delivery.

## Verification

Before implementation: all 6 renderer cases failed. After implementation: all 6 pass, plus 79 existing booking/onboarding palette checks (85 tests total). The tests use the real confirmation component, React Query hooks, router, and translation bundles, with only HTTP responses stubbed. Both router-state arrival and reservation reload are covered for EN/PT-BR/ES. The fixture has no guest email or delivery receipt and explicitly disables WhatsApp.

Focused ESLint, strict scoped TypeScript (application options, page/test plus imported dependencies), locale JSON parsing, and git diff --check pass. No full build, browser walk, provider operation, deploy, or merge was performed.

Implementation: rename the reservation delivery-claim key to reservationRecorded and add the missing saveConfirmation translation in all three locale files. The page no longer has an English default for that instruction. Existing icons, layouts, optional push/reminder behavior, API behavior, and delivery tracking are unchanged.
