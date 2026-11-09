# Truthful call and WhatsApp status

Live production inspection found `success: null` on a successful provider availability check, while the call detail modal rendered a failure cross. The owner WhatsApp diagnostic was delivered with a real Meta receipt and the dashboard updated without reload. The later real read receipt was not fetched because polling stopped on delivery; a manual status refresh confirmed it. The owner's restaurant has no telephone line; sandbox calls must remain scoped to the sandbox.

- [x] Verify the real WhatsApp receipt, dashboard status and tenant separation.
- [x] Reproduce the misleading tool failure in the authenticated call modal.
- [x] Add failing regressions for unknown, successful and failed tool results.
- [x] Render unknown results neutrally with an explicit accessible label.
- [x] Review the provider-ingestion contract without inventing historical results.
- [x] Record each new availability invocation's actual boolean result after execution, including thrown failures; successful unavailability stays successful.
- [x] Count only explicit tool failures in validation, retaining missing-check and known-error warnings.
- [x] Reproduce delivery-to-read staleness with two failing hook regressions.
- [x] Observe delivered messages every minute within the original ten-minute window; pending messages stay at fifteen seconds. Stop on read, failure, invalid data or expiry; pause in background tabs.
- [x] Verify full local tests/build, API syntax and static audits; independent review passed.
- [ ] Verify CI and exact production deployment.
- [ ] Recheck the original live conversation and read message in the browser.

Keep the original dirty checkout untouched. No provider route, guest data or restaurant configuration changes belong to this fix. Do not resend the delivered diagnostic unnecessarily.

## Review boundary

Legacy tool logs do not have provider request IDs. Do not infer historical success by tool name, call completion, or an agent's spoken answer. Unknown remains unknown. The forward fix records the exact scoped application result, and the existing authenticated call binding stays unchanged. Eight backend regressions and six initial UI regressions failed before their respective fixes.

## Local verification

Full backend: 4,729 passed, six pre-existing skips. Frontend after the read-receipt fix: 1,212 passed. Updated frontend build, API syntax, fire-and-forget, phantom-column and whitespace audits passed. Independent review of the call changes passed with 88 backend and 11 frontend checks; the receipt-polling review passed all 18 hook tests with no blockers. No historical results or provider records were rewritten. No additional diagnostic was sent for the read-status regression.
