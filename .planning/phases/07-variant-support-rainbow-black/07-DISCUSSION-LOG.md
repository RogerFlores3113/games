# Phase 7: Variant Support (Rainbow, Black) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 07-variant-support-rainbow-black
**Mode:** `--auto`. Every choice below was auto-selected by Claude as the recommended option. No owner input was taken during this discussion.
**Areas discussed:** Engine nameable-colour check, Colour clue from a rainbow tile, Rainbow tile hint display, Rainbow distinguishability (UI-07), Black single copies and endgame, End-to-end proof strategy

`[--auto] Selected all gray areas: Engine nameable-colour check, Colour clue from a rainbow tile, Rainbow tile hint display, Rainbow distinguishability, Black single copies and endgame, End-to-end proof strategy.`

Pre-answered from prior phases (not re-asked): no ruled-out clue information (06.2 D-07, owner); no rank numerals on faces and the rainbow gradient art (06.1-07); popover shape (06.2 gap 16); board geometry and layout (06.2 gaps 1, 22, 23); latest-clue-only hint ring (06.2 gaps 32–35). No pending todos matched this phase.

---

## Engine nameable-colour check

Scout finding: `canClue` has no `cluableColors` check. A throwaway probe confirmed that in Rainbow, a colour clue with the value `"rainbow"` touches exactly the rainbow card. Because the colour predicate returns true for rainbow cards regardless of the colour named, a `"black"` clue in Rainbow does the same. The server would accept it from a crafted WebSocket frame.

| Option | Description | Selected |
|--------|-------------|----------|
| Check in `canClue` with a dedicated reason | Reject a colour not in `cluableColors` before the touch check; new reason threaded through rules, schema and worker | ✓ |
| Check in `canClue`, reuse `clue_touches_nothing` | Fewer files touched, but the reason is false in Rainbow, where the clue does touch a card | |
| Check in `isClueRequest` | Not possible: the guard has no state or variant to consult | |

**Choice:** `[auto] Engine — Q: "Where and how is a non-nameable colour rejected?" → Selected: "canClue, dedicated reason" (recommended default)`
**Notes:** Also fix the incorrect doc comment on `isClueRequest`, and add per-variant regression and property coverage.

---

## Colour clue from a rainbow tile

| Option | Description | Selected |
|--------|-------------|----------|
| Rainbow tile's colour slot becomes a row of the nameable colours | Five coloured labels on top, the bold number below. Each label sends an ordinary colour clue. Only rainbow tiles change | ✓ |
| Keep the colour button disabled (status quo) | Minimal, but it leaves legal clues ungivable. For example, "red" is unreachable when the only card it touches is the rainbow tile | |
| Show every colour on every tile | Uniform, but it bloats the popover for five of every six tiles and departs from the per-tile, two-button shape | |
| Restore a separate clue menu | The owner explicitly deleted it (gap 16) | |

**Choice:** `[auto] Rainbow clue — Q: "How does a player give a colour clue that touches a rainbow tile?" → Selected: "Row of nameable colours in the rainbow tile's popover" (recommended default)`
**Notes:** Under the status quo, a class of legal Rainbow clues is unreachable from the UI. The chosen option keeps the owner's shape (colour on top in the suit's hue, bold number below, one click sends) and uses the variant-agnostic test "is this tile's suit nameable?", not `suit === "rainbow"`. It is flagged for direct owner confirmation.

---

## Rainbow tile hint display

| Option | Description | Selected |
|--------|-------------|----------|
| Show the clue as given (red ring) | No change; faithful to "each hint shows only what that clue said" | ✓ |
| Add a "red or rainbow" marker | An inference layer, which the owner declined in D-07 ("let it go") | |
| Show a rainbow ring on colour-clued tiles in Rainbow | Wrong: it implies the tile is rainbow | |

**Choice:** `[auto] Hint display — Q: "Is a red ring on a rainbow tile touched by red misleading?" → Selected: "No; show the clue as given" (recommended default)`
**Notes:** In Rainbow, a red clue means "red or rainbow" to every player, exactly as in the physical game. The pulse colour follows the same rule.

---

## Rainbow distinguishability (UI-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on the existing gradient and unique silhouette; add automated checks | No new art; verify silhouette uniqueness and gradient rendering at every size | ✓ |
| Add an extra marker to rainbow tiles | Unneeded; the silhouette already satisfies the colourblind rule | |

**Choice:** `[auto] UI-07 — Q: "What makes a rainbow tile unambiguous?" → Selected: "Existing gradient + 20-spike silhouette, with verification" (recommended default)`

---

## Black single copies and endgame

| Option | Description | Selected |
|--------|-------------|----------|
| No special UI; standard end conditions | No critical-card or unreachable-score indicators, in keeping with success criterion 3 | ✓ |
| Warn on discarding a last copy | Special-casing and assistance beyond the physical game | |
| End the game early when the max score becomes unreachable | A rule change; out of scope | |

**Choice:** `[auto] Black — Q: "Does Black's single-copy suit need any UI or endgame treatment?" → Selected: "None" (recommended default)`
**Notes:** Black's art is kept as approved. Its silver hue sits close to White's, so this is flagged for the owner.

---

## End-to-end proof strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Engine full games per variant per end condition, plus a parametrized e2e full game plus a Rainbow clue e2e | Covers correctness deterministically and the real UI end to end | ✓ |
| E2E only | Random deals make end conditions and rainbow tiles non-deterministic | |
| Engine only | Does not prove the UI handles all three variants | |

**Choice:** `[auto] E2E — Q: "How is success criterion 3 proven?" → Selected: "Engine + parametrized e2e + Rainbow clue e2e" (recommended default)`
**Notes:** Hard constraint: no seed or deck override reachable in production (WR-07). The mechanism for getting a rainbow tile into the e2e test is left to Claude's discretion.

---

## Claude's Discretion

- The rainbow colour row's exact layout, and popover clamping at the hand edges.
- The new legality reason's name and its position within `canClue`.
- Whether the non-nameable-colour guarantee is a new property test or an extension of an existing one.
- How the Rainbow e2e obtains a rainbow tile (a dev-only var or retry), within the no-production-seed constraint.

## Deferred Ideas

- An in-game variant label or rules reminder (flagged to the owner).
- Variant descriptions in the lobby picker.
- Critical-card, last-copy or unreachable-score indicators.
- A clue-touch preview before sending.
- The `packages/schema` guard-versus-zod consistency cleanup (carried forward from 06.2).
