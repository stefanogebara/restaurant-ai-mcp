# Accurate call language and guest-name review

Real English/Spanish calls successfully switched output language, yet provider metadata retained primary Portuguese. The ingestor now uses verified native language-switch results for the final call language, with strict flags/payload validation and safe fallback. No user speech, tool arguments, failed result or imitation result selects language. Existing tenant/booking/outcome/dedup guards remain intact.

A real English booking also retained an earlier ASR surname after a later correction. The reviewed agent policy now reads back the complete latest reservation name and all booking facts, then waits for a separate explicit confirmation before creation. A correction updates pending details and requires a new readback; it does not modify an already persisted booking. No guest or restaurant aliases are added.

- [x] Reproduce primary-language metadata mismatch and cover decoded/raw DTO forms, native flags, malformed/conflicting data and later failed switches.
- [x] Validate actual provider snapshots with the same pure language resolver; plan a scoped repair for three sandbox records without resetting fetched markers or replaying analysis/usage side effects.
- [x] Validate the complete-name policy in 18 controlled actual-trace checks; compare the exact resulting prompt to the accepted candidate.
- [x] Verify language/policy source: 5,122 backend tests, 1,426 frontend tests, build, syntax/static audits and two independent operator reviews.
- [x] Fix two browser-reproduced UI issues: keyboard focus reaches the offscreen mobile sidebar, and a failed list refresh unmounts open call details. Preserve cached calls, show an inline retry warning and keep desktop navigation usable.
- [x] Verify final combined source: 5,122 backend tests (6 existing skips), 1,431 frontend tests, build, static audits and independent UI review. The menu resize regression also releases focus, scroll lock and dialog semantics at desktop width.
- [ ] Merge passing checks and release tested main. Record runtime verification on the release pull request.
- [ ] Apply the guarded policy from tested main with a fresh serving version and exclusive private journal; verify protected readback.
- [ ] Confirm actual corrected-name booking, refusal and EN/ES stored-language behavior in production.
- [ ] Correct only the reviewed historical sandbox language fields from verified provider events, clean tagged bookings, preserve delivery history and remove temporary credentials.

The live WhatsApp confirmation test produced one reservation and one Meta-delivered message, and the actual mobile dashboard displayed WhatsApp · Entregue. That test booking was cancelled with exact identity/tenant/code/date/time/party guards and table references cleared. The sandbox preference is restored to false; canonical routing/aliases are unchanged. Simulated provider failure cases remain distinct from real delivery evidence.
