# Close runtime gaps found by real sandbox calls

Real calls used the original official restaurant name, the verified test caller and unchanged shared phone route. No temporary aliases or live customer records were used.

1. Spanish consultation 109 queried 2023-11-11 and received available=true. Reject invalid/past availability slots before capacity reads, using restaurant-local time.
2. Portuguese booking 110 created one reservation and zero WhatsApp requests with notices disabled. Its in-flight row incorrectly defaulted to English until post-call metadata arrived. Keep language unknown until provider evidence exists.
3. Reconfirmation changed guest-name diacritics from Ambar to Âmbar. Compare only that harmless spelling difference within the existing authenticated call/tenant/phone and full booking details; retain the original guest name and never send again.
4. The call activity list displayed a missing result next to a failed result because only the failure log omitted restaurant_name. Correct presentation without modifying raw evidence or hiding distinct attempts.

- [x] Capture real provider transcripts, DB state and the in-progress/end statistics transition.
- [x] Cancel the exact tagged booking and release its table references; retain call and delivery history.
- [x] Implement each narrow regression, review independently and verify the combined branch.
- [ ] Publish passing main through its existing READY Git build, verify exact SHA/alias and authenticated mobile UI.
- [ ] Repeat actual phone scenarios and confirm zero active QA bookings afterwards.

The first language-only provider repair published correctly but failed implicit-English selection in call 108. An explicit English request in call 111 switched correctly. Spanish call 109 also failed automatic selection. Test model selection with all external tools mocked before any model publication; simulation evidence is not real telephone proof.

Evidence retained privately: English baseline 106 and repeat 108 (safe consultation, wrong response language); canonical suggestion rejection 107 (remained unbound); Spanish 109 (no write, wrong year/language); explicit-language 111 (English success); Portuguese 110 (one booking, no WhatsApp request). Booking 110 was cancelled with exact tenant/code/external-id/name/date/time/party guards. Its live stats rose from 10 to 11 calls, bookings 4 to 5 while completed stayed 10; completed became 11 only after ended_at was populated.

Verification: 5,041 backend tests passed with 6 existing skips; 1,426 frontend tests passed, followed by a type-only nullable-language contract correction verified by the production build. Changed JavaScript syntax, fire-and-forget/phantom-column audits and diff checks passed. Explicitly disabled notices now omit WhatsApp failure/request/delivery claims in the confirmation; enabled and legacy status wording is unchanged. All behavioral changes received independent reviews. The separate provider model comparison has not authorized a model publication.
