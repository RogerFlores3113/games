---
status: complete
phase: 06-game-interface
source: [06-CONTEXT.md D-25]
started: 2026-09-17T19:51:00Z
updated: 2026-09-16T00:00:00Z
---

## Current Test

### 1. Owner visual sign-off on the designed board at desktop sizes (D-25; UI-06, UI-08, UI-09, UI-11)

expected:
- Open http://localhost:3100, create a room in each variant (Base, Rainbow, Black), join from a private window (add more windows for 3-5 players if desired), and start the game.
- At 1280x720 and at 1920x1080: clue tokens, fuses, deck count, discard pile, and every stack are visible without opening anything, and nothing needs scrolling at 1280x720.
- The active player is unmistakable (glowing ring on their hand, turn text, and a strong "Your turn" state on your own band when it is you).
- Giving colour and rank clues briefly flashes touched cards on both screens, then settles into a glow; your own cards show confirmed info and struck-out candidates; the marks survive a refresh of the target window.
- The look reads as a dark "fireworks night" table; the three luminosity steps (unclued dim, touched glowing, fully known brightest) are easy to tell apart at a glance; at the dimmest (unclued) step every suit's glyph and colour is still distinguishable (D-10), including with colour ignored (colourblind-safe).
- Hovering and Tab-focusing clue options highlights the right cards; disabled action buttons state why they're disabled.
- Playing a game to the end (or misplaying three times) shows the designed end overlay: score / max, band, reason, stacks, and New game.
- The now-runnable deferred RT-04 real-phone check (docs/manual-checks/mobile-background.md) is offered; owner states whether to run it now, later, or keep it waived.

result: pass

## Owner's verbatim reply

> looks great for a first pass. But: i'd like you to try and use hanabi's firework design for each of the tiles if possible. To show to other players. I'd also like for the notes feature - each tile's marked notes - the hints happen above the card (is the meaning of this clear to you?). Players have to write them down themselves. Furthermore, your own tiles should be rearrangable by clicking and dragging. If you drag a tile to the center, you play it. If you drag it to a discard zone, you discard it. When a tile is replenished to hand, it should take the slot of whatever was previously discarded - so it's not a queue. There should be simple audio queues for hints, plays, discards, and fuses used. When a set of 5 is completed, also have a simple audio effect. And the background - make it a starry night sky, static image. Or maybe make it a city at night background. Firework time. Does this make sense?

Owner's follow-up answers to clarifying questions:

> Notes: Clue marks above, plus notes (clue marks shown above each card, not on it; each own card also gets a player-typed note box; automatic ruled-out tracking stays)
>
> Card order: Yes, everyone sees it (server-synced hand order)
>
> Background: City at night
>
> Scope: Close Phase 6, new Phase 6.1

## Deferred check offered

The deferred real-phone RT-04 check (docs/manual-checks/mobile-background.md) is now runnable per D-25 (UI work complete) and was offered to the owner at this checkpoint. Owner's choice: owner did not state — the reply did not address the RT-04 real-phone check; it remains deferred, not run or waived by this reply.

## Deviations from UI-SPEC for owner review

- 06-01: (comment-wording fixes only, no UI-SPEC deviation — noUncheckedIndexedAccess fallbacks and a literal-substring comment reword; not visible to the owner)
- 06-02: (comment-wording fixes only, no UI-SPEC deviation)
- 06-03: **Card sizes widened beyond the UI-SPEC target for 6-suit variants.** `TeammateCard` widened from the UI-SPEC's 56x78 target to 64x84; `OwnHandCard` widened from 72x100 to 88x112 — both within the ranges the UI-SPEC itself named as acceptable ceilings — to fit the 6-suit Rainbow/Black candidate strip on one line.
- 06-04: (comment-wording fix only, no UI-SPEC deviation)
- 06-05: No deviations. (Pre-existing RT-04 frozen-tab Playwright flake noted, unrelated to UI-SPEC.)
- 06-06: **Vertical spacing tightened board-wide to fit 5 players at 1280x720.** `HanabiBoard.tsx`, `Table.tsx`, `Hand.tsx`, `CardActions.tsx`, and `CluePicker.tsx` had their gap/padding tokens reduced from `--space-md`/`--space-lg`/`--space-sm` down to `--space-xs` or explicit 3px so a 5-player game fits without scrolling at 1280x720; every interactive control's 44px touch-target minimum was left unchanged. (Pre-existing RT-04 frozen-tab Playwright flake noted again, unrelated to UI-SPEC.)

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None — Phase 6 is approved as a working first pass. The owner requested additional design/feature work (per-tile firework art, notes-above-card display plus a player-typed note box, drag-to-rearrange/play/discard for own hand, discard-slot replenishment (no queue), audio cues for hints/plays/discards/fuses/set-completion, and a city-at-night static background) which the owner explicitly scoped as a new inserted Phase 6.1, not a Phase 6 gap. The deferred RT-04 real-phone check (docs/manual-checks/mobile-background.md) was not addressed by the owner in this reply and remains deferred.
