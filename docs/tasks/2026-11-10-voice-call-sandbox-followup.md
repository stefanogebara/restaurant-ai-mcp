# Voice and restaurant-day recovery after the real phone audit

- [x] Reproduce the no-agent screen: a permanent creation promise hides saved shared-phone setup.
- [x] Replace it with read-only phone status, Call History and assisted setup; preserve subscription checks and owned-agent write controls.
- [x] Reproduce the travelling-host date mismatch: Madrid is 10 November while São Paulo is 9 November; a 10 November reservation belongs under Tomorrow.
- [x] Group Today, Tomorrow and Week using the restaurant timezone, with calendar-day arithmetic across DST and UTC fallback matching the API; use the same restaurant clock for the date heading and greeting.
- [x] Independent review of both fixes; focused regression tests, TypeScript and lint.
- [x] Final full frontend: 155 suites / 1,364 tests passed; TypeScript/Vite build passed. Backend source is unchanged from the 4,814-test production-verified release.
- [ ] PR checks, exact preview and production verification.
- [ ] Verify the real sandbox telephone reservation and Meta delivery on the corrected dashboard, then restore temporary sandbox settings and cancel the tagged bookings.

These changes do not change provider routes, subscription records, billing configuration or the shared agent. The browser-only Voice preview may use subscription/empty individual-agent GET fixtures because the dedicated sandbox has a Free plan; actual call, reservation and delivery verification must use real APIs without fixtures.

The first post-release call could not identify the English technical sandbox name after ASR distorted it. The identification endpoint correctly rejected the unknown name and did not assign the transcript to a tenant. A unique explicit Portuguese spoken alias is temporarily added to the owned sandbox for the automated call. Fuzzy identification, fake callbacks and manually marked delivery are forbidden. Final release and E2E evidence is recorded in the pull request after verification.

Real backend tests passed on released PR291: enabled notices produced one reservation and one Meta-delivered receipt; disabled notices produced one reservation and zero tracking/send attempts. Both calls completed with Portuguese summaries and matching reservation IDs. Original outbound preference and spoken aliases were restored. Tagged reservations remain only until the corrected dashboard is visually verified, then will be cancelled with exact identity guards.
