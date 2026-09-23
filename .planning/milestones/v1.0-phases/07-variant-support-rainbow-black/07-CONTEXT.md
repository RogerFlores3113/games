# Phase 7: Variant Support (Rainbow, Black) - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable and prove the Rainbow and Black variants end to end on the engine and UI that already exist. The work is mostly tests, plus two genuine gaps the scout found:

1. **An engine hole (RULES-14).** `canClue` does not check that a colour clue names one of the variant's `cluableColors`. In Rainbow, a clue naming `"rainbow"` (or `"black"`) passes the zod-free `isClueRequest` guard, touches exactly the rainbow cards, and is accepted as legal. The UI never sends it, but a hand-crafted WebSocket frame can, so today the server does let a player name "rainbow" as a colour. Verified by a throwaway probe: `cardsTouchedByClue(variantConfig("rainbow"), [rainbow 1, red 1], {type:"color", value:"rainbow"})` returns `["a"]`, the rainbow card alone.
2. **A UI gap (RULES-14 / success criterion 1).** The 06.2 quick-clue popover builds its colour clue from the clicked tile's own suit, and disables it for a rainbow tile. So in Rainbow, a colour clue whose only touched card is a rainbow tile can't be given from the UI at all. Example: a target hand of rainbow 1, blue 3, blue 4, green 2. The clues "red", "yellow" and "white" are legal, since each touches the rainbow 1, but no tile's popover offers them. Base and Black have no such gap, because there every legal colour clue touches a tile of that exact suit, and that tile's popover offers it.

Everything else is already parametrized, and this phase proves it rather than rebuilding it. That covers deck composition (60 cards for Rainbow, 55 for Black), suit count, max score (30), the six-column board (`MAX_SUITS = 6`), the end overlay's `/ maxScore`, clue-touch predicates, clue-fact narrowing, and the rainbow gradient art.

**In scope:** the `canClue` nameable-colour check; letting a player give any nameable colour clue from a rainbow tile; UI-07 verification of rainbow distinguishability; full-game-and-score coverage in base, Rainbow and Black, at both the engine and e2e levels.

**Not in scope:** any new variant, any rule change, a variant label or explainer on the board, critical-card or "last copy" warnings, and any restyling of the approved art.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode. Every decision below was **auto-selected by Claude** as the recommended default. The owner has not answered any of them directly. Each is a starting position for planning and comes back up at this phase's owner sign-off.

### Engine: nameable colours (RULES-14)
- **D-01 (auto-selected by Claude):** `canClue` rejects any colour clue whose value is not in `variantConfig(state.variant).cluableColors`, before the touch check. This closes the server-side hole: in Rainbow, naming "rainbow" (or "black") is illegal, even though the touch predicate would otherwise return the rainbow cards. In base, naming "rainbow" or "black" was already rejected, but only incidentally, as `clue_touches_nothing`. It now fails for the right reason.
- **D-02 (auto-selected by Claude):** The rejection gets its own legality reason (working name `clue_color_not_nameable`). It is plumbed through `packages/rules/src/adapter.ts`'s reason union, `packages/schema/src/messages.ts`'s reason enum and `apps/worker/src/room-state.ts`'s `mapAdapterError`, following the path `clue_touches_nothing` already takes. It is not folded into `clue_touches_nothing`, which would be wrong in Rainbow, where the clue does touch something. The UI never reaches this path, so no user-facing copy is needed.
- **D-03 (auto-selected by Claude):** `isClueRequest` stays variant-agnostic, since it has no state to consult. Its doc comment claiming that a non-nameable colour "touches zero cards and is rejected with `clue_touches_nothing`" is false for Rainbow and must be corrected to point at the new `canClue` check.
- **D-04 (auto-selected by Claude):** Regression tests prove, for each of the three variants, that every colour outside `cluableColors` is rejected by `canClue` and by `applyHanabiAction` through the adapter. A property test, or an extension of `variant-matrix.test.ts`, asserts that no accepted clue anywhere ever carries a non-nameable colour value.

### Giving a colour clue that touches a rainbow tile (the known gray area)
- **D-05 (auto-selected by Claude):** Clicking a **rainbow** tile in an opponent's hand opens the same quick-clue popover, but the colour slot becomes a **compact row of the variant's nameable colours**: red, yellow, green, blue and white, in `cluableColors` order. Each label is rendered in that suit's own `--color-suit-*` hue, exactly as the single colour button is today. The number button stays below in bold, unchanged. Each colour entry sends an ordinary colour clue for that colour, which by the engine's rule touches the rainbow tile plus any tiles of the named suit.
  - Why: it is the only option that makes every legal Rainbow clue reachable. The status quo (a disabled colour button) leaves some legal clues ungivable (see domain item 2). It keeps the owner's specified shape (colour on top in the suit's colour, bold number below, one click sends), and changes only the rainbow tile's popover.
  - Rejected: showing every colour on every tile, which bloats the popover for the 5/6 of tiles that don't need it and departs from "the clues this tile supports". Also rejected: a separate "colour clue" menu anywhere else, since the owner explicitly removed the large clue menu (gap 16).
- **D-06 (auto-selected by Claude):** Non-rainbow tiles keep the single colour button exactly as today. In Rainbow, a red tile's "Red" clue also touches any rainbow tiles in that hand. That is correct engine behaviour and needs no UI special-casing or preview.
- **D-07 (auto-selected by Claude):** Every entry in the rainbow tile's colour row shares the same disabled gate as the rank button (game ended, reconnecting, not your turn, no clue tokens), via `disabledReasonFor`. No entry is ever individually disabled, because each nameable colour always touches the clicked rainbow tile. No disabled-reason text is shown, per gap 15.
- **D-08 (auto-selected by Claude):** In Black, "Black" is a nameable colour, so a black tile's popover shows a single "Black" colour button like any other suit. No change is needed. This confirms the 03-RESEARCH resolved question that Black is colour-cluable.

### Hint display on a rainbow tile
- **D-09 (auto-selected by Claude):** A rainbow tile touched by a red clue shows a **red ring** with the red silhouette, which is exactly what the clue said. No change to `hintDisplayFor` or `HintIndicator`. The hint display records the clue as given. It is not an inference about the card, and the owner's rules support that: gap 34 ("each hint shows only what that clue said") and D-07 ("let it go", no derived or ruled-out information). In Rainbow, "red" means "red or rainbow" for every player at the table, just as the physical game's clue does, so the ring is not misleading. Adding a "might be rainbow" marker would be exactly the inference layer the owner declined.
- **D-10 (auto-selected by Claude):** The 2-second clue pulse (`cluePulseColorFor`) follows the same rule and pulses in the clue's colour, which it already does. On a teammate's tile the viewer can already see the rainbow face, so there's no ambiguity there.

### Rainbow distinguishability (UI-07)
- **D-11 (auto-selected by Claude):** The rainbow tile's identity rests on two channels that already exist: the multicolour gradient fill (owner-approved in 06.1-07) and its unique 20-spike burst silhouette (06.1 D-08, colourblind-safe). No new art. Verification adds an automated check that rainbow's `glyphPath` differs from every other suit's, and that `SuitGlyph` renders the gradient `url(#…)` fill for rainbow, plus an e2e or render check that a rainbow face renders the gradient at every size it appears: teammate tile, played-stack slot, compact discard, discard overlay.
- **D-12 (auto-selected by Claude):** Rainbow's hue must stay visually distinct from `--color-turn`. Gap 38 already guaranteed this. The phase adds nothing and only confirms it holds on a live Rainbow board at owner UAT.

### Black: single copies, criticality and endgame
- **D-13 (auto-selected by Claude):** No critical-card, "last copy" or "max score now unreachable" indicator for Black, or for any suit. Base has none, the physical game has none, and adding one only for Black would be the special-casing success criterion 3 forbids. Black's unforgiving single copies are the variant's intended challenge.
- **D-14 (auto-selected by Claude):** The end condition is unchanged: the game ends on 3 fuses, a full 30-point board, or the final round after the deck empties. There is no early "no longer winnable" end in any variant.
- **D-15 (auto-selected by Claude):** Black's art is kept as approved in 06.1: silver `#B7C2D6` with a double-ring burst. See "Ask the owner" in the specifics, since it sits close to White (`#E7ECF7`) in hue. Silhouettes differ, so the colourblind rule holds.

### End-to-end proof (success criterion 3)
- **D-16 (auto-selected by Claude):** Engine level. `variant-matrix.test.ts` already plays a deterministic full game per variant. Extend it, or add a sibling test, so that each variant reaches **each** end condition (fuse-out, deck-exhaustion final round, and a perfect 30 or 25 score through a constructed state), and asserts `score`, `maxScoreFor` and `scoreBand` agree.
- **D-17 (auto-selected by Claude):** E2E level. Parametrize the existing UI-10 full-game test (`e2e/start-game.spec.ts`, which uses `playUntilGameEnds`) over `base`, `rainbow` and `black`. Assert that the end overlay reads `/ 25`, `/ 30` and `/ 30` respectively, that the final score equals the number of tiles on the played stacks, and that the board rendered six columns for the box variants. Same test body with no per-variant branches, beyond the expected-numbers table.
- **D-18 (auto-selected by Claude):** A Rainbow e2e covers RULES-14 through the real UI. It clicks a rainbow tile in a teammate's hand, picks a colour from the row, and asserts that the rainbow tile and every tile of the named suit get that colour's ring on the receiver's own hand. It also asserts that no popover anywhere offers a "Rainbow" colour option. Because deals are random, how the test obtains a teammate's rainbow tile is left to Claude's discretion, within one hard constraint: **no seed or deck override reachable in production** (WR-07 keeps the seed secret). Acceptable routes are a dev-only wrangler var gated like `SOCKET_STALE_MS` or `ZOMBIE_SWEEP_INTERVAL_MS`, or more seats plus retrying room creation until a rainbow tile is visible.

### Claude's Discretion
- The exact layout of the rainbow tile's colour row: horizontal row or a 3+2 wrap, label text or short names, spacing. It must keep the popover an absolute overlay that never changes board geometry (gap 1) and stay inside the 1280x720 floor at the hand edges. If a full-name row is too wide, clamp or flip the popover's horizontal anchor rather than shrinking the text below the `--text-label` token.
- The legality reason's final name and where the check sits inside `canClue`, before or after the turn and token checks. Either is fine as long as it runs before the touch check.
- Whether the "no non-nameable colour" guarantee is a new property test or an extension of an existing one.
- The mechanism in D-18, within its constraint.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 7: Variant Support (Rainbow, Black)": goal and the three success criteria.
- `.planning/REQUIREMENTS.md`: RULES-14 (rainbow touched by every colour, never nameable), UI-07 (rainbow unambiguous), plus the completed RULES-02 (deck per variant), RULES-03 (derived suit count) and ROOM-05 (variant chosen at creation) that this phase proves end to end. UI-08 is superseded (luminosity removed, 06.2 gap 35), so do not revive it for Rainbow.
- `.planning/PROJECT.md`: box variants only; server-authoritative per-seat filtering; the Rainbow and Black rules summary under "Rules surface".

### The owner's binding decisions (do not reopen)
- `.planning/phases/06.2-board-redesign-hint-display-tile-styling-board-layout-tokens/06.2-HUMAN-UAT.md`: all seven review rounds. Especially gap 1 (fixed geometry), gap 15 (no disabled-reason text), gap 16 (quick-clue popover shape: colour on top in the suit's colour, bold number below), gap 23 (blank play area), gaps 32–35 (hint ring in the clue's colour, latest clue only, no wash, no luminosity) and gap 38 (turn violet distinct from rainbow lavender).
- `.planning/phases/06.2-board-redesign-hint-display-tile-styling-board-layout-tokens/06.2-CONTEXT.md`: D-07 (no ruled-out information, owner-confirmed); D-04 (colour is never the sole carrier).
- `.planning/phases/06.1-table-polish-firework-art-notes-drag-audio/06.1-07-SUMMARY.md`: art overrides. No rank numerals on faces; rainbow is a multicolour gradient.
- `.planning/phases/06.1-table-polish-firework-art-notes-drag-audio/06.1-CONTEXT.md`: D-08 (each suit's burst silhouette distinct with colour ignored; rainbow stands alone without its fill).
- `.planning/phases/06-game-interface/06-CONTEXT.md`: D-06 (all seven suits' visuals designed up front so Phase 7 is testing, not designing).

### Engine: where the rules live
- `packages/rules/src/hanabi/variant.ts`: `VariantConfig`, `cluableColors`, `colorClueTouches` (rainbow touched by every colour), `rankCountsFor` (Black single copies), `maxScoreFor`.
- `packages/rules/src/hanabi/legality.ts`: `canClue` (**missing the nameable-colour check, D-01**) and `cardsTouchedByClue`.
- `packages/rules/src/hanabi/actions.ts`: `isClueRequest` and `isClueValueValid` (accept any of the 7 suits; the doc comment near line 90 is wrong for Rainbow, D-03).
- `packages/rules/src/hanabi/clue-facts.ts`: candidate narrowing through the touch predicate (already correct for Rainbow).
- `packages/rules/src/hanabi/endgame.ts`: `scoreBand` and end detection parametrized by `maxScoreFor`.
- `packages/rules/src/adapter.ts`, `packages/schema/src/messages.ts`, `apps/worker/src/room-state.ts` (`mapAdapterError`): the three places a new legality reason must be threaded (D-02).
- `packages/rules/src/hanabi/variant-matrix.test.ts`, `legality.test.ts`, `actions.test.ts`, `variant.test.ts`, `test-support.ts` (`enumerateLegalActions` only ever uses `cluableColors`, which is why no test caught the hole).

### UI: where the variant surfaces
- `apps/web/components/hanabi/CluePopover.tsx`: the two-button popover (D-05 changes its colour slot for rainbow tiles only).
- `apps/web/components/hanabi/TeammateCard.tsx`: `colorNameable` and `colorDisabled`, and the popover wiring. Its comment near line 89 documents today's disabled-rainbow behaviour.
- `apps/web/lib/hanabi-board-logic.ts`: `cluableColorsForView`, `disabledReasonFor`.
- `apps/web/lib/hanabi-hint-logic.ts` and `apps/web/components/hanabi/HintIndicator.tsx`: latest-clue-only ring (unchanged by D-09).
- `apps/web/lib/suit-visuals.ts`, `apps/web/components/hanabi/SuitGlyph.tsx` (`RAINBOW_GRADIENT_STOPS`), `apps/web/components/hanabi/FireworkCard.tsx`: rainbow and black art (D-11, D-15).
- `apps/web/app/globals.css`: `--color-suit-*` tokens and `--color-turn`. No new hex outside `@theme`.
- `apps/web/components/hanabi/EndOverlay.tsx`: `Final score: n / maxScore`.
- `apps/web/lib/layout-budget.ts`: `MAX_SUITS = 6`, the geometry the popover must not disturb.

### E2E
- `e2e/helpers.ts`: `createRoom({variant})`, `startGameWithPlayers(..., {variant})`, `openTileCluePopover`, `giveAnyLegalClue` (falls back to the rank clue when a rainbow tile's colour button is disabled; update once D-05 lands), `playUntilGameEnds`.
- `e2e/start-game.spec.ts`: UI-10 full-game test (to parametrize, D-17); the UI-11 worst case already runs Black with 5 seats.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `variantConfig(variant).cluableColors`: the single source for both the server-side check (D-01) and the rainbow tile's colour row (D-05, via `cluableColorsForView`).
- `SUIT_VISUALS[suit].hueVar` and `.label`: exactly what each colour-row entry renders, the same as today's single colour button.
- `disabledReasonFor(game, {kind:"clue", …}, ctx)`: the shared gate for every popover button (D-07).
- `variant-matrix.test.ts` and `test-support.ts`'s `enumerateLegalActions` / `currentActorSeatId`: the deterministic full-game harness to extend (D-16).
- `playUntilGameEnds` and `startGameWithPlayers` with a `variant` option: the e2e harness to parametrize (D-17).

### Established Patterns
- **Variant parametrization is centralized.** Only `variant.ts` declares suits, rank counts or deck sizes. Any fix reads `VariantConfig` and never branches on `variant === "rainbow"` outside it. `TeammateCard`'s "is this tile's suit nameable?" check (`cluableColorsForView(game).includes(card.suit)`) is the variant-agnostic way to detect "show the colour row", so write it that way rather than as `suit === "rainbow"`.
- **Hand-rolled exact-key guards** in `actions.ts` validate request shape. Variant-dependent legality belongs in `legality.ts`, which has state.
- **Legality reasons are a closed union** threaded through rules, schema and worker, with exhaustive switches. Adding one breaks compilation until all three sites are updated, which is the desired safety.
- **The popover is an absolute overlay** anchored to the tile's `position: relative` wrapper, and never affects board geometry. The outside-click listener matches clicks via `data-clue-tile`, so any new colour-row buttons must live inside that wrapper.
- **Tiles vocabulary, no disabled-reason text, no obtrusive labels** (owner, 06.2).
- **Own-hand identity boundary.** `own-hand-source.test.ts` and `own-hand-render.test.ts` guard own-hand files. D-05 touches only teammate-tile code, but any new shared helper imported by own-hand components must stay facts-only.

### Integration Points
- `legality.ts` `canClue` → reached through `applyHanabiAction` → worker `applyGameAction` → `mapAdapterError` → wire refusal.
- `TeammateCard.tsx` computes the popover props, `CluePopover.tsx` renders them, and `onGiveClue` → `HanabiBoard.tsx` `act()` dispatches `{type:"clue", targetSeatId, clue:{type:"color", value}}`.
- `e2e/helpers.ts` `giveAnyLegalClue` and `openTileCluePopover` must learn the rainbow tile's multi-colour row, or a Rainbow game driven through the helpers will never give a colour clue from a rainbow tile.

</code_context>

<specifics>
## Specific Ideas

- The owner's popover spec, verbatim (06.2 gap 16): "the number or the color, with the color having font text that's colored in the same color, and the number being a bold, always below the color hint." D-05 keeps this for rainbow tiles too. The colour hint just offers more than one colour.
- The owner's minimalism signals across seven review rounds: fixed geometry, no disabled-reason text, no "X left" text, no empty-state text, a blank play area, hints showing only what the clue said. Any Phase 7 UI addition should be the smallest change that makes a legal action reachable, and nothing decorative.

### Ask the owner directly at sign-off (not auto-decidable with confidence)
1. **The rainbow tile's colour row (D-05).** Is a row of five coloured names in the popover acceptable, or would they rather the rainbow tile keep a single, disabled colour button and give such clues some other way?
2. **Black vs White legibility (D-15).** The Black suit renders as light silver (`#B7C2D6`), close to White (`#E7ECF7`). Silhouettes differ, but at play-stack size the two may read alike, and a suit called "Black" drawn in near-white may surprise players. Keep it, or darken Black? Any change must stay legible on the dark walnut board.
3. **No in-game variant indicator.** Nothing on the board says "Rainbow" or "Black" once the game starts, and the play area is blank at rest (gap 23), so the sixth column isn't visible until a tile is played. Do they want a small variant name somewhere, such as the turn-sign area? Deferred by default.

</specifics>

<deferred>
## Deferred Ideas

- **In-game variant label or rules reminder** (for example "Rainbow: every colour clue touches rainbow tiles") on the board or in the settings modal. This is a new UI element. Ask the owner (specifics, question 3).
- **Variant descriptions in the lobby's variant picker.** Today it shows bare "Rainbow" and "Black" labels. A one-line explainer would help new players, but that is a lobby change outside this phase's criteria.
- **Critical-card, last-copy or unreachable-max-score indicators**, for Black or generally. Assistance beyond the physical game; not requested.
- **A clue-touch preview** (highlight which tiles a colour would touch before sending). Not requested, and it conflicts with the direct one-click popover.
- **The `packages/schema` hand-rolled-guard versus zod inconsistency** for actions, carried forward from 06.2's deferred list. D-02's new reason touches the schema enum but does not resolve it.

</deferred>

---

*Phase: 07-variant-support-rainbow-black*
*Context gathered: 2026-09-18*

## Owner answers (2026-09-18) — these override the auto-selected defaults above

The three questions this draft flagged for the owner were asked directly before planning:

1. **Rainbow tile popover:** "Row of the 5 colours" — CONFIRMED. D-05..D-08 stand as written: a rainbow tile's popover shows the five nameable colours as a compact row, each in its own colour, with the bold number below. Owner-approved, not an auto default.
2. **Black suit colour:** "Keep the silver" — keep `--color-suit-black` (#B7C2D6) and the existing Black art unchanged. Do not redraw Black.
3. **Variant label on the board:** "No label" — do not add a variant indicator. Stays deferred.

