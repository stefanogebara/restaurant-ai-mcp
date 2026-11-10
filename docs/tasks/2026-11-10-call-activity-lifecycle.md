# Show one reservation activity for one start/result lifecycle

- [x] Verify the repaired official-name telephone flow in production: a separate caller confirmation preceded canonical identification, one reservation and one Meta-delivered WhatsApp message.
- [x] Verify the same caller cannot bind an unrelated nonexistent restaurant; no operational calls, binding, reservation or message followed.
- [x] Reproduce the remaining display issue from the actual completed call: the raw log contains a null start and a successful finish for the same reservation invocation, and the modal renders two rows.
- [x] Add a presentation-only lifecycle normalizer and a modal regression while preserving raw logs and booking idempotency guards.
- [ ] Review, finish checks and publish the exact tested main build.
- [ ] Reopen the actual historical call in production at desktop, 390 and 320 pixels; verify one completed reservation activity and matching duration, language and reservation code.

The normalizer handles only the known `create_reservation` start/result producer. It folds adjacent matching parameters with a boolean terminal result, keeps every terminal attempt, and retains ambiguous concurrent or unresolved starts. It does not infer success for unknown standalone records and does not mutate database evidence. No new call or WhatsApp send is needed for this display-only repair.

The real test booking was cancelled with empty table assignments. Notices were restored to disabled, aliases remain unchanged, and zero active QA bookings were verified. The completed call and delivered receipt remain as genuine audit evidence.

## Independent review

The final source passed 43 focused tests during independent review. The actual null-start/boolean-finish case has a rendering regression, while unknown results, multiple terminal attempts, concurrent starts and mismatched parameters remain distinct. Worker checks also passed TypeScript and ESLint. Production visual verification remains pending until the exact final build is published.
