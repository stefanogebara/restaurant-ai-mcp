# Recognize official restaurant names in telephone speech

- [x] Re-read the failed provider transcript and inspect the actual shared agent.
- [x] Confirm Scribe realtime has an empty recognition vocabulary; keep exact tenant binding unchanged.
- [x] Add a tested, bounded vocabulary sync from eligible official restaurant names, excluding aliases and guest data.
- [x] Verify workspace, project, shared agent, version and preservation of unrelated settings before applying.
- [ ] Review and merge the tested operator code, then update only ASR keywords on the serving agent version.
- [ ] Repeat real telephone calls using the official name and assert canonical identification, correct tenant, one reservation and actual WhatsApp delivery.
- [ ] Cancel tagged bookings and restore the sandbox notice preference; retain the ASR fix and remove temporary credentials.

No alias may be added for this test. Existing aliases must remain unchanged and may not count as successful canonical identification. No fuzzy automatic binding, caller-ID restaurant selection, phone routing changes or weakened tool authentication. Record provider configuration/version evidence separately from Git and web deployment evidence.

## Review before provider apply

The official-name call at 10:00 UTC reproduced the failure: Scribe transcribed the name as “Seatable & The Sandbox” and “The Atable & The Sandbox”. Exact identification rejected both; no tenant binding or reservation was created.

The guarded dry run reads the live Seatable workspace, published main version and both published/draft-aware procedure inventories. It proposes only canonical ASR terms: `CI`, `Sandbox`, `Seatable`, `Seatable CI Sandbox`. All protected configuration hashes match the initial snapshot. The operation explicitly pins an empty procedure map and refuses unknown/nonempty inventories to prevent incidental draft publication.

Local backend verification passed 4,848 tests before the procedure guard, and all 61 focused final-guard tests passed. The frontend run passed 1,362 tests and had two one-second lookup timeouts in unchanged restaurant-settings tests under concurrent build load; all 13 tests in that file passed on an isolated rerun. CI must finish green before apply.
