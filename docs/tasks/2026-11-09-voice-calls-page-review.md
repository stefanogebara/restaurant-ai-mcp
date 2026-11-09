# Voice and Calls page review

## Scope and reference lock

Review the authenticated Voice and Calls journeys without requiring the owner's handset. Preserve the dirty original checkout and use this isolated worktree. Never use Inner, assign a restaurant phone, rewrite history or send guest messages during UI checks.

Primary visual reference: DESIGN.md Liquid Glass v2 and the existing Manager AI surface. Preserve warm canvas, serif headings, restrained action burgundy, semantic status colors, hairline sections and dense-object-only glass. Secondary references: Refero's bundled craft-details.md for form focus, error recovery and save feedback; copywriting.md for clear actions and honest state copy. Live Refero tools are unavailable. This is a direct audit/fix of the existing product, not a new visual system.

| Decision | Source | Purpose |
| --- | --- | --- |
| Keep content on the canvas and controls grouped | DESIGN.md | Match the existing platform instead of adding decorative cards. |
| Separate an active call from an unknown historical result | Real call snapshots + copywriting.md | Avoid presenting a placeholder as a finished result or known language. |
| Show only actual transcript speech | Real provider transcript + DESIGN.md | Remove empty tool-turn bubbles and wasted mobile space. |
| Preview current language/settings, report errors and stop stale audio | Hook evidence + craft-details.md | Make auditioning reliable before saving. |

## Work

- [x] Capture authenticated desktop/mobile Voice and Calls behavior and concrete failures.
- [x] Add regressions for preview freshness, cleanup/races/errors and call-state/transcript behavior.
- [x] Fix bounded preview and call-detail presentation issues; preserve routing and tenant boundaries.
- [x] Integrate the independent backend voice audit findings only where reproduced and in scope.
- [x] Complete frontend/backend/build/static checks and independent review.
- [ ] Verify PR checks, exact production SHA/alias and authenticated production behavior.

Saving a voice, playing a generated sample and completing a telephone call are separate facts. Technical test calls remain in the dedicated sandbox. No test may spoof the owner's caller identity or require the owner to call now.

## Reproduced before fixes

Native audio playback with a muted output confirmed a real Portuguese preview was generated, then replayed unchanged after staging Spanish. The cache made no second preview request. The same audio continued after SPA navigation to Dashboard, with document time origin unchanged. No settings were saved. Keyboard Enter on a library preview button selected that voice and exposed Save Changes without playing it. The authenticated Spanish library also showed English pagination text. Real completed-call transcripts contain blank provider tool turns, rendered as empty agent bubbles. Incomplete calls expose the initial English placeholder, and completed calls with no duration can be mislabeled Live.

The independent backend audit also reproduced three save/sync consistency failures with mocked providers: English-only TTS model retained on Portuguese change, manual prompt refresh not repairing the saved greeting, and persona-triggered knowledge replacement dropping POS menu items. These are under a separate backend write scope in the same review batch.

## Local verification

- Backend: 332 suites passed; 4,752 tests passed; six pre-existing skips.
- Frontend: 150 suites and 1,274 tests passed.
- Production build, changed-file ESLint, API syntax, fire-and-forget audit and phantom-column audit passed.
- Independent frontend review approved the call presentation and audio lifecycle changes. Responsive keyboard navigation derives focus and columns from the rendered grid.
- The explicit manual persona refresh now repairs the saved opening line as well as the prompt. Automatic name-only updates retain their existing greeting preservation rule.

The local build retains the existing large-chunk warning. Jest retains its existing forced-exit warning. Neither is evidence of an end-to-end phone call.

The independent backend review rejected underscore-spelled analysis locales. The corrected helper emits canonical `pt-br`, retains valid existing Portuguese variants, and normalizes legacy underscores. Revised expectations failed before the correction and passed afterward. Backend review then approved.

The final navigation audit found no entry to the Calls route from Voice or any other page. Voice now provides a localized Call History action beside Save, with an integration regression and independent layout-code review. Production visual verification remains pending.

## Preview gate finding

The first exact ready preview failed the authenticated Voice journey: `VITE_API_URL` sent subscription checks to the legacy `restaurant-ai-mcp.vercel.app` origin. Browser CORS blocked them, although both same-origin preview and production APIs returned the owner's active plan. This was a real browser failure, not a missing subscription.

Subscription checks now use the current deployment's API, consistent with the other Voice requests and the existing Vite proxy. Feature access exposes request failure/retry; Voice renders a retry message instead of an upgrade offer when the plan check fails. Three new regressions failed before and passed after this correction. The revised preview must pass the browser gate before merge.

A CLI `env run` access attempt unexpectedly created a disposable `seatable-preview-oidc-check` project containing only a 129-byte token-presence check, without credentials. It was deleted immediately; a subsequent provider lookup returned project-not-found. The Seatable project link and production were unchanged. Preview access uses a private development OIDC file and an origin-scoped header instead. All temporary credential files must be removed after verification.
