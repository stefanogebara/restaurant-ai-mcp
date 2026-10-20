# WhatsApp shared-number picker — 2026-10-21

Problem: the shared-number picker chunks restaurants into sections of ten but
can send more than ten rows in one interactive list. Meta list messages have a
ten-row total limit; with 19 eligible restaurants the first customer cannot
reliably choose one. The existing sender truncates titles but not row count.

- [x] Reproduce the oversized payload with a receiver-scoped pipeline test.
- [x] Paginate without persistent page state; keep each list at ten rows or
  fewer, including navigation rows. Never infer or fuzzy-select a restaurant.
- [x] Verify forward, back, final-page and stale/invalid selection behavior.
- [x] Run focused tests, the Seatable verification suite and a second review.
- [ ] Publish through one scoped PR only after checks and preview are ready;
  verify main and the exact production deployment without a duplicate deploy.

Safety: preserve the dirty original checkout, use this isolated worktree, do
not send real WhatsApp messages, and do not touch the Inner organization.

Review: the pre-fix 19-restaurant test received 19 rows instead of 9. After
the change, the same scenario sends 9/10/4 rows across three pages, can move
backward, resets an invalid page request to page one, and binds only an
explicitly chosen restaurant. Stale page/row taps after a choice or a receiver
reassignment are ignored. Explicit provider 4xx rejections release the send
reservation; 5xx/unknown outcomes remain quarantined. Independent review
found no remaining release blocker. Backend: 4,449 passed (6 skipped);
frontend: 1,102 passed; frontend build, syntax and both API audits passed.
