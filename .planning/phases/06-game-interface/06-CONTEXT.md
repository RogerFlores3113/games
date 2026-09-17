# Phase 6: Game Interface - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning
**Mode:** `--auto` — every decision below was auto-selected as the recommended option (see `06-DISCUSSION-LOG.md`). The owner has not yet reviewed them; treat them as strong defaults, not owner-confirmed choices.

<domain>
## Phase Boundary

Replace Phase 4's deliberately plain interim board (`apps/web/components/HanabiBoard.tsx`, D-11 there) wholesale with the designed Hanabi table, rendered from the existing `HanabiView` wire contract: an always-visible tableau (clue/fuse tokens, deck, discard, stacks), an unmistakable active player, face-up teammate hands and a face-down own hand, persistent positive/negative clue memory as the product's only memory aid, an always-on non-colour suit identifier, card luminosity as a hue-independent clue signal, a dark "fireworks night" treatment, visibly disabled illegal actions (RULES-11), and a designed end-of-game screen. Desktop browser only (UI-11).

**Not in this phase:** proving Rainbow/Black end to end (Phase 7 — RULES-14, UI-07), mobile/touch layout (MOB-01/02, v2), clue log / history UI (QOL-01, v2), sounds (QOL-02), player notes (out of scope), empathy/auto-inference (out of scope), rematch.

**Wire contract is frozen for this phase.** Everything needed is already in `HanabiView` (`packages/rules/src/hanabi/state.ts`): per-card `facts.possibleSuits/possibleRanks/positiveClues/negativeClues`, `history` (for "what just happened" emphasis only, never a log panel), `finalTurnsRemaining`, `score`. No server, schema, or redaction change is expected; if one proves necessary it must go through the existing chokepoints and leak tests, not around them.

</domain>

<decisions>
## Implementation Decisions

### Table layout (UI-01, UI-02, UI-03, UI-11)
- **D-01:** Fixed three-band desktop layout, no scrolling at ≥1280×720 for 5 players: **teammate hands across the top** (in turn order starting after the viewer), **central tableau** in the middle (stacks, clue tokens, fuses, deck count + final-round counter, discard pile), **own hand along the bottom**. Nothing in UI-01's list is behind a menu, drawer, tab, or hover. Must remain usable (may scroll) down to ~1024px wide.
- **D-02:** Active player is marked **three redundant ways**: an accent ring/glow on that seat's hand container, the seat name in the turn indicator, and, when it is the viewer's turn, a prominent "Your turn" state on the own-hand band. The accent token's reserved-uses list already includes the active-turn indicator — Phase 6 reuses it there (and for the own-seat "you" marker and focus rings), not for anything new.
- **D-03:** Phase 5's per-seat connected/disconnected status and the "Waiting for X — disconnected" turn text (05 D-07) are **restyled, not removed**; `ReconnectingBanner` stays. The `data-testid`s the Phase 4/5 Playwright specs rely on are preserved or the specs are updated in the same change.
- **D-04:** The final round is visible: when `finalTurnsRemaining !== null`, the deck area shows "Final round — N turns left" instead of a bare 0.

### Suit identity system (UI-06, groundwork for UI-07)
- **D-05:** Every suit gets a **unique glyph (distinct silhouette shape) plus its hue**. The glyph appears on **every** rendered suit reference: face-up cards, stack heads, discard pile entries, colour-clue buttons, positive/negative clue marks, and own-hand candidate displays. Hue is never the only carrier of suit identity. No toggle, no accessibility mode.
- **D-06:** The glyph set and suit hues are defined **for all seven suits now** (red, yellow, green, blue, white, rainbow, black) in one module, even though Phase 7 proves Rainbow/Black — so Phase 7 is testing, not designing. Rainbow's glyph must stand alone without relying on a multicolour fill.
- **D-07:** Glyphs are **inline SVG components** in the repo (no icon font, no new dependency; `lucide-react` may be used for UI chrome but not as the suit glyph source, since its shapes aren't designed as a distinguishable set). Suit hues are added as **new `@theme` tokens** in `apps/web/app/globals.css` (e.g. `--color-suit-red`), respecting that file's rule of no hex outside the `@theme` block and no redefinition of existing tokens.

### Luminosity as signal (UI-08, UI-09)
- **D-08:** Luminosity encodes **how much clue information a card carries**, derived from `facts` alone, in **three discrete steps** (not a continuous gradient, so it is legible at a glance):
  1. **Unclued** — no positive clues: dim, low-glow card.
  2. **Touched** — at least one positive clue: brighter with a visible glow.
  3. **Fully known** — `possibleSuits.length === 1 && possibleRanks.length === 1`: brightest, full "lit firework" glow.
  Negative-only information narrows candidates but does **not** raise luminosity above step 1 (a card nobody pointed at shouldn't look chosen).
- **D-09:** The same luminosity rule applies to **teammates' face-up cards** (using the facts on their card views), so every player can see at a glance what the card's holder knows. This is the core reason luminosity is a signal and not decoration.
- **D-10:** Luminosity and suit hue must not compete: luminosity is expressed through **brightness/glow/border intensity of the card frame**, never by lightening or darkening the suit hue itself, and every suit hue + glyph must stay distinguishable at every luminosity step. The planner/UI-spec must verify contrast at the dimmest step. This joint glyph-and-luminosity design is the "original design work" the roadmap's research note calls for.
- **D-11:** Fireworks-night treatment is **static styling plus restrained motion**: dark layered background built from existing tokens, glow on lit cards and completed stacks, a brief celebratory flash when a stack completes. No particle systems, no always-running animation.

### Own-hand clue memory (UI-04, UI-05)
- **D-12:** Each own-hand card is face-down and shows **positive information prominently** (confirmed suit glyph/rank numeral once known, "touched" marks for each positive clue) and **negative/candidate information compactly**: a small candidate strip of suit glyphs and ranks 1–5 where ruled-out values are visibly struck/faded, driven by `possibleSuits`/`possibleRanks` (Phase 4 explicitly deferred narrowed candidates to this phase). Candidates are limited to the variant's suits.
- **D-13:** The same candidate/clue marks are shown **on teammates' cards too** (smaller), since that is what the holder knows. The actual face-up identity remains the dominant element on those cards.
- **D-14:** "Marked immediately": when a clue lands, the cards it touched (read from the latest `history` clue entry's `touchedCardIds`) get a **transient highlight** for a couple of seconds on every screen, then settle into their persistent marks. The persistent marks come from `facts`, so they survive refresh/reconnect with no client memory. No history panel is added.
- **D-15:** **Hard rule carried from Phase 4:** an own-hand card renders no identity signal beyond what its `facts` prove — no suit hue or glyph unless `possibleSuits` has narrowed to it, no rank unless narrowed. The server already strips identity; the UI must not reintroduce a hint (e.g. by card order, colour tint, or animation keyed on identity).

### Action interaction (RULES-11)
- **D-16:** **Select-then-act, no confirmation dialog.** Clicking an own card selects it and reveals Play and Discard buttons for it. Clicking a teammate's hand selects that teammate and shows a clue picker with every cluable colour (variant's `cluableColors`) and ranks 1–5.
- **D-17:** **Clue preview:** hovering/focusing a clue option highlights exactly the teammate cards it would touch (`clueTouchCountForTarget` logic, extended to return ids). Options that touch zero cards are shown **disabled**, not hidden.
- **D-18:** Illegal actions are **visibly disabled with a short reason** (tooltip or inline text): not your turn, no clue tokens, discard at 8 tokens, clue touches nothing, reconnecting. This extends Phase 4's D-12 client checks — no full-state engine predicates in the client; the server remains the authority, and any refusal it still returns is shown using the closed refusal enum from 04 D-10.
- **D-19:** Keyboard reachability for desktop: all controls are focusable buttons with visible focus rings; no hover-only actions (hover preview has a focus equivalent). No custom shortcut scheme.

### End of game (UI-10)
- **D-20:** At game end, a **modal-style overlay over the final board** shows the final score / max score, its descriptive band (`bandForView`), the end reason if derivable from the view (fuses out / all stacks complete / final round elapsed), and the completed stacks rendered with glyphs. The board stays visible behind it and every action control is disabled.
- **D-21:** The overlay's only action is **"New game"** linking back to the home page to create a new room. In-room rematch is a new capability and is deferred.

### Animation & dependencies
- **D-22:** Motion is **CSS transitions/keyframes by default**. Adding `motion` (per the stack doc) is allowed only if card movement hand → stack/discard is implemented and CSS proves insufficient; it is optional polish, not a requirement of any success criterion. Respect `prefers-reduced-motion`.

### Proving it
- **D-23:** Visual derivations are **pure, unit-tested functions** in `apps/web/lib/` (luminosity step, candidate display, touched-card ids for a clue, disabled-reason, end reason), following the existing `hanabi-board-logic.ts` pattern. A test asserts the own-hand rendering helpers never read identity fields.
- **D-24:** Playwright specs against the real worker cover: tableau elements visible without interaction, active-player indicator moves, a clue marks the right cards on the target's and giver's screens and the marks persist after the target refreshes, disabled controls are disabled with a reason, and the end screen appears with score and band. Extend existing specs (`e2e/hanabi-realtime.spec.ts`, `e2e/start-game.spec.ts`) rather than a parallel harness.
- **D-25:** Phase gate: `npm test`, `npx playwright test`, per-package `tsc --noEmit` green, **plus owner visual sign-off** on the designed board at desktop sizes, recorded verbatim. Once the owner signs off on the UI, the deferred RT-04 real-phone check (`docs/manual-checks/mobile-background.md`) becomes runnable and should be offered.

### Claude's Discretion
- Exact glyph shapes, suit hue values, glow sizes, and luminosity-step styling (subject to D-05–D-10 and contrast verification).
- Component/file split for the new board (replacing `HanabiBoard.tsx` in place or splitting into `components/hanabi/*`).
- Exact wording of disabled reasons, turn indicator, end-reason text, and band display.
- Transient highlight duration and stack-complete flash style.
- Whether the discard pile groups by suit or lists in order (must stay always visible and legible with ~20+ cards).
- Whether a UI-SPEC (`/gsd-ui-phase 6`) is produced before planning — recommended given `workflow.ui_phase: true` and the roadmap's original-design note.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/ROADMAP.md` §Phase 6 — goal, success criteria, research note on joint glyph/luminosity design
- `.planning/REQUIREMENTS.md` — UI-01…UI-11, RULES-11; Out of Scope table (no notes, no empathy view, no clue log)
- `.planning/PROJECT.md` — dark "fireworks night" key decision, desktop-first v1

### Visual system already established
- `apps/web/app/globals.css` — `@theme` tokens, accent reserved-uses rule, contrast rule, `--space-*` namespace warning
- `.planning/phases/01-room-transport-skeleton/01-UI-SPEC.md` — colour roles, accent list, verified contrast pairs, typography roles (two weights only)

### Wire contract & client logic
- `packages/rules/src/hanabi/state.ts` — `HanabiView`, `HanabiCardView`, `ClueFactsView`, `HistoryEntryView`
- `packages/rules/src/hanabi/variant.ts` — `ALL_SUITS`, per-variant `suits` and `cluableColors`
- `packages/schema/src/games/hanabi.ts` — strict wire schema the board validates against
- `apps/web/lib/hanabi-board-logic.ts` — existing client legality/turn/band helpers to extend
- `apps/web/components/HanabiBoard.tsx` — interim board being replaced; its own-hand no-identity rule carries forward

### Prior phase decisions that constrain this one
- `.planning/phases/04-wire-engine-into-room-actor/04-CONTEXT.md` — D-10 refusal enum, D-11 interim board, D-12 client disabling scope, D-13 end screen deferral
- `.planning/phases/05-reconnect-session-durability-hardening/05-CONTEXT.md` — D-05 reconnecting banner/disabled controls, D-07 connection indicators, D-11 "Use this tab"
- `docs/manual-checks/mobile-background.md` — deferred real-phone check to run after UI sign-off

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hanabi-board-logic.ts`: `clueTouchCountForTarget`, `isPlayDisabled`/`isDiscardDisabled`/`isGiveClueDisabled`, `bandForView`, `fusesRemainingForView`, `isSeatConnected`, `turnIndicatorText`, `cluableColorsForView` — extend rather than duplicate.
- `ReconnectingBanner.tsx`, `Button.tsx`, `SeatRow.tsx` connection-status styling, `clsx` for conditional classes.
- `room-store.ts` (Zustand) already holds the last view and reconnecting status; `RoomClient.tsx` routes `onAction` with `actionId` minting.

### Established Patterns
- Pure, unit-tested logic in `apps/web/lib/*.ts`; components stay thin.
- Board validates `view.game` with `HanabiViewSchema.safeParse` before rendering (WR-03).
- Exact-pinned dependencies; any new dep (e.g. `motion`) must be exact-pinned and declared in `apps/web` (Vercel installs only its deps).
- Tailwind v4 CSS-first tokens; no hex outside `@theme`.
- Playwright runs against real `wrangler dev` + Next on overridable ports (`E2E_WEB_PORT`/`E2E_WORKER_PORT`).

### Integration Points
- `RoomClient.tsx` renders `HanabiBoard` with `view`, `onAction`, `reconnecting` — the new board keeps this prop contract.
- Seat display names come from `RoomView.seats[].displayLabel`, not from `HanabiView`.

</code_context>

<specifics>
## Specific Ideas

- Luminosity reads like fireworks: an unclued card is an unlit shell, a clued card is glowing, a fully known card is fully lit.
- Players are on a voice call; the board is the shared table, so glanceable state beats dense text.

</specifics>

<deferred>
## Deferred Ideas

- **In-room rematch / "play again with same seats"** — new capability; end screen only links to new-room creation for now.
- **Clue log / history panel** — QOL-01 (v2); history is used only for transient "just happened" emphasis.
- **Card-movement flight animation with `motion`** — optional polish per D-22; not required.
- **Mobile/touch table** — MOB-01/02 (v2).
- **Turn/clue sound cues** — QOL-02 (v2).

</deferred>

---

*Phase: 06-game-interface*
*Context gathered: 2026-09-16*
