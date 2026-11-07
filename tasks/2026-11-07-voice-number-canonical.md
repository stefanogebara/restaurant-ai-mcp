# Voice number canonical routing

- [x] Audit live Seatable number claims and isolate the ambiguous route.
- [x] Canonicalize the two malformed active claims in production so routing fails closed.
- [x] Add a regression for duplicate claims with trailing whitespace.
- [x] Make the Twilio route detect those claims before business-phone fallback.
- [x] Enforce canonical E.164 numbers for active voice assignments in the database.
- [x] Run focused tests and full local verification.
- [ ] Check PR, merge, and verify the exact production deployment.

## Review

Two active restaurants claimed the same Twilio number with a trailing newline.
Another restaurant's business phone matched that number. Exact JSON matching
missed both AI claims, allowing the business-phone fallback to select a tenant.
The data repair makes the current route reject the ambiguity. This change
prevents a malformed active claim from reopening it.
The migration was applied to seatable-eu as version 20261107135839; the
constraint exists and all three currently active AI phone assignments pass.
The routing suite passes 12/12, backend Jest 4,500/4,500 with six existing
skips, frontend Vitest 1,107/1,107, and the client production build passes.
