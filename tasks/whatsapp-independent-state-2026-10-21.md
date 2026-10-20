# WhatsApp page: separate connection from notification status

## Plan

- [x] Keep the connection section driven only by the provisioning/routing read.
- [x] Show notification/delivery status errors locally, with retry, without masking the number.
- [x] Add UI regressions for independent failures and loading.
- [ ] Run full verification, merge a bounded PR, and confirm production by SHA.

## Reference lock

Existing WhatsApp workspace and `DESIGN.md` Liquid Glass v2 are the target: content on
canvas, hairline sections, burgundy only for retry actions, semantic red for errors.
No new visual language or component chrome is introduced. The product rule is that a
secondary notices read cannot erase evidence of a confirmed receiving number.

## Review

The number and route are now rendered from provisioning independently of the
outbound notification status read. An outbound status failure appears only in
its disclosure and has a local retry; optional settings remain visible.

| Check | Result |
|---|---|
| Focused WhatsApp workspace | PASS; 16 tests |
| Frontend build | PASS; existing bundle/import warnings |
| API syntax | PASS |
| Backend Jest | PASS; 307 suites, 4,457 tests (6 skipped) |
| Frontend Vitest | PASS after loading regression; 138 files, 1,107 tests |
| Diff whitespace | PASS |

Authenticated visual QA is still outstanding because the current browser has
no login session and the Mac is locked. No real WhatsApp message was sent.
