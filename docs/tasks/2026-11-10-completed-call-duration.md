# Average call duration uses ended calls with known durations

A real sandbox call changed the displayed average from 93 to 88 seconds as soon as an active call appeared, while the number of completed calls was unchanged. Missing durations were treated as zero and the divisor included every call. Numeric and formatted output could also disagree by one second because rounding happened at different stages.

- [x] Average only calls with a valid end timestamp and a finite, non-negative numeric duration. Preserve genuine zero-second and ended-error samples.
- [x] Round once and use the same seconds for numeric and formatted output. Preserve the empty-sample zero response contract.
- [x] Preserve restaurant ownership, channel filters, booking counts, outcome breakdown and completion calculations.
- [x] Verify 17 new regressions, 5,139 backend tests (6 existing skips), 1,431 frontend tests, build, changed-handler syntax and static audits. Independent review found no blockers.
- [ ] Compare the exact preview and current production API during the same real Portuguese consultation call, using only the dedicated sandbox.
- [ ] Merge passing checks, release tested main, confirm production alias and expected live statistics, and repeat production smoke.

The read-only comparison must distinguish an actual phone call served by production from the candidate API's statistics calculated over the same live database. No provider failure or receipt is simulated. Voice policy, telephone route, WhatsApp sender and message delivery history are unchanged.
