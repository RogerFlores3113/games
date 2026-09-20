---
quick_id: 20260919b
slug: hint-retention-accumulates
status: complete
completed: 2026-09-19
---

# Summary: retained hints accumulate instead of overwriting

Owner report, verbatim: "with hint retention on - a new hint for a tile overlays the
prior hint so information isn't well-retained. Not great!"

## Cause

`hintDisplayFor` read only the LAST entry of `facts.positiveClues` — UAT gap 34 (sixth
owner review, 2026-09-18), which overturned D-06's accumulation. That rule is right for
the default lifetime, where a hint clears as soon as the next player acts, but the
keep-hints toggle extends a hint to the card's whole life in hand, and there "newest
only" destroys exactly what the toggle is for.

## What changed

- **`lib/hanabi-hint-logic.ts`** — `hintDisplayFor(facts, { accumulate })`. Default
  false, so gap 34's display is untouched for every existing caller. Accumulating mode
  returns each distinct suit and rank once, in first-clued order. `cluePulseColorFor`
  deliberately still reads the latest clue: the 2s pulse is about the clue that just
  landed.
- **`components/hanabi/HintIndicator.tsx`** — `accumulate` prop. One clued colour keeps
  the existing inset box-shadow ring exactly. Two or more draw a conic-gradient ring
  with hard stops (one arc per colour, oldest first, clockwise from the top), masked to
  the border band so gap 33's "no wash across the tile face" still holds. One faint
  suit glyph per colour, so colour is never the sole carrier.
- **Wiring** — `accumulate={keepHints}` flows HanabiBoard → OwnHand/TeammateHand →
  OwnHandCard/TeammateCard → indicator.

## Owner decision (2026-09-19)

Asked how multiple colour clues should read; chose the split ring. A rainbow tile
touched blue then red shows half blue / half red — which is how a rainbow is spotted.
With retention OFF nothing changes: latest clue only.

## Test contract changed

`e2e/hanabi-table-polish.spec.ts`'s gap-34 test asserted latest-only WITH keep-hints on
— the exact behaviour the owner asked to change. It now asserts that keep-hints ON
keeps both the ring and the numeral, then toggles keep-hints OFF in the same flow and
re-proves gap 34's latest-only display for the default mode. Gap 34 is re-scoped, not
reversed.

## Verification

- `vitest run --root apps/web`: 77 files, 1029 tests, all pass (13 new).
- Full `playwright test`: 72 specs. 69 passed; 3 failed on the known pre-existing
  "Create room stays disabled until hydration" flake under parallel load
  (`helpers.ts:27`), all 3 pass on re-run. Unrelated to hints.
- Visual check: `split-ring.png` — a rainbow tile clued red then yellow shows a
  half-red/half-yellow ring, both corner glyphs, and no fill over the tile face.

## Not deployed

Committed locally only.
