# ElevenLabs date/time tool identity

- [x] Reproduce the missing restaurant ID in the scoped date/time tool URL.
- [x] Add the same ID query parameter used by the other scoped webhook tools.
- [x] Pass the focused tool and agent-payload tests.
- [ ] Check the PR, merge, and verify production by SHA.

## Review

`get_current_datetime` carried an `el_whsec_` Bearer but omitted the
`restaurant_id` required to validate it. Its first call in a conversation
therefore received 403. The URL now includes the restaurant ID when present.
The regression failed before the one-line change and passes afterward.
