# Keep the read-only Voice overview reachable

The authenticated desktop preview exposed a remaining navigation mismatch after the phone overview fix: Free users could follow Calls to the saved phone setup, but the main Voice link still pointed to subscription management. Mobile More shares that navigation configuration.

- [x] Remove the paid navigation requirement only from Voice; keep authentication and page/API paid controls intact.
- [x] Cover Free desktop/mobile destinations, active Voice/Calls state and other paid items' upgrade links.
- [x] Independently review the final two-file change.
- [x] Verify backend (4,980 passed; 6 existing skips), frontend (1,400 passed), TypeScript/build and diff.
- [ ] Verify the exact preview and passing PR checks, merge, test main and promote only its existing READY build.
- [ ] Confirm production navigation and phone overview at desktop, 390px and 320px without paid API requests or writes.

Reference lock remains DESIGN.md / the existing warm Seatable sidebar and mobile drawer. No new imagery or motion is needed. Provider language readback alone is not acceptance: real English call 108 still answered in Portuguese despite the first guarded language repair. That separate runtime investigation remains open.
