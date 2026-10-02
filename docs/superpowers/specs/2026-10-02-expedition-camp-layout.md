# Expedition camp scene: layout and legibility

Owner review of the Phase 12 placeholder scene (2026-10-02) found two problems:

1. It was not clear what to do from the UI alone. Placeholder shapes carried meaning
   that only final art could convey, and nothing said what action was expected.
2. Elements covered each other. The opponent's sign sat on its name plate. Gear
   tooltips, gear chips and the targeting box sat on the hand. The seat card-back
   counter clipped its own number.

This spec fixes both. It keeps the 640x360 stage and whole-number zoom (D-09/D-10).
Owner-sized viewports put 640x360 at 2x on a 1080p monitor and most laptops, whereas
a larger stage would drop most players to 1x.

## Rules the layout obeys

- **Every zone is a rectangle in one table** (`ZONES` in `layout.ts`). A unit test
  asserts that no two zones intersect and that every zone sits inside the stage and
  outside the settings safe zone. Draw code places things inside its zone only.
- **Text never relies on art.** Every HUD value and every interactable has a text
  label next to it, even once final art lands. Art makes it pretty. Text makes it
  legible.
- **One prompt line always says what to do.** The model carries a `prompt` built by a
  pure function from the view (see below). It is the most prominent text on screen.
- **Tooltips never cover the thing you are deciding about.** Gear and objective
  tooltips render in the tooltip zone above the hand, not on top of it.

## Zones (stage px, 640x360)

| Zone | Rect (x, y, w, h) | Contents |
|---|---|---|
| `topBar` | 0, 0, 576, 22 | Left: supplies (crate icons + "Supplies 3"). Centre: "Camp 2 of 6". Right of centre: boss twist name when active ("Boss: Monsoon"). Stops short of the settings safe zone |
| `prompt` | 96, 24, 448, 16 | The prompt line, centred, on a dark plate. Turn-colour accent when it is your move |
| `opponents` | 8, 42, 568, 70 | Opponent seat blocks across the top, in turn order left to right. Up to 4 blocks, each 138 wide with 4px gaps. Stops short of the settings safe zone (584, 0, 56, 56) |
| `stump` | 136, 116, 368, 128 | The oval table. Trick cards, led marker, and during objective-pick the face-up objective pool |
| `lastTrick` | 512, 150, 120, 60 | "Last trick" pile and its hover fan. Fan opens leftwards over the stump edge, never over the hand |
| `world` | 8, 116, 120, 128 | Campfire and fireflies with their labels |
| `tooltip` | 120, 248, 400, 24 | Gear rules text, objective detail, "why not usable" reasons |
| `you` | 8, 276, 108, 80 | Your name, tricks won, your objectives (mini cards) and your gear chips, each row labelled |
| `hand` | 120, 276, 400, 80 | Your hand. Hover lift stays inside the zone (cards sit low enough for the lift) |
| `actions` | 524, 276, 108, 80 | Whisper button, Confirm / Cancel, pre-deal Use / Skip, mascot |

The `hand` zone is 400 wide. Eighteen 28px cards fit with a 21px step (28 + 17 x 21 =
385), so each card shows its full rank and suit index. The fan is centred in the zone.

## Opponent seat block (138 x 70)

Rows, top to bottom, all left-aligned inside the block with 4px padding:

1. Name plate: name (truncate at 14 chars), leader star if leader, turn glow on the
   plate when they may act, "away" tag when disconnected.
2. Counts: card-back icon plus "18 cards", trick-pile icon plus "2 tricks".
3. Objectives: mini cards (14x20) with a status badge (pending, done tick, failed
   cross) and an order badge when ordered. Kind shown as a one-word tag for
   `no-tricks` / `exactly-n`.
4. Gear: chips with the gear name. A spent chip dims. Reveals and whisper tags
   appear as small badges on the name plate row, not as a separate floating row.

Nothing in a seat block draws outside its 138x70 rectangle.

## The prompt

`prompt: { text: string; tone: "your-move" | "waiting" | "info" | "alert" }` on
`SceneModel`, built by a pure `buildPrompt(view, localUi)` in
`apps/web/lib/expedition/` and covered by a table-driven unit test. It reads only
fields the view already has. It never recomputes legality.

| Situation | Text |
|---|---|
| Pre-deal, you have pre-deal gear pending | "Before the deal: use Rain Poncho or skip" |
| Pre-deal, waiting | "Waiting for Ana to decide on pre-deal gear" |
| Objective pick, your pick | "Your pick: click an objective on the table" |
| Objective pick, waiting | "Ana is picking an objective" |
| Thick Fog objectives | "Thick Fog: objectives were dealt face down" |
| Your lead, between tricks | "Your lead: play any card, or Whisper first" |
| Your turn to follow, must follow | "Your turn: follow ♥ (highlighted cards)" |
| Your turn, can't follow | "Your turn: you have no ♥, play any card" |
| Waiting on a teammate | "Ana is playing" |
| Targeting, next target needed | "Spyglass: choose a teammate" / "Whisper: choose a card to share" |
| Targeting, ready to confirm | "Whisper 7♥ to Ana? Confirm or Cancel" |
| Camp succeeded / failed | "Camp cleared!" / "Camp failed: 7♥ was won by Bo" |
| Reconnecting | "Reconnecting…" |

Exact wording is the implementer's call within these shapes. Keep each under 56
characters so it fits the prompt zone in the 8px label font.

## Labels for things that used to be bare shapes

- Supplies: crates plus "Supplies N".
- Camp: "Camp N of 6", and "Boss camp" on camps 3 and 6.
- Face-up objectives during pick: a "Objectives" caption on the stump, mini cards
  with their card label and status.
- Last trick: caption "Last trick" under the pile.
- Whisper: a button reading "Whisper", disabled state reads "Whisper used".
- Interactables keep their hover-only name labels (fun, not instructions).

## Test bridge and audits

The tour harness (`npm run tour:expedition`) screenshots every phase and runs the
layout audit. The layout is done when the audit reports zero violations at 1920x1080
and 1280x720 for every phase, and the screenshots read correctly.
