# Make reservation receipts accurate and usable

Base: origin/main a5be8aed. Isolated worktree: restaurant-ai-mcp-receipt-copy.

- [x] Inspect the supplied production 320px screenshot and current confirmation renderer.
- [x] Reproduce the truncated-code renderer contract before production edits: six cases fail.
- [x] Extract a small ReceiptCode component with a full-width, selectable, wrapping opaque code.
- [x] Add a native 44px Copy code button with focus-visible styling and EN/PT/ES copy.
- [x] Show success only after clipboard resolution; use honest visible manual-copy fallback on denial or absence.
- [x] Cover exact case/symbol preservation, pending/success/failure, all three locales, and Enter/Space activation.
- [x] Verify useReservationById has only one consumer: BookingConfirmation.
- [x] Reproduce cached Confirmed after cancellation with a renderer regression before changing freshness/status logic.
- [x] Preserve fast fresh-create rendering; revalidate the public summary on later mounts/Back/reload without polling.
- [x] Render cancelled, completed, seated, no-show, pending, and unknown status without a confirmation claim.
- [x] Suppress reminders until verified confirmed; emit the iframe booking event once only for fresh confirmed creation.
- [x] Keep failed cached reads unverified with explicit retry, including a retryable first-load error.

Target: DESIGN.md Warm Glass and the supplied production receipt, with Refero's bundled craft focus guidance. The code uses warm neutral text, the action uses burgundy, and feedback uses semantic emerald/amber. The label/action row may wrap independently; the opaque code occupies its own full-width line with min-width zero, max-width 100%, whitespace-normal and break-all. No ellipsis, fixed maximum code width, clipped overflow, or additional decorative card.

The existing public GET is the only status source on return. Router/cache data can display receipt details while status is being checked, but cannot establish confirmation. The fresh-create exception uses the already consumed component-local handoff. Widget delivery keeps its existing target-origin restriction and adds fresh-confirmed/deduplication guards. Push subscription implementation remains user-triggered, with reminders available only for a verified confirmed reservation.

Verification: all 70 focused tests pass across ReceiptCode, BookingConfirmation, BookingManagementHandoff, and BookingReceiptTruth. The latter uses the actual portal renderer, explicit pair lookup and cancellation, followed by Back with a deferred status GET. It proves no stale confirmation during revalidation, a cancelled result afterward, and no duplicate widget event. Cancelled/pending/unknown copy is covered in EN/PT/ES, alongside completed/seated/no-show, GET failures, retry recovery, and fresh versus reloaded iframe events. TypeScript project checks (tsc -b), focused ESLint, locale JSON parsing, and git diff --check pass. CSS wrapping is verified as a DOM/class contract; no new live viewport measurement is claimed.

No backend, API contract, CustomerPortal mutation rules, receipt metadata shape, management handoff, or New reservation CTA changes. No live browser, provider, database, merge, or deployment operations. Parent owns live verification. The initial parallel copy/handoff run hit a one-second booking wait; its serial focused rerun passed.
