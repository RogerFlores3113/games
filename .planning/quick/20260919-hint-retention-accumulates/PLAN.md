---
quick_id: 20260919b
slug: hint-retention-accumulates
status: in-progress
created: 2026-09-19
---

# Quick task: retained hints accumulate instead of overwriting

**Owner report (2026-09-19):** "with hint retention on - a new hint for a tile overlays
the prior hint so information isn't well-retained. Not great!"

## Cause

`hintDisplayFor` (lib/hanabi-hint-logic.ts) reads ONLY the last entry of
`facts.positiveClues`. That is UAT gap 34 (sixth owner review, 2026-09-18), which
overturned D-06's accumulation: "telling a card 2 after it was earlier told blue now
shows the 2 alone".

Gap 34 was decided for the DEFAULT display, where hints clear as soon as the next
player acts — with that lifetime, showing only the newest clue is right. The keep-hints
toggle (D-05/HINT-03) extends a hint to the card's whole life in hand, and there
"newest only" actively destroys the retained information the toggle exists to provide.

So the fix is scoped to the toggle, not a re-reversal of gap 34.

## Decision (owner, 2026-09-19)

With retention ON a tile shows every clue it has received:
- colour channel: one ring arc per distinct clued colour, oldest first, clockwise from
  the top (a rainbow tile touched blue then red reads half blue / half red — this is
  precisely how a rainbow is spotted);
- one faint suit glyph per clued colour in the corner (colour is never the sole carrier);
- the numeral chip unchanged.

With retention OFF nothing changes: latest clue only, exactly as gap 34 set it.

## Scope

1. `lib/hanabi-hint-logic.ts`: `hintDisplayFor(facts, { accumulate })`, default
   `accumulate: false` (gap-34 behaviour preserved for every existing caller).
   Accumulating mode returns distinct suits/ranks in first-clued order.
   `cluePulseColorFor` keeps using the LATEST clue — the 2s pulse is about the clue
   that just landed, not the card's history.
2. `components/hanabi/HintIndicator.tsx`: `accumulate` prop; single colour keeps the
   current inset box-shadow ring byte-for-byte; 2+ colours draw a conic-gradient ring
   (masked so it paints no fill, per gap 33) and a glyph per colour.
3. Wire `accumulate={keepHints}` HanabiBoard → OwnHand/TeammateHand → cards → indicator.
4. Tests: existing gap-34 render contracts must pass untouched; new cases for
   accumulate=true (two colours, colour+rank together, dedupe, ordering).

## Constraints

- D-15 own-hand identity boundary: facts-only props, no suit/rank props, no glyph
  identity opt-in. `own-hand-source.test.ts` scans this file.
- D-07: still no negative/ruled-out clue information anywhere.
- No hex literals in HintIndicator.tsx (source-scanned) and none outside @theme in
  globals.css (comments included).
- Ring paints no fill across the tile face (gap 33).
