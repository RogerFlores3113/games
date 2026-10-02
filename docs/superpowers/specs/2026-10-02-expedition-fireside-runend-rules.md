# Expedition: fireside, run end and rules reference (Phase 13)

Builds on the camp layout spec (`2026-10-02-expedition-camp-layout.md`). Same stage
(640x360), same rules: zones in one table, a prompt line that always says what to do,
text labels on everything, tooltips in their own zone.

## Scene keys

`SceneKey` becomes `"camp" | "fireside" | "run-end"`. `sceneKeyFor(view)`:

- `runPhase === "ended"` gives `run-end`.
- `runPhase === "fireside"` gives `fireside`.
- Otherwise `camp`.

`BetweenCampsScene` is replaced by `FiresideScene`. The D-01 stub is deleted, not kept
alongside.

## Fireside scene

Model: `FiresideModel`, built by a pure `buildFiresideModel(view, roomSeats, localUi)`
(the existing `between-camps-model.ts` renamed and extended).

| Zone | Rect | Contents |
|---|---|---|
| `topBar` | 0, 0, 576, 22 | Supplies, "Camp N of 6" (the camp about to start), boss preview on camps 3 and 6 ("Boss ahead: Monsoon" once revealed, else "Boss camp ahead") |
| `prompt` | 96, 24, 448, 16 | "Pick one gear to take with you", "Pack your backpack, then Ready", "Waiting for Ana and Bo" |
| `trail` | 16, 44, 608, 64 | The trail map: six camp markers along a winding path to the temple. Cleared camps show a flag, the next camp glows, boss camps 3 and 6 carry a skull-free boss marker (a storm cloud). Camp numbers labelled under each marker |
| `draft` | 16, 116, 384, 120 | Three offered gear items laid by the fire, each a 32x32 icon over its name and size pips. Hover shows rules text in the tooltip zone. Click to take it. Hidden once you've drafted (it shows "Taken: Spyglass") |
| `crew` | 408, 116, 216, 120 | One row per seat: name, ready tick or "packing…", "drafting…", equipped gear icons (public loadout) |
| `tooltip` | 16, 240, 608, 24 | Gear rules text for the hovered item |
| `backpack` | 16, 268, 448, 88 | The backpack: capacity shown as slot boxes ("Capacity 3"). Owned gear below as icons. Click an owned item to pack or unpack it. Packed items fill slots by their size. Items that don't fit dim, with the reason on hover |
| `ready` | 472, 268, 152, 88 | The Ready button (large), "Ready ✓" once ready. Ready stays disabled while you still have a draft pick to make |

The last camp result shows in the prompt on arrival: "Camp 2 cleared! Pick one gear"
or "Camp 2 failed: −1 supply. Try again". The trail marker for a failed attempt stays
on the same camp.

## Run-end scene

Model: `RunEndModel { outcome: "won" | "lost"; campReached: number; supplies: number;
history: { campNumber; attempts; cleared }[]; isHost: boolean }`.

- Won: the temple at dawn, "The expedition reached the temple!", then "Cleared all 6
  camps with N supplies left".
- Lost: the trail at dusk, "The expedition turned back at camp N", then "Out of
  supplies".
- A per-camp strip: six markers, each showing attempts ("Camp 4: 2 tries").
- Host sees a "New expedition" button. It calls the same `onRestartLobby` the
  settings modal's Restart uses (`restart_lobby`, back to the lobby with seats kept),
  passed to the scene through the store. Others see "Waiting for the host to start a
  new expedition". "Leave table" links home.

## Rules reference

An HTML modal, not canvas text. Long-form reading wants real typography, wrapping
and scrolling, which the 8px pixel font can't give. A "Rules" button (book icon)
sits next to the settings gear, top right, with `aria-label="Rules"`. It is
available in every scene.

Sections:

1. **Goal.** Clear 6 camps. A camp is cleared when every objective is done. A failed
   camp costs a supply and is replayed. Run out of supplies and the run ends.
2. **Tricks.** Follow the led suit if you can. The Sun beats everything, the Moon
   beats everything but the Sun. Otherwise the highest card of the led suit wins.
   The winner leads next. Whoever holds the Sun leads the first trick and picks the
   first objective.
3. **Objectives.** What each marker means: a card (win the trick containing it), an
   order badge (①② must happen in order, "last" means the final trick), "No tricks",
   "Exactly N tricks".
4. **The Whisper.** Once per camp, between tricks, show one card from your hand to
   one teammate.
5. **Gear.** Capacity equals the camp number. Each item is usable once per camp in
   its window. The modal lists the gear you own with its rules text.
6. **This camp.** The current boss twist (name and effect) when one is active,
   otherwise "No boss twist this camp".

Content comes from the existing display catalogues (`GEAR_DISPLAY`, `BOSS_DISPLAY`)
and the view. Nothing is hardcoded that the catalogues already carry.
