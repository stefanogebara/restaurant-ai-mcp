# Seatable platform review — 30 September 2026

This is a read-only audit of the authenticated production experience, paired with a code review in the isolated `codex/platform-insights-redesign` worktree. No restaurant settings, reservations, phone numbers, voice agents, or campaigns were changed in production. The visual screenshots used for redesign critique contain **synthetic fixtures**, not live customer data.

## Design direction

Keep Seatable's Instrument Serif, DM Sans, warm canvas, burgundy actions and semantic state colors from `DESIGN.md`. Adapt the operational clarity in [RON's Spacetihq case](https://rondesignlab.com/cases/spacetihq-workplace-optimization-saas-ux-ui-design) and the evidence-adjacent AI suggestions in [its Sisense case](https://rondesignlab.com/cases/sisence-ai-assistant-saas-ux-ui-design). Do not copy RON's blue palette or add decorative 3D. For each screen, identify its primary decision, the evidence behind it, and the next safe action before drawing components.

The first Insights slice replaces the repeated card grid with a service briefing, a ranked customer list, customer-health evidence and a smaller strategy scorecard. Repeated independent screenshot-only critiques improved from 6.5/10 to a best score of 8.2/10; the latest Overview score is 8.0/10. The Analytics tab rose from 6.6/10 to 7.2/10 after a second composition pass. Neither reaches the requested studio bar. Remaining concerns are composition, chart finish and mobile density. Treat this as an interim implementation, not design sign-off. Visual QA uses synthetic fixtures and does not prove production data rendering.

## Findings ordered by risk

| Priority | Surface | Observation and impact | Current disposition |
|---|---|---|---|
| P0 | Campaigns | The bulk “email” creation path shared a WhatsApp endpoint; the delivery service could send through WhatsApp. The UI's email claim was unsafe. | Fixed in isolated branch: bulk email creation/send explicitly rejected, existing email history read-only, WhatsApp delivery tenant/channel guarded. **Not deployed.** |
| P0 | Individual recovery email | The endpoint could return success after provider failure or missing email, creating a false success toast; customer ownership/consent checks were insufficient. | Fixed in isolated branch with scoped lookup, opt-out check, delivery-result response, localized subject/greeting and signed unsubscribe link. **Not deployed.** The wider marketing-consent policy still needs a dedicated review. |
| P1 | Manager AI | In a real prior conversation the assistant said it would note two bookings, then said it could not access reservations. This erodes trust and may leave guests without a booking. | Added explicit PT/ES/EN prompt guard against claiming unverified writes; the operator still needs deterministic tool/confirmation UX before it can promise bookings. |
| P1 | Insights | “Today” values counted future reservations; a list of five at-risk guests sat beside a total of fourteen without explaining the subset. | Today filter and subset explanation implemented and tested in branch. |
| P1 | Strategy metrics | No-show denominator included unfinished today and future bookings, suppressing the apparent rate. “Conversion” was actually share of reservation rows in confirmed/seated/completed status. | No-show now uses past restaurant-local dates and returns its sample size; widget relabels confirmed-status share. Inquiry-to-booking conversion remains undefined. |
| P1 | Analytics tab | A 30-day selection showed zero bookings while lower sections showed a historical no-show rate and revenue opportunities, without visible period boundaries for each module. The old no-show rate formula mixed all-time completed services with period bookings and could be negative. | Fixed in isolated branch: date-scoped status share, recorded revenue only, clear separate horizons for live occupancy, all-time table history, next-seven-day risk and 30-day hypotheses. Speculative money projections and inert CTA removed. A broken tiny status donut was replaced by a readable proportional breakdown. **Not deployed.** |
| P1 | Risk scores | The no-show and customer churn outputs are rule-based 0–100 scores, but the UI rendered them as `%`, implying calibrated probabilities. | Overview now labels them as scores out of 100. Calibration and validation remain future work. |
| P2 | Dashboard | English Stripe warning in a Portuguese experience; the first fold gives large space to zeros/empty state while the floor operation sits lower. | Open: redesign as service command view after metric truth work. |
| P2 | Voice settings | Model selection displays fixed-looking latency/cost estimates and controls for speed, stability, similarity and expressiveness. Language choices use emoji flags as icons. | Open: verify estimates and model-specific settings; replace flags with supported icon/text treatment. |
| P2 | WhatsApp setup | The unconnected state is comparatively clear and sequential. A live connection cannot be tested without a controlled number and Meta verification. | Preserve structure; test in staging with a dedicated number. |
| P2 | Customers | Eighteen records are visible, with a dominant at-risk segment; dense filters and repeated status rows consume the first fold. | Open: add prioritized interventions, retain search/filter power in a quieter secondary layer. |
| P2 | OAuth | The Google account chooser displayed privacy/terms links on a different brand domain. | Audit OAuth configuration and legal pages before changing production settings. |

## Eleven v4 Turbo: controlled pilot, not automatic migration

The [ElevenLabs announcement](https://elevenlabs.io/blog/eleven-v4) and [model guide](https://elevenlabs.io/docs/overview/models) describe `eleven_v4_turbo` as a **speech-synthesis model** for low-latency agents, not a replacement for Seatable's reasoning model. ElevenLabs reports about 100 ms median inference latency and support for more than 90 languages; those are vendor figures, not Seatable measurements. Current agent creation uses Flash v2/v2.5. Do not expose v4 as a user choice or change existing agents until the account API accepts this model and the current voice settings map correctly.

Pilot on one disposable test restaurant: same voice and scripts on Flash and v4 Turbo; Portuguese and Spanish booking, changes/cancellations, interruptions, digits, dates, names and noisy speech; measure time to first audible response, end-to-end turn latency, intelligibility, reservation correctness, handoff/recovery, and cost per completed booking. Verify supported stability/similarity/speed/style fields with a live API response before enabling UI controls. Keep a rollback to the previous model ID and do not use the owner's production restaurant for the experiment.

## Next release order

1. Finish truthful, decision-led Insights composition and pass the independent visual bar on desktop and mobile.
2. Fix Manager AI write-capability claims and action confirmation before promoting it as an operator.
3. Reconcile Analytics periods, historical vs forecast labels, and empty/error states.
4. Redesign Dashboard around tonight's service and exceptions; then Customers and CRM follow-up. The current dashboard's zero-state guide and floor plan occupy much of the first fold, and its empty-state test only considers today/tomorrow rather than later bookings. Preserve the floor-plan workflow while moving exceptions and next actions into the opening hierarchy.
5. Pilot Eleven v4 Turbo in staging; revise Voice settings only after compatibility and latency evidence.
6. Test WhatsApp connection, voice calls and end-to-end booking with dedicated test numbers; finish shell/navigation and marketing duplication cleanup.

No production deployment should be inferred from a passing local build or a visual prototype. This branch remains an in-progress first slice. Each release needs an authenticated staging walkthrough, responsive screenshots, targeted tests, and a rollback check.
