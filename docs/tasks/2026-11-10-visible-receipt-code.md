# Keep the full receipt code visible and easy to copy

Base: origin/main a5be8aed. Isolated worktree: restaurant-ai-mcp-receipt-copy.

- [x] Inspect the supplied production 320px screenshot and current confirmation renderer.
- [x] Reproduce the truncated-code renderer contract before production edits: six cases fail.
- [x] Extract a small ReceiptCode component with a full-width, selectable, wrapping opaque code.
- [x] Add a native 44px Copy code button with focus-visible styling and EN/PT/ES copy.
- [x] Show success only after clipboard resolution; use honest visible manual-copy fallback on denial or absence.
- [x] Cover exact case/symbol preservation, pending/success/failure, all three locales, and Enter/Space activation.

Target: DESIGN.md Warm Glass and the supplied production receipt, with Refero's bundled craft focus guidance. The code uses warm neutral text, the action uses burgundy, and feedback uses semantic emerald/amber. The label/action row may wrap independently; the opaque code occupies its own full-width line with min-width zero, max-width 100%, whitespace-normal and break-all. No ellipsis, fixed maximum code width, clipped overflow, or additional decorative card.

No API, push permission, receipt metadata, booking management handoff, or New reservation CTA changes. No live browser, provider, database, merge, or deployment operations. Parent owns live viewport verification.

Verification: all 49 focused tests pass across ReceiptCode, BookingConfirmation, and BookingManagementHandoff when run serially. The initial parallel run passed all new receipt cases but hit an existing one-second booking handoff wait; the serial rerun passes that case too. TypeScript project checks (tsc -b), focused ESLint, locale JSON parsing, and git diff --check pass. CSS wrapping is verified as a DOM/class contract; no new live viewport measurement is claimed.
