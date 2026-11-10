# Repair native voice receipt-code collection

- [x] Observe a genuine native telephone refusal with a malformed model-produced receipt code.
- [x] Confirm the reservation remained unchanged and no private booking facts were returned.
- [x] Require a successful restaurant-binding tool result before guest lookup.
- [x] Collect prefix, receipt date and three case-sensitive suffix chunks without guessing.
- [x] Distinguish proof refusal from system unavailability.
- [x] Independently review the prompt-only publication guard.
- [x] Pass 108 integrated operator/vocabulary/policy tests.
- [ ] Publish only after reviewed main checks pass.
- [ ] Retest native rescheduling, declined cancellation and confirmed cancellation separately.

## Evidence limits

The first automated phone call refused a cancellation without a receipt code. The next real call faithfully transcribed the caller's spelled code, but the model omitted two suffix characters in its tool arguments and skipped restaurant binding. The server returned 403. The reservation stayed confirmed at 19:00. The agent incorrectly described this proof refusal as inability to access the system.

The repair changes only the reviewed guest-policy paragraph. The operator pins the source version and verifies all seven existing tool configurations, response mocks, language, model, voice, native authentication headers, procedures and phone assignments before and after publication. Configuration verification alone does not prove the phone retest succeeds.
