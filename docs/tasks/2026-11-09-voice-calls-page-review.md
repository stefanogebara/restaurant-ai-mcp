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
- [ ] Add regressions for preview freshness, cleanup/races/errors and call-state/transcript behavior.
- [ ] Fix bounded preview and call-detail presentation issues; preserve routing and tenant boundaries.
- [ ] Integrate the independent backend voice audit findings only where reproduced and in scope.
- [ ] Complete frontend/backend/build/static checks and independent review.
- [ ] Verify PR checks, exact production SHA/alias and authenticated production behavior.

Saving a voice, playing a generated sample and completing a telephone call are separate facts. Technical test calls remain in the dedicated sandbox. No test may spoof the owner's caller identity or require the owner to call now.

## Reproduced before fixes

Native audio playback with a muted output confirmed a real Portuguese preview was generated, then replayed unchanged after staging Spanish. The cache made no second preview request. The same audio continued after SPA navigation to Dashboard, with document time origin unchanged. No settings were saved. Keyboard Enter on a library preview button selected that voice and exposed Save Changes without playing it. The authenticated Spanish library also showed English pagination text. Real completed-call transcripts contain blank provider tool turns, rendered as empty agent bubbles. Incomplete calls expose the initial English placeholder, and completed calls with no duration can be mislabeled Live.

The independent backend audit also reproduced three save/sync consistency failures with mocked providers: English-only TTS model retained on Portuguese change, manual prompt refresh not repairing the saved greeting, and persona-triggered knowledge replacement dropping POS menu items. These are under a separate backend write scope in the same review batch.
