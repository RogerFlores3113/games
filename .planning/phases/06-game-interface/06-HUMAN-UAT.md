---
status: pending
phase: 06-game-interface
source: [06-CONTEXT.md D-25]
started: 2026-09-17T19:51:00Z
updated: 2026-09-17T19:51:00Z
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

result: pending

## Owner's verbatim reply

(awaiting owner reply)

## Deferred check offered

The deferred real-phone RT-04 check (docs/manual-checks/mobile-background.md) is now runnable per D-25 (UI work complete) and was offered to the owner at this checkpoint. Owner's choice: (awaiting owner reply)

## Deviations from UI-SPEC for owner review

- 06-01: (comment-wording fixes only, no UI-SPEC deviation — noUncheckedIndexedAccess fallbacks and a literal-substring comment reword; not visible to the owner)
- 06-02: (comment-wording fixes only, no UI-SPEC deviation)
- 06-03: **Card sizes widened beyond the UI-SPEC target for 6-suit variants.** `TeammateCard` widened from the UI-SPEC's 56x78 target to 64x84; `OwnHandCard` widened from 72x100 to 88x112 — both within the ranges the UI-SPEC itself named as acceptable ceilings — to fit the 6-suit Rainbow/Black candidate strip on one line.
- 06-04: (comment-wording fix only, no UI-SPEC deviation)
- 06-05: No deviations. (Pre-existing RT-04 frozen-tab Playwright flake noted, unrelated to UI-SPEC.)
- 06-06: **Vertical spacing tightened board-wide to fit 5 players at 1280x720.** `HanabiBoard.tsx`, `Table.tsx`, `Hand.tsx`, `CardActions.tsx`, and `CluePicker.tsx` had their gap/padding tokens reduced from `--space-md`/`--space-lg`/`--space-sm` down to `--space-xs` or explicit 3px so a 5-player game fits without scrolling at 1280x720; every interactive control's 44px touch-target minimum was left unchanged. (Pre-existing RT-04 frozen-tab Playwright flake noted again, unrelated to UI-SPEC.)

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
