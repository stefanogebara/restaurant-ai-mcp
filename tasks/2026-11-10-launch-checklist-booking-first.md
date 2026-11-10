# Make the first launch task available to every owner

Base: fc3125fa. Scope: LaunchChecklistModal, focused tests, and this plan leaf.
Reference: the owner's real Free-plan walk reached unavailable voice from the first task. Apply the reviewed Fo task/result pattern within Seatable's existing warm identity.

- [x] Read the component, caller, translations, and design checklist.
- [x] Prove the first task opens the actual booking URL in EN/PT/ES; no voice promise or broken missing-slug action.
- [x] Replace only the first task with typed local trilingual booking copy and a booking-page link.
- [x] Preserve copy-link/manual-booking guidance and explicit dismissal.
- [x] Run focused tests, strict scoped TypeScript and lint checks; record full-build limits, review, and commit.

No onboarding sheet, backend, billing, shared locale JSON, browser, or live writes.

## Verification

Before implementation: 5 failing and 2 passing regression tests exposed the voice-only action and the missing-slug dead action.
After implementation: 7 component tests pass with the real EN/PT-BR/ES translations. The component plus BookingChannelsPanel and DashboardReservationDays suites pass: 14 tests in 3 files.
Focused ESLint passes. Strict TypeScript checking of both changed files and their imported dependencies passes, using the application compiler options plus the test matcher declarations. git diff --check passes.

The full application TypeScript build did not finish within five minutes. The Vite production build also remained in transformation after roughly four minutes. Only this task's exact processes were stopped. Full-project build is therefore unverified and belongs to the parent's integration checks; no compiler/bundler error was reported before stopping. No browser walkthrough was attempted.

The first action uses the same restaurant-specific production booking URL as the retained share action, opens a new tab, and never marks a reservation complete automatically. Missing/blank slugs offer a loading message until the real URL is available. Existing manual-booking guidance and explicit dismissal remain unchanged.
