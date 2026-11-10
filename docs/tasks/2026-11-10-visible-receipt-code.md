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

## CI palette guard correction

[The failed PR check](https://github.com/stefanogebara/restaurant-ai-mcp/actions/runs/42896711904/job/130111615643) passed backend tests and failed exactly one frontend assertion: warmPalette.test.ts:89 expected emerald but received an empty source slice. Its search for the old inline t('reservations.confirmed') call returned -1 after the badge moved into ReceiptStatus. This is deterministic test drift, not a flake. The guard now renders the extracted component and requires both emerald background and text, rejects rose/burgundy status colors, and covers eight non-confirmed/unverified cases. An intentional temporary burgundy badge mutation failed the new guard; the production component was restored exactly. No guard was skipped or weakened, and no production code or workflow configuration changed in this correction.

All 165 focused tests pass across the five palette/receipt/handoff files, with zero skips. Focused ESLint and git diff --check also pass.

## Fresh creation versus a retained query cache

React Query initialData does not replace an existing query's data or error state. The receipt now snapshots whether that ID already had query state on entry. Only an uncached matching creation response takes the fast path; any reused query revalidates the public GET before its status is treated as current. The page reports an error only from a read completed during this visit, so an older cached error cannot override a pending or successful new read. A new failed read remains unverified even when creation and cached data say confirmed.

Six new regressions failed before the fix and pass afterward. They retain same-ID cached Confirmed against fresh pending/cancelled/unknown, cached Cancelled against fresh confirmed, an old cached error during a deferred successful read, and a current failed read despite cached/fresh confirmation. No cache is cleared to make those cases pass, and no API or DTO changes are introduced.

All 171 focused tests pass across the five receipt/palette/handoff files, with zero skips. Focused ESLint and git diff --check pass. The uncached creation test still proves immediate rendering without a redundant GET.
