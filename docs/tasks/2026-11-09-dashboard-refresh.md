# Dashboard freshness fallback

The production audit in #282 found no operational tables in the Realtime publication. An open sandbox dashboard missed a new voice reservation until reload.

- [x] Add a foreground refresh each minute without depending on database publication.
- [x] Refresh pending recent WhatsApp confirmations every 15 seconds, bounded to five minutes.
- [x] Verify discovery, receipt transitions, background pause and old pending state with fake clocks.
- [x] Replace live claims on the authenticated dashboard with automatic refresh labels.
- [ ] Run frontend suite, build, review and PR checks.
- [ ] Verify main, exact deployment/alias, smoke and authenticated open-page updates.

The fallback adds up to one dashboard request per minute per visible active query, with a temporary faster interval for recent pending confirmations. Hidden tabs do not poll. No RLS policies, publications or provider routes change. Demo live badges retain their default behavior.

## Local review

146 frontend test files / 1,191 tests passed. Five fake-clock hook tests cover new data, receipt changes, background pause and immutable polling bounds; 15 badge tests cover EN/PT/ES and unchanged demo defaults. Playwright checked both periodic labels at 320/390/1200 px in all three languages without overflow. Independent review passed after anchoring the fast window to requested_at.
