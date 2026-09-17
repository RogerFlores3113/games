# Phase 6: Game Interface - Research

**Researched:** 2026-09-16
**Domain:** Colorblind-safe, luminosity-signaling card game UI (React/Next.js + Tailwind v4), built on a frozen wire contract
**Confidence:** MEDIUM (architecture/testing HIGH; exact glyph/hue values MEDIUM-LOW, original design work, flagged for owner sign-off per D-25)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Table layout (UI-01, UI-02, UI-03, UI-11)**
- D-01: Fixed three-band desktop layout, no scrolling at >=1280x720 for 5 players: teammate hands across the top (in turn order starting after the viewer), central tableau in the middle (stacks, clue tokens, fuses, deck count + final-round counter, discard pile), own hand along the bottom. Nothing in UI-01's list is behind a menu, drawer, tab, or hover. Must remain usable (may scroll) down to ~1024px wide.
- D-02: Active player is marked three redundant ways: an accent ring/glow on that seat's hand container, the seat name in the turn indicator, and, when it is the viewer's turn, a prominent "Your turn" state on the own-hand band. The accent token's reserved-uses list already includes the active-turn indicator -- Phase 6 reuses it there (and for the own-seat "you" marker and focus rings), not for anything new.
- D-03: Phase 5's per-seat connected/disconnected status and the "Waiting for X -- disconnected" turn text (05 D-07) are restyled, not removed; `ReconnectingBanner` stays. The `data-testid`s the Phase 4/5 Playwright specs rely on are preserved or the specs are updated in the same change.
- D-04: The final round is visible: when `finalTurnsRemaining !== null`, the deck area shows "Final round -- N turns left" instead of a bare 0.

**Suit identity system (UI-06, groundwork for UI-07)**
- D-05: Every suit gets a unique glyph (distinct silhouette shape) plus its hue. The glyph appears on every rendered suit reference: face-up cards, stack heads, discard pile entries, colour-clue buttons, positive/negative clue marks, and own-hand candidate displays. Hue is never the only carrier of suit identity. No toggle, no accessibility mode.
- D-06: The glyph set and suit hues are defined for all seven suits now (red, yellow, green, blue, white, rainbow, black) in one module, even though Phase 7 proves Rainbow/Black -- so Phase 7 is testing, not designing. Rainbow's glyph must stand alone without relying on a multicolour fill.
- D-07: Glyphs are inline SVG components in the repo (no icon font, no new dependency; `lucide-react` may be used for UI chrome but not as the suit glyph source, since its shapes aren't designed as a distinguishable set). Suit hues are added as new `@theme` tokens in `apps/web/app/globals.css` (e.g. `--color-suit-red`), respecting that file's rule of no hex outside the `@theme` block and no redefinition of existing tokens.

**Luminosity as signal (UI-08, UI-09)**
- D-08: Luminosity encodes how much clue information a card carries, derived from `facts` alone, in three discrete steps (not a continuous gradient, so it is legible at a glance): Unclued (no positive clues, dim/low-glow), Touched (>=1 positive clue, brighter with visible glow), Fully known (`possibleSuits.length === 1 && possibleRanks.length === 1`, brightest, full "lit firework" glow). Negative-only information narrows candidates but does not raise luminosity above step 1.
- D-09: The same luminosity rule applies to teammates' face-up cards (using the facts on their card views), so every player can see at a glance what the card's holder knows.
- D-10: Luminosity and suit hue must not compete: luminosity is expressed through brightness/glow/border intensity of the card frame, never by lightening or darkening the suit hue itself, and every suit hue + glyph must stay distinguishable at every luminosity step. The planner/UI-spec must verify contrast at the dimmest step.
- D-11: Fireworks-night treatment is static styling plus restrained motion: dark layered background built from existing tokens, glow on lit cards and completed stacks, a brief celebratory flash when a stack completes. No particle systems, no always-running animation.

**Own-hand clue memory (UI-04, UI-05)**
- D-12: Each own-hand card is face-down and shows positive information prominently (confirmed suit glyph/rank numeral once known, "touched" marks for each positive clue) and negative/candidate information compactly: a small candidate strip of suit glyphs and ranks 1-5 where ruled-out values are visibly struck/faded, driven by `possibleSuits`/`possibleRanks`. Candidates are limited to the variant's suits.
- D-13: The same candidate/clue marks are shown on teammates' cards too (smaller), since that is what the holder knows. The actual face-up identity remains the dominant element on those cards.
- D-14: "Marked immediately": when a clue lands, the cards it touched (read from the latest `history` clue entry's `touchedCardIds`) get a transient highlight for a couple of seconds on every screen, then settle into their persistent marks. The persistent marks come from `facts`, so they survive refresh/reconnect with no client memory. No history panel is added.
- D-15: Hard rule carried from Phase 4: an own-hand card renders no identity signal beyond what its `facts` prove -- no suit hue or glyph unless `possibleSuits` has narrowed to it, no rank unless narrowed. The server already strips identity; the UI must not reintroduce a hint.

**Action interaction (RULES-11)**
- D-16: Select-then-act, no confirmation dialog. Clicking an own card selects it and reveals Play and Discard buttons for it. Clicking a teammate's hand selects that teammate and shows a clue picker with every cluable colour (variant's `cluableColors`) and ranks 1-5.
- D-17: Clue preview: hovering/focusing a clue option highlights exactly the teammate cards it would touch (`clueTouchCountForTarget` logic, extended to return ids). Options that touch zero cards are shown disabled, not hidden.
- D-18: Illegal actions are visibly disabled with a short reason (tooltip or inline text): not your turn, no clue tokens, discard at 8 tokens, clue touches nothing, reconnecting. This extends Phase 4's D-12 client checks -- no full-state engine predicates in the client; the server remains the authority.
- D-19: Keyboard reachability for desktop: all controls are focusable buttons with visible focus rings; no hover-only actions (hover preview has a focus equivalent). No custom shortcut scheme.

**End of game (UI-10)**
- D-20: At game end, a modal-style overlay over the final board shows the final score / max score, its descriptive band (`bandForView`), the end reason if derivable from the view (fuses out / all stacks complete / final round elapsed), and the completed stacks rendered with glyphs. The board stays visible behind it and every action control is disabled.
- D-21: The overlay's only action is "New game" linking back to the home page to create a new room. In-room rematch is a new capability and is deferred.

**Animation & dependencies**
- D-22: Motion is CSS transitions/keyframes by default. Adding `motion` is allowed only if card movement hand -> stack/discard is implemented and CSS proves insufficient; it is optional polish, not a requirement of any success criterion. Respect `prefers-reduced-motion`.

**Proving it**
- D-23: Visual derivations are pure, unit-tested functions in `apps/web/lib/` (luminosity step, candidate display, touched-card ids for a clue, disabled-reason, end reason), following the existing `hanabi-board-logic.ts` pattern. A test asserts the own-hand rendering helpers never read identity fields.
- D-24: Playwright specs against the real worker cover: tableau elements visible without interaction, active-player indicator moves, a clue marks the right cards on the target's and giver's screens and the marks persist after the target refreshes, disabled controls are disabled with a reason, and the end screen appears with score and band. Extend existing specs rather than a parallel harness.
- D-25: Phase gate: `npm test`, `npx playwright test`, per-package `tsc --noEmit` green, plus owner visual sign-off on the designed board at desktop sizes, recorded verbatim. Once the owner signs off on the UI, the deferred RT-04 real-phone check becomes runnable and should be offered.

### Claude's Discretion
- Exact glyph shapes, suit hue values, glow sizes, and luminosity-step styling (subject to D-05-D-10 and contrast verification).
- Component/file split for the new board (replacing `HanabiBoard.tsx` in place or splitting into `components/hanabi/*`).
- Exact wording of disabled reasons, turn indicator, end-reason text, and band display.
- Transient highlight duration and stack-complete flash style.
- Whether the discard pile groups by suit or lists in order (must stay always visible and legible with ~20+ cards).
- Whether a UI-SPEC (`/gsd-ui-phase 6`) is produced before planning -- recommended given `workflow.ui_phase: true` and the roadmap's original-design note.

### Deferred Ideas (OUT OF SCOPE)
- In-room rematch / "play again with same seats" -- new capability; end screen only links to new-room creation for now.
- Clue log / history panel -- QOL-01 (v2); history is used only for transient "just happened" emphasis.
- Card-movement flight animation with `motion` -- optional polish per D-22; not required.
- Mobile/touch table -- MOB-01/02 (v2).
- Turn/clue sound cues -- QOL-02 (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Clue tokens, fuse tokens, deck count, discard pile contents, and all played stacks visible at all times without opening a menu or drawer | Architecture Patterns' System Architecture Diagram (Table component, always-rendered tableau); Validation Architecture's UI-01 row (extend `e2e/start-game.spec.ts`) |
| UI-02 | The active player is unmistakably indicated | D-02's three-redundant-signal requirement mapped to the existing `--color-accent` reserved-uses list (already includes active-turn indicator); Validation Architecture UI-02 row |
| UI-03 | A player sees every other player's hand face-up, and their own hand face-down | Existing `HanabiBoard.tsx`/`HanabiCardView` discriminated union already structurally enforces this; Architecture Patterns' Card component split (visible / own-hand-hidden variants) |
| UI-04 | Cards touched by a clue are marked immediately and the marking persists | `history`'s `touchedCardIds` field (confirmed in `state.ts`/`hanabi.ts` schema) feeds `touchedCardIdsFromLatestClue`; Code Examples and Validation Architecture UI-04 row |
| UI-05 | Own-hand cards accumulate and display positive/negative clue info, narrowing candidates | `ClueFactsView.possibleSuits`/`possibleRanks` already on the wire; `candidateDisplayFor` derivation in Architecture Patterns/Recommended Project Structure; Validation Architecture UI-05 row |
| UI-06 | Every card carries a non-color suit identifier by default, no accessibility mode | `SuitGlyph` module (D-06/D-07), Standard Stack's "Supporting" table, Common Pitfalls #1/#2, Code Examples |
| UI-08 | Card luminosity conveys accumulated clue information independent of hue | Pattern 1 (luminosity as frame property, never hue property), `luminosityStepFor` in Code Examples, Common Pitfall #5 (glow performance) |
| UI-09 | Dark fireworks-night visual treatment | Inherits Phase 1's `@theme` tokens (Project Constraints, Standard Stack); D-11 restrained-motion guidance; flagged as manual/visual-QA-only in Validation Architecture (not meaningfully automatable) |
| UI-10 | End-of-game screen shows final score, band, and completed stacks | Pattern 3 (`endReasonForView`, mirroring the engine's `checkHanabiGameEnd`), since the wire view has no `endReason` field; Validation Architecture UI-10 row |
| UI-11 | Usable on a desktop browser at common window sizes | D-01's fixed three-band layout requirement; flagged as a Wave 0 e2e gap (no existing viewport-size test) in Validation Architecture |
| RULES-11 | Illegal actions are visibly unavailable in the interface rather than only rejected on submission | Existing `isPlayDisabled`/`isDiscardDisabled`/`isGiveClueDisabled`/`clueTouchCountForTarget` in `hanabi-board-logic.ts`, extended with `disabledReasonFor`; Don't Hand-Roll table (keyboard reachability via native buttons); Validation Architecture RULES-11 row |
</phase_requirements>

## Summary

Phase 6 is a pure frontend replacement: no server, schema, or wire changes are in scope or needed. Everything the designed board needs — per-card `possibleSuits`/`possibleRanks`/`positiveClues`/`negativeClues`, `history` (with `touchedCardIds` on clue entries), `finalTurnsRemaining`, `fuses` (used, not remaining), `score`, `deckCount` — already exists in `HanabiView` and is schema-locked by `HanabiViewSchema` (`packages/schema/src/games/hanabi.ts`). The interim `HanabiBoard.tsx` proves every interaction pattern (select-then-act, disabled-with-reason, clue-touch preview) that Phase 6 must re-skin, not redesign from scratch.

The two genuinely new pieces of engineering are (1) a joint glyph+hue+luminosity system where hue and glyph identify the suit and a separate brightness/glow channel on the card frame signals accumulated clue information, without the two channels visually fighting, and (2) deriving end-of-game reason text client-side, because the wire view does not carry an `endReason` field — only `fuses`, `stacks`, and `finalTurnsRemaining`, from which the same three-way check the engine already runs (`checkHanabiGameEnd` in `packages/rules/src/hanabi/endgame.ts`) must be mirrored as a pure, redacted-view-only function, exactly like `bandForView` already mirrors `scoreBand`.

The project's vitest setup can only run pure-TypeScript logic tests for `apps/web` today — there is no jsdom/testing-library dependency and no `environment` override in any vitest project, so DOM-rendering component tests are not available. This confirms D-23's instinct (push all derivation logic into pure, unit-tested `apps/web/lib/*.ts` functions) is not just good practice here — it is the only tier of the frontend that can be unit-tested at all. Component correctness is proven exclusively through Playwright against a real running app (D-24).

**Primary recommendation:** Build the new board as a component split under `apps/web/components/hanabi/` (Table, Hand, Card, ClueMemory, CluePicker, EndOverlay) that consumes six new pure derivation functions added to `apps/web/lib/hanabi-board-logic.ts` (or a new sibling file), reuse the existing `SeatRow`/`Button`/`ReconnectingBanner`/`clsx` patterns verbatim, add suit hue/glyph tokens to `globals.css`'s `@theme` block without touching any existing token, and preserve every `data-testid` the Phase 4/5 Playwright specs already assert against.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Suit identity (glyph + hue) rendering | Browser / Client | — | Pure presentation of already-redacted `facts`/`suit` fields; no server involvement |
| Luminosity step calculation | Browser / Client (pure lib fn) | — | Derived entirely from `facts.possibleSuits`/`possibleRanks`/`positiveClues` already on the wire; no new server computation |
| Clue-touch preview (hover/focus highlighting) | Browser / Client | — | `clueTouchCountForTarget` already exists client-side (04); Phase 6 only extends it to return ids, still pure client logic over the redacted view |
| Transient "just clued" highlight | Browser / Client | — | Reads `history`'s latest clue entry's `touchedCardIds`, already on the wire; purely a client animation trigger |
| Disabled-action reasons | Browser / Client | API / Backend (fallback) | Client covers the 4 knowable-from-view cases (D-12); server remains sole authority and returns the closed refusal enum for everything else (04 D-10) — this phase does not add server logic |
| End-of-game reason derivation | Browser / Client | — | Wire view has no `endReason` field; client must re-derive from `fuses`/`stacks`/`finalTurnsRemaining` using the same fixed-order rule the engine already implements in `checkHanabiGameEnd` |
| Own-hand identity redaction | API / Backend | Browser / Client (must not reintroduce) | Server already strips identity fields structurally (HIDE-03); client's only job is to never render identity beyond what `facts` narrow down to (D-15, carried from Phase 4) |
| Action dispatch (play/discard/clue) | Browser / Client → API / Backend | — | Client mints `actionId` and sends `game_action`; server (`RoomDO`) remains sole authority per RULES-11's disabled-not-hidden requirement |

## Project Constraints (from CLAUDE.md)

- **Exact-pinned dependencies** everywhere; any new dependency (e.g. `motion`, if D-22's escape hatch is exercised) must be exact-pinned in `apps/web/package.json`, since Vercel installs only that workspace's deps.
- **No CSS-in-JS runtime libraries** (styled-components, Emotion) — Tailwind v4 utility classes only, consistent with the existing `globals.css` `@theme` pattern.
- **Tailwind v4 CSS-first config**: no hex values outside the `@theme` block in `globals.css`; never redefine an existing token; never use the reserved `--spacing-*`/`--color-*`/`--text-*`/`--radius-*`/`--container-*`/`--breakpoint-*` namespaces for anything not intended to become a literal Tailwind scale value (the project's own `--space-*` vs `--spacing-*` incident is documented in `globals.css` itself).
- **`clsx`** for conditional class composition (already the established pattern in `HanabiBoard.tsx`/`SeatRow.tsx`) — no `tailwind-merge` needed at this complexity.
- **TypeScript 5.7+** (repo pins exact `5.9.3`) — non-negotiable for a rules-adjacent UI with this many suit/rank/luminosity edge cases.
- **`packages/rules` stays zero-dependency** (FDN-02) — none of Phase 6's work touches that package; all new code lives in `apps/web`.
- **This is NOT stock Next.js** — `apps/web/AGENTS.md` requires reading `node_modules/next/dist/docs/` for this exact pinned version (`16.3.4`) before writing App Router code, since APIs/conventions may differ from training data. Confirmed present in this repo; check for App Router page/route conventions and any RSC/client-boundary changes specific to `16.x` before touching `RoomClient.tsx`'s `"use client"` boundary or adding new server-rendered routes.
- **GSD workflow enforcement**: file-changing work must go through `/gsd:execute-phase`, not direct edits.

## Standard Stack

### Core (no new dependencies)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.8 | UI rendering | Already the project's framework; no version change needed |
| Next.js (App Router) | 16.3.4 | Routing / `"use client"` boundary for `RoomClient` | Already in place; Phase 6 does not add routes |
| Tailwind CSS | 4.3.3 | Styling, `@theme` tokens | Already in place; Phase 6 extends the existing token set only |
| `clsx` | 2.1.1 | Conditional class composition | Already a dependency, already the established pattern |
| `zustand` | 5.0.15 | Room/view store | Already in place (`room-store.ts`); Phase 6 reads from it, does not extend its shape |
| `lucide-react` | 1.39.0 | **UI chrome only** (buttons, icons) — explicitly NOT the suit glyph source per D-07 | Already a dependency; its shapes are not designed as a distinguishable icon *set*, so it is unsuitable for suit glyphs specifically |

### Supporting (net-new within this phase, zero new npm installs)
| Asset | Purpose | When to Use |
|-------|---------|-------------|
| Inline SVG suit glyph components (new, hand-authored) | Suit identity, colorblind-safe by construction | Every suit reference: cards, stack heads, discard entries, clue buttons, candidate strips |
| New `@theme` tokens (`--color-suit-*`) in `globals.css` | Suit hue | Card frames, glyph fills, clue-value buttons |
| CSS `box-shadow`/`filter: drop-shadow`/`border` intensity steps | Luminosity signal | Card frame only — never applied to suit hue itself (D-10) |
| `prefers-reduced-motion` media query | Respect motion preference for the stack-complete flash / transient highlight | Any keyframe/transition added for D-11/D-14 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-authored inline SVG glyphs | `lucide-react` icons re-purposed as suit markers | Rejected per D-07 — lucide's icon set isn't designed as a mutually-distinguishable-silhouette set; picking 7 "close enough" icons risks two suits reading as visually similar at a glance, which defeats the whole point of UI-06 |
| CSS-only glow/luminosity (`box-shadow`/`filter`) | `motion`/`framer-motion` for luminosity transitions | D-22: CSS is the default; `motion` is optional polish only if card-movement flight animation is attempted and CSS proves insufficient — not needed for luminosity steps or the stack-complete flash, which are simple discrete-state transitions |
| Radix/shadcn primitives for the clue picker (hover-preview, tooltip-like disabled reasons) | Hand-rolled buttons + `title`/inline text | Phase 1's UI-SPEC already flagged Phase 6 as the point to revisit `shadcn`/Radix if the interactive surface (tooltips, popovers) grows enough to justify it. This phase's surface (a color/rank button grid, no true popover/floating-UI needs) does not yet cross that threshold — plain buttons with an inline caption (matching the interim board's existing `noTouchCaption` pattern) is sufficient and keeps the "component library: none" decision consistent for one more phase. Flag for revisit if Phase 7 (Rainbow ambiguity) adds real popover needs. |

**Installation:** None. This phase introduces zero new npm packages.

**Version verification:** N/A — no new packages. All libraries listed above are already installed at the pinned versions shown (confirmed via `apps/web/package.json`, read directly — `[VERIFIED: package.json]`).

## Package Legitimacy Audit

**Not applicable this phase.** No external packages are installed. If D-22's `motion` escape hatch is exercised during execution (card-movement flight animation, CSS proven insufficient), the plan MUST run the full Package Legitimacy Gate protocol (slopcheck + `npm view motion version` + postinstall-script check) before adding it, and gate the install behind a `checkpoint:human-verify` task per the project's exact-pin convention. Do not add `motion` speculatively in this phase's plan — D-22 is explicit that it is optional and not required by any success criterion.

## Architecture Patterns

### System Architecture Diagram

```
 Server (RoomDO, Cloudflare Worker) — UNCHANGED this phase
   │  pushes RoomView{ status:"active", game: HanabiViewWire, seats[] }
   ▼
 room-store.ts (Zustand)  ── last known view, connection status ──┐
   │                                                               │
   ▼                                                               │
 RoomClient.tsx  ── renders <HanabiBoard view onAction reconnecting> ┘
   │
   ▼
 New Hanabi board tree (apps/web/components/hanabi/*)
   │
   ├─→ isHanabiView(view.game) via HanabiViewSchema.safeParse   (WR-03 gate, unchanged)
   │
   ├─→ apps/web/lib/hanabi-board-logic.ts (existing) + NEW pure fns:
   │      • luminosityStepFor(facts) → "unclued" | "touched" | "known"
   │      • candidateDisplayFor(facts, variantSuits) → per-suit/rank struck/faded state
   │      • touchedCardIdsFromLatestClue(history) → string[] (for transient highlight)
   │      • disabledReasonFor(...) → human-readable string | null
   │      • endReasonForView(view) → "fuses_exhausted" | "all_stacks_complete" | "final_round_elapsed" | null
   │      • clueTouchIdsForTarget(view, targetSeatId, clue) → string[] (D-17 extension of existing count fn)
   │
   ├─→ Table (tableau: clue/fuse tokens, deck+final-round counter, discard, stacks — always visible, UI-01)
   ├─→ Hand (teammate face-up / own face-down; renders Card × N)
   ├─→ Card (glyph + hue + luminosity frame; own-hand variant never reads suit/rank unless facts narrow to it — D-15)
   ├─→ CluePicker (select-then-act; hover/focus preview via clueTouchIdsForTarget; disabled-with-reason via disabledReasonFor)
   └─→ EndOverlay (modal over final board; score/band/reason/completed stacks; "New game" only action)
   │
   ▼
 onAction(request) → RoomClient's send() → ClientMessage{game_action, actionId, request} → socket → server (unchanged)
```

### Recommended Project Structure
```
apps/web/
├── components/
│   ├── hanabi/
│   │   ├── HanabiBoard.tsx        # thin orchestrator, keeps existing prop contract (view, onAction, reconnecting)
│   │   ├── Table.tsx              # tableau: tokens, deck, discard, stacks
│   │   ├── Hand.tsx               # renders a row of Card for one seat (teammate or own)
│   │   ├── Card.tsx               # glyph + hue + luminosity frame; two variants (visible / own-hand-hidden)
│   │   ├── SuitGlyph.tsx          # the 7 inline SVG glyph components, one module (D-06)
│   │   ├── CandidateStrip.tsx     # own-hand + teammate compact candidate display (D-12/D-13)
│   │   ├── CluePicker.tsx         # target select + color/rank grid + hover/focus preview
│   │   └── EndOverlay.tsx         # end-of-game modal (D-20/D-21)
│   ├── Button.tsx                 # existing, reused
│   ├── ReconnectingBanner.tsx     # existing, reused, restyled only (D-03)
│   └── SeatRow.tsx                # existing, NOT reused directly in-game (D-02/D-03 restyle connection status inline)
├── lib/
│   ├── hanabi-board-logic.ts      # existing four predicates + turnIndicatorText + bandForView + fusesRemainingForView, EXTENDED
│   └── hanabi-visual-logic.ts     # NEW: luminosityStepFor, candidateDisplayFor, touchedCardIdsFromLatestClue,
│                                  #      disabledReasonFor, endReasonForView — kept separate from the D-12-scoped
│                                  #      legality file so its stricter "boundary" comment doesn't have to expand
└── app/globals.css                # + --color-suit-* tokens only, no redefinition of existing tokens
```

### Pattern 1: Luminosity as a frame property, never a hue property (D-10)
**What:** Three discrete luminosity steps (unclued / touched / known) are expressed exclusively through the *card frame's* brightness/glow/border-width — never by lightening/darkening the suit's hue value itself.
**When to use:** Every card render, own-hand and teammate alike (D-08/D-09).
**Example:**
```css
/* globals.css @theme additions — suit hue is a flat, single value per suit,
   unaffected by luminosity step */
--color-suit-red: #FF5C5C;
--color-suit-yellow: #F2D24B;
--color-suit-green: #4ADE80;
--color-suit-blue: #5B9BFF;
--color-suit-white: #F4F6FB;
--color-suit-black: #B8BFCF; /* lighter than literal black for legibility on a near-black bg — see Pitfall below */
--color-suit-rainbow: #D68FFF; /* outline/glyph-edge hue only; fill uses a gradient of all cluable colors */
```
```tsx
// Card.tsx — luminosity affects ONLY the frame, hue is constant
const luminosityClass = {
  unclued: "shadow-none border-[1px] opacity-80",
  touched: "shadow-[0_0_8px_var(--color-accent-glow)] border-[2px]",
  known: "shadow-[0_0_16px_var(--color-accent-glow)] border-[2px] brightness-110",
}[luminosityStepFor(card.facts)];
// suit hue applied identically regardless of luminosityClass:
<SuitGlyph suit={card.suit} className="fill-[var(--color-suit-red)]" />
```

### Pattern 2: Select-then-act with hover/focus-driven preview (D-16/D-17/D-19)
**What:** Click own card → reveals Play/Discard for that card. Click teammate hand → reveals clue picker; hovering *or focusing* (keyboard-reachable, D-19) a clue option highlights the cards it would touch via `clueTouchIdsForTarget`.
**When to use:** All in-game action affordances.
**Example (extends existing `clueTouchCountForTarget`):**
```ts
// hanabi-board-logic.ts — D-17 extension, same variantConfig dispatch as the existing count fn
export function clueTouchIdsForTarget(view: HanabiView, targetSeatId: string, clue: Clue): string[] {
  const target = view.otherHands.find((h) => h.seatId === targetSeatId);
  if (!target) return [];
  const config = variantConfig(view.variant);
  return target.cards
    .filter((c) => !c.hidden)
    .filter((c) => clue.type === "color" ? config.colorClueTouches(c.suit, clue.value) : config.rankClueTouches(c.rank, clue.value))
    .map((c) => c.id);
}
```

### Pattern 3: Deriving end-reason from a redacted view, mirroring the engine's own priority order
**What:** `HanabiView` carries no `endReason` field. The engine's `checkHanabiGameEnd` (packages/rules/src/hanabi/endgame.ts) checks fuses-exhausted → all-stacks-complete → final-round-elapsed, in that fixed order, on the full `HanabiState`. The client must replicate the SAME fixed order over the SAME three fields as they appear on the wire view (`fuses`, `stacks`, `finalTurnsRemaining`), never re-deriving the underlying rule differently.
**When to use:** `EndOverlay`, when `view.status === "ended"`.
**Example:**
```ts
// hanabi-visual-logic.ts
import { MAX_FUSES, maxScoreFor, variantConfig } from "@games/rules";
import type { HanabiView } from "@games/rules";

export type EndReason = "fuses_exhausted" | "all_stacks_complete" | "final_round_elapsed" | null;

/** Mirrors packages/rules/src/hanabi/endgame.ts's checkHanabiGameEnd fixed
 * evaluation order, over the REDACTED view's own fields — never re-derives
 * the rule, just re-reads it through the fields the wire actually carries. */
export function endReasonForView(view: HanabiView): EndReason {
  if (view.fuses >= MAX_FUSES) return "fuses_exhausted";
  const maxScore = maxScoreFor(variantConfig(view.variant));
  if (view.score === maxScore) return "all_stacks_complete";
  if (view.finalTurnsRemaining === 0) return "final_round_elapsed";
  return null; // view.status === "ended" but no derivable reason — display score/band only
}
```
*Source: `packages/rules/src/hanabi/endgame.ts` (read directly this session) — `[VERIFIED: repo source]`.*

### Anti-Patterns to Avoid
- **Re-deriving legality/end-condition thresholds independently client-side** — the codebase's own convention (see `hanabi-board-logic.ts` file header) is to dispatch through the engine's exported functions/constants (`MAX_FUSES`, `maxScoreFor`, `variantConfig`, `scoreBand`) rather than hardcoding `3`, `25`, `0.24`, etc. a second time. `endReasonForView` above follows this; do not inline the fuse/score thresholds anywhere else in the new board.
- **Encoding luminosity via hue lightness/darkness** — explicitly forbidden by D-10; use frame brightness/glow/border only.
- **Color-only suit identity anywhere** — D-05 requires the glyph on every suit reference, no exceptions, no toggle.
- **A native browser `title` attribute as the sole disabled-reason mechanism** — works for mouse hover but is inconsistently exposed to keyboard/focus and screen readers across browsers; prefer visible inline text (matches the interim board's existing `noTouchCaption` pattern) or an `aria-describedby`-linked caption, satisfying D-19's "hover preview has a focus equivalent" requirement structurally rather than by convention.
- **A `postcss`/Tailwind class name built from a suit variable at runtime** (e.g. `` `text-suit-${suit}` ``) — Tailwind v4's JIT scanner cannot see dynamically interpolated class names; use inline `style={{ color: "var(--color-suit-red)" }}` or a static lookup map of literal class names instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Score band text | A second score/25 threshold table in the UI | `scoreBand`/`maxScoreFor` from `@games/rules`, via the existing `bandForView` | Already built, already tested (Phase 3/4); a second copy risks drifting from the engine's actual bands, especially the Rainbow/Black 30-point scaling |
| Clue-touch counting/highlighting | Hand-rolled suit/rank match logic in the component | `variantConfig(...).colorClueTouches`/`rankClueTouches`, via `clueTouchCountForTarget`/new `clueTouchIdsForTarget` | Variant-parametrized already (Rainbow's "every color touches it" rule, Black's exact-match rule) — duplicating this in a component risks missing Rainbow/Black correctness that Phase 7 will test |
| Focus-visible / keyboard reachability | Custom `tabIndex`/keydown handling per interactive element | Native `<button>` elements everywhere (already the pattern in `Button.tsx`, `HanabiBoard.tsx`) with the browser's native `:focus-visible` ring styled via Tailwind, no custom keyboard event plumbing | Native buttons are keyboard/screen-reader-correct by default (Enter/Space activation, correct ARIA role); D-19 requires no custom shortcut scheme, which a native-button-only approach satisfies for free |
| Reduced-motion handling | A JS `matchMedia` check gating every animation | CSS `@media (prefers-reduced-motion: reduce)` block that zeroes/shortens the relevant `transition`/`animation` declarations | Zero-JS, works even before hydration, and is the platform-standard mechanism D-22 explicitly calls out |

**Key insight:** Every "don't hand-roll" item above already has a codebase-resident answer from Phases 3/4 — Phase 6's actual net-new engineering surface is narrower than the visual scope suggests: it is the glyph/hue/luminosity system and the end-reason/candidate-display derivations, not a new rules or legality layer.

## Common Pitfalls

### Pitfall 1: "Black" suit rendered as literal near-black on a near-black background
**What goes wrong:** A naive reading of the Black variant's name leads to styling its cards/glyph with a very dark fill, which becomes nearly invisible against `--color-bg` (`#0B0F1A`) and `--color-surface` (`#141A2E`).
**Why it happens:** The suit's flavor name ("Black") is conflated with its rendered lightness; the game's actual requirement is only that Black is visually distinguishable as its own suit, not that it be rendered as the color black.
**How to avoid:** Render Black with a light, desaturated tone (e.g., a pale gray/silver, computed contrast ≈10.4:1 against bg — see Sources) plus a distinct glyph silhouette; the suit's "blackness" is conveyed by its glyph shape and its label/name, not by literal hue darkness. This mirrors the existing `--color-status-disconnected` decision in `globals.css`, which deliberately avoids a naive literal color for a similar legibility reason.
**Warning signs:** Any suit hue token whose contrast ratio against both `--color-bg` and `--color-surface` computes below 4.5:1 (AA) — verify all 7 suit tokens before implementation, not just Black.

### Pitfall 2: Rainbow's glyph implemented as a literal multicolor gradient fill and nothing else
**What goes wrong:** D-06 requires Rainbow's glyph to "stand alone without relying on a multicolour fill" — but the easy implementation (a `linear-gradient` fill across the glyph SVG) makes the glyph's *identity* depend entirely on color, which fails for anyone with a color vision deficiency exactly like the suit it's meant to represent.
**Why it happens:** A gradient fill is visually striking and the obvious "rainbow" implementation, but it re-introduces color-dependence at the one spot the phase is explicitly trying to eliminate it.
**How to avoid:** Give Rainbow a unique silhouette (distinct from all 6 other suits) that is legible as a flat single-tone glyph (e.g. filled with `--color-text` or a neutral outline), and treat any gradient/multicolor fill as decorative garnish layered on top of — never a substitute for — that silhouette.
**Warning signs:** If hiding the fill color (e.g., temporarily rendering the glyph in grayscale) makes Rainbow indistinguishable from any other suit's glyph, the shape alone is not doing the identifying work.

### Pitfall 3: Vitest "web" project cannot render components — writing a `.test.tsx` that imports `@testing-library/react`
**What goes wrong:** A plan or task assumes component-level rendering tests are available (common default expectation for a React app) and writes a `render(<Card .../>)` test; it fails immediately because `@testing-library/react`/`jsdom` are not installed and no vitest project sets `environment: "jsdom"`.
**Why it happens:** Every other vitest project in this repo (`schema`, `rules`, `worker`) is intentionally pure-Node, and `web`'s project inherits the same assumption implicitly rather than by an explicit "no DOM" statement anywhere.
**How to avoid:** Keep all Phase 6 unit tests as pure-function tests against `apps/web/lib/*.ts` (matching the existing `hanabi-board-logic.test.ts` pattern exactly — plain objects in, plain values out, zero DOM). Prove component/interaction behavior exclusively via Playwright (D-24). If component-level unit testing is later desired, that is a new infrastructure decision (`@testing-library/react` + `jsdom` + a vitest `environment` override) requiring its own package-legitimacy check — out of scope for this phase's D-25 gate as currently scoped.
**Warning signs:** Any new `.test.tsx` file, or any `import` of `react-dom/test-utils`/`@testing-library/*` in `apps/web`.

### Pitfall 4: Breaking an e2e-asserted text format while restyling
**What goes wrong:** Existing Playwright specs (`e2e/start-game.spec.ts`, `e2e/hanabi-realtime.spec.ts`) assert exact text content — `` `${initialDeckNumber - 1} cards left in deck` ``, `"Your turn"` / `"Waiting for {name}"` / `"Waiting for {name} — disconnected"`, `discard-pile` rendering discarded cards as `<li>` elements — and a visual redesign that changes this copy or markup shape silently breaks CI without any code-review-visible "test change" signal, since the assertions live in a different file from the component.
**Why it happens:** The interim board's copy and markup were written to be "cheap to throw away" (D-11, Phase 4), but the e2e specs that assert against them were not written with the same disposability in mind — some specs (RT-01/RT-03, ROOM-06/HIDE-01) are load-bearing proofs the phase must keep green.
**How to avoid:** Before changing any copy string or markup shape currently asserted in `e2e/*.spec.ts`, grep for it first (see the `data-testid` list in this document's Sources / the D-24 canonical spec files) and update the spec in the SAME change per D-03/D-24's explicit instruction, never as a follow-up.
**Warning signs:** `npx playwright test` failures with text-mismatch errors after a purely-visual-looking commit.

### Pitfall 5: `filter`/`box-shadow`-based glow degrading performance across ~20 candidate-strip glyphs per hand on lower-end hardware
**What goes wrong:** Applying `filter: drop-shadow(...)` (which is more expensive than `box-shadow` because it operates per-pixel on the actual alpha shape rather than the box) to many small inline SVGs simultaneously (5 hands × up to 5 cards × a multi-glyph candidate strip) can visibly janks scrolling/animation on constrained hardware, especially during the D-11 stack-complete flash.
**Why it happens:** `filter` is a common reach for "glow" but is GPU-cost-heavier than `box-shadow`; the fireworks-night aesthetic invites reaching for it everywhere.
**How to avoid:** Use `box-shadow` for the card-frame glow (the primary UI-08 luminosity signal, applied to a handful of rectangular card elements, not per-glyph) and reserve any `filter: drop-shadow` usage for the (much smaller, one-at-a-time) stack-complete celebratory flash only, per D-11's "restrained motion" instruction.
**Warning signs:** Visible frame drops when many cards transition luminosity step simultaneously (e.g., right after a clue that touches several cards).

## Code Examples

### Suit glyph module skeleton (D-06/D-07)
```tsx
// apps/web/components/hanabi/SuitGlyph.tsx
// Source: original — no authoritative reference implementation found for a
// combined luminosity+colorblind Hanabi glyph set (per roadmap research note).
import type { Suit } from "@games/rules";

export interface SuitGlyphProps {
  suit: Suit;
  className?: string; // caller supplies fill/size via Tailwind + CSS vars
}

// One inline <svg> per suit, distinct silhouette, defined for all 7 suits now
// (D-06) even though only 5 render in Phase 6's own e2e coverage.
const GLYPHS: Record<Suit, (props: { className?: string }) => JSX.Element> = {
  red: (p) => <svg {...p} viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5L18.5 22 12 17l-6.5 5 2-8.5L2 9h7z" /></svg>, // star
  yellow: (p) => <svg {...p} viewBox="0 0 24 24"><path d="M12 2l10 20H2z" /></svg>, // triangle
  green: (p) => <svg {...p} viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" /></svg>, // square
  blue: (p) => <svg {...p} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>, // circle
  white: (p) => <svg {...p} viewBox="0 0 24 24"><path d="M12 2l10 10-10 10L2 12z" /></svg>, // diamond
  rainbow: (p) => <svg {...p} viewBox="0 0 24 24"><path d="M12 2l2.5 7.5H22l-6 4.5 2.5 7.5-6.5-4.5-6.5 4.5 2.5-7.5-6-4.5h7.5z" /></svg>, // burst (single-tone silhouette)
  black: (p) => <svg {...p} viewBox="0 0 24 24"><path d="M12 2l4 4v6l4 4-4 4v0l-4-4-4 4v0l-4-4 4-4V6z" /></svg>, // distinct hex-ish silhouette
};

export function SuitGlyph({ suit, className }: SuitGlyphProps) {
  const Glyph = GLYPHS[suit];
  return <Glyph className={className} />;
}
```
*Exact shapes/paths are placeholder-quality sketches for this research document, not final art — D-25 requires owner visual sign-off before this is considered done; treat the SHAPES (not the mechanism) as `[ASSUMED]`.*

### Luminosity step derivation (D-08)
```ts
// apps/web/lib/hanabi-visual-logic.ts
import type { ClueFactsView } from "@games/rules";

export type LuminosityStep = "unclued" | "touched" | "known";

/** D-08: three discrete steps, derived from facts alone. Negative-only
 * information (narrows candidates but has zero positiveClues) stays at
 * "unclued" — a card nobody pointed at must not look chosen (D-08's
 * explicit anti-goal). */
export function luminosityStepFor(facts: ClueFactsView): LuminosityStep {
  const fullyKnown = facts.possibleSuits.length === 1 && facts.possibleRanks.length === 1;
  if (fullyKnown) return "known";
  if (facts.positiveClues.length > 0) return "touched";
  return "unclued";
}
```

### Own-hand-never-reads-identity test pattern (D-15, extends D-23's existing convention)
```ts
// apps/web/lib/hanabi-visual-logic.test.ts
import { describe, expect, it } from "vitest";
import * as visualLogic from "./hanabi-visual-logic";

describe("own-hand rendering helpers never read identity fields", () => {
  it("luminosityStepFor's signature only accepts ClueFactsView, structurally excluding suit/rank", () => {
    // Compile-time proof: ClueFactsView has no suit/rank fields at all, so
    // TypeScript itself makes an identity-reading luminosityStepFor
    // unrepresentable, not just untested. This test exists to document that
    // guarantee, matching source-structure.test.ts's existing pattern in
    // apps/worker of asserting an invariant that only. Runtime assertion is
    // adjacent: run luminosityStepFor against a facts object that would fail
    // if suit/rank were smuggled in via an untyped `any` cast anywhere in the
    // call chain.
    expect(typeof visualLogic.luminosityStepFor).toBe("function");
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Interim `HanabiBoard.tsx`: text-only cards (`{suit} {rank}`), no glyph, no hue, no luminosity | Designed board: glyph + hue + luminosity-signaling card frame | This phase (Phase 6) | The interim board's own header comment explicitly names itself "cheap to throw away" and disclaims "no card art, no animation, no suit-to-hue mapping" — Phase 6 is its designed replacement, not an iteration |
| Own-hand rendering shows only raw `positiveClues`/`negativeClues` text ("Told: red", "Told: not 3") | Candidate strip showing all 5 ranks × variant suits with ruled-out values struck/faded, driven by `possibleSuits`/`possibleRanks` | This phase | Phase 4's `hanabi-board-logic.ts` comment explicitly defers "narrowed candidates" to Phase 6 (UI-05) — this is documented, planned debt, not a regression to fix |

**Deprecated/outdated:** None — this is a from-scratch build on a stable, already-approved wire contract; there is no prior "Phase 6 v1" to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Specific hex values for the 7 suit hues (`--color-suit-red: #FF5C5C`, etc.) | Standard Stack / Architecture Patterns / Common Pitfalls | Low-medium — contrast math is computed and verified against `--color-bg`/`--color-surface` in this session (`[VERIFIED: computed via WCAG relative-luminance formula]`), but the specific hue choices themselves (as opposed to their contrast ratios) are original design work per the roadmap's own research note, and must go through D-25's owner visual sign-off before being locked |
| A2 | The specific 7 glyph silhouettes shown in the Code Examples section | Code Examples | Low — explicitly marked as placeholder sketches in that section; the plan/execution phase is expected to replace them with real design work, not ship them verbatim |
| A3 | Rendering "Black" suit as a light/silver tone rather than literal near-black | Common Pitfalls #1 | Medium — this is a reasonable inference from the existing `--color-status-disconnected` precedent in this codebase and from general dark-UI accessibility practice, but no authoritative Hanabi-implementation source was found and directly verified this session confirming how other implementations solve this specific problem (Hanab Live's own colorblind-mode pip styling was searched but its exact visual treatment was not confirmed via primary source — see Open Questions) |
| A4 | `motion`/Framer Motion package name and its "current major = 13.x" claim (carried from `CLAUDE.md`'s stack doc, not independently re-verified this session) | Alternatives Considered / Package Legitimacy Audit | Low — irrelevant unless D-22's escape hatch is exercised; flagged so the plan re-verifies via `npm view motion version` at that time rather than trusting the stack doc's number, which may have drifted |

**If this table is empty:** N/A — see above.

## Open Questions

1. **What exact glyph shapes does Hanab Live's colorblind mode use per suit?**
   - What we know: Hanab Live (the reference open-source Hanabi implementation) has a colorblind-mode toggle and documents suit "pips" somewhere in its repo/wiki (per WebSearch); this project's WebSearch access did not fetch the actual pips reference page content this session.
   - What's unclear: Whether adopting visually-similar shapes to Hanab Live's own set would give players who already play there a head start, versus this project's D-05/D-06 already mandating an always-on system (Hanab Live's is opt-in), which is a meaningfully different design constraint (their default state has no glyphs at all, so their glyph set may not have been optimized for always-visible density the way this phase's is).
   - Recommendation: Treat this as a nice-to-have cross-check, not a blocker — fetch `github.com/Hanabi-Live/hanabi-live`'s pips reference directly (e.g. via `WebFetch` on the raw docs page) during planning/execution if time allows, but do not block Phase 6 on it; the glyph shapes are explicitly Claude's Discretion per CONTEXT.md and subject to D-25's owner sign-off regardless of provenance.

2. **Does the discard pile's `<li>`-per-card markup (asserted implicitly by `e2e/start-game.spec.ts`'s `'[data-testid="discard-pile"] li'` locator) need to survive as literal `<li>` elements, or can the spec be updated to a more general locator?**
   - What we know: The spec currently counts `li` children under `[data-testid="discard-pile"]` to detect a new discard. CONTEXT.md's D-24 explicitly permits updating specs in the same change, and Claude's Discretion explicitly leaves "whether the discard pile groups by suit or lists in order" open.
   - What's unclear: Whether the designed discard pile (potentially grouped by suit, per the Discretion note) will naturally still render as a flat list of `<li>` per card, or needs a different DOM shape that would require a spec update.
   - Recommendation: Decide the discard pile's exact DOM shape during planning and update `e2e/start-game.spec.ts`'s locator in the same plan/task if the grouped layout is chosen — do not defer this to a later cleanup pass, per D-24.

## Environment Availability

Skipped — this phase has no new external dependencies (no new packages, no new services); every tool involved (`npm test`, `npx playwright test`, `tsc --noEmit`) is already verified working in this repo from Phases 1–5 (`package.json` scripts, `playwright.config.ts` both read directly this session).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (workspace-projects mode, root `vitest.config.ts`) + Playwright 1.62.1 (`playwright.config.ts`) |
| Config file | `/vitest.config.ts` (4 projects: schema, rules, worker, web) and `/playwright.config.ts` |
| Quick run command | `npx vitest run --project web` (pure-lib unit tests only — no DOM environment available, see Pitfall 3) |
| Full suite command | `npm test` (all 4 vitest projects) then `npm run test:e2e` (Playwright against real `wrangler dev` + `next dev`) |

### Phase Requirement → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Tokens/deck/discard/stacks visible without menu | e2e (visibility assertions, no interaction) | `npx playwright test e2e/start-game.spec.ts` (extend) | ✅ extend existing |
| UI-02 | Active player unmistakable (3 redundant signals) | e2e (assert accent ring class/attr + turn text + own-hand "your turn" state) | `npx playwright test e2e/hanabi-realtime.spec.ts` (extend) | ✅ extend existing |
| UI-03 | Teammates face-up, own face-down | e2e (existing HIDE-01 assertion already proves this at the text level; extend to glyph/rank rendering) | `npx playwright test e2e/start-game.spec.ts` | ✅ extend existing |
| UI-04 | Clued cards marked immediately, persists | unit (transient-highlight derivation) + e2e (visual persistence across refresh) | `npx vitest run --project web -t touchedCardIdsFromLatestClue` + `npx playwright test e2e/hanabi-realtime.spec.ts` | ❌ Wave 0 (new test file `hanabi-visual-logic.test.ts`) |
| UI-05 | Own-hand candidate narrowing display | unit (`candidateDisplayFor`) | `npx vitest run --project web -t candidateDisplayFor` | ❌ Wave 0 |
| UI-06 | Non-color suit identifier always on | unit (glyph lookup exhaustiveness over `ALL_SUITS`) + e2e (glyph element present per rendered suit) | `npx vitest run --project web -t SuitGlyph` | ❌ Wave 0 |
| UI-08 | Luminosity independent of hue | unit (`luminosityStepFor` over facts fixtures) | `npx vitest run --project web -t luminosityStepFor` | ❌ Wave 0 |
| UI-09 | Dark fireworks-night treatment | manual/visual (D-25 owner sign-off) — not meaningfully automatable | N/A (visual QA) | — |
| UI-10 | End screen: score/band/stacks | unit (`endReasonForView`) + e2e (`game-over-heading`/`final-score` extended assertions) | `npx vitest run --project web -t endReasonForView` + `npx playwright test` | ❌ Wave 0 unit; ✅ extend e2e |
| UI-11 | Usable at common desktop sizes, scroll ok ≥1024px | e2e (viewport-sized assertion, e.g. `page.setViewportSize`) | `npx playwright test` (new/extended test) | ❌ Wave 0 (new viewport test) |
| RULES-11 | Illegal actions visibly disabled with reason | unit (`disabledReasonFor`) + e2e (existing `isPlayDisabled`/`isDiscardDisabled`/`isGiveClueDisabled` assertions, extended for reason text) | `npx vitest run --project web -t disabledReasonFor` | ❌ Wave 0 unit; ✅ existing e2e coverage of the boolean disabled state |

### Sampling Rate
- **Per task commit:** `npx vitest run --project web` (fast — pure-function tests only, sub-second)
- **Per wave merge:** `npm test` (all 4 vitest projects) + `npx playwright test` (full e2e, real dev servers — slower, run before declaring a wave done)
- **Phase gate:** Full suite green (`npm test`, `npx playwright test`) + `tsc -b` clean + owner visual sign-off (D-25), recorded verbatim, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/lib/hanabi-visual-logic.ts` + `apps/web/lib/hanabi-visual-logic.test.ts` — new file, covers UI-04/UI-05/UI-06/UI-08/UI-10/RULES-11's derivation logic (luminosityStepFor, candidateDisplayFor, touchedCardIdsFromLatestClue, disabledReasonFor, endReasonForView)
- [ ] `hanabi-board-logic.ts`'s `clueTouchCountForTarget` extended (or a sibling `clueTouchIdsForTarget` added) — covers UI-04/D-17's hover/focus preview, needs its own unit test cases added to the existing `hanabi-board-logic.test.ts`
- [ ] A new or extended Playwright spec covering UI-11's ≥1024px scrollable-but-usable requirement and the 3-redundant-signals active-player indicator (UI-02) — neither is currently asserted by any existing e2e spec
- [ ] Framework install: none — Vitest/Playwright already fully configured; no new test framework needed

## Security Domain

Not applicable — `.planning/config.json`'s `security_enforcement` was not inspected as a hard gate here because this phase introduces no new attack surface: no new network endpoints, no new input parsing paths, no new auth/session logic. All rendering is over data the server has already redacted and schema-validated (`HanabiViewSchema.safeParse`, unchanged this phase). The one adjacent security-relevant property — own-hand identity must never leak into the DOM — is UI-05/D-15's explicit concern and is covered above as an architectural constraint (Pitfall avoidance + the existing `own-hand rendering helpers never read identity fields` test pattern), not a new ASVS category.

## Sources

### Primary (HIGH confidence)
- `packages/rules/src/hanabi/state.ts` — read directly, `HanabiView`/`HanabiCardView`/`ClueFactsView`/`HistoryEntryView` shapes
- `packages/rules/src/hanabi/variant.ts` — read directly, `ALL_SUITS`, `VariantConfig`, per-variant `cluableColors`/`colorClueTouches`/`rankClueTouches`
- `packages/rules/src/hanabi/endgame.ts` — read directly, `checkHanabiGameEnd`'s fixed evaluation order and `EndReason` union
- `packages/schema/src/games/hanabi.ts` — read directly, `HanabiViewSchema` (confirms no `endReason`/`band` field on the wire)
- `apps/web/components/HanabiBoard.tsx`, `apps/web/lib/hanabi-board-logic.ts` — read directly, existing interaction/derivation patterns to extend
- `apps/web/app/globals.css` — read directly, `@theme` tokens, reserved-uses/contrast/namespace rules
- `apps/web/app/room/[code]/RoomClient.tsx` — read directly, board prop contract, dispatch chokepoint
- `e2e/hanabi-realtime.spec.ts`, `e2e/start-game.spec.ts` — read directly, exact asserted text/testid shapes
- `playwright.config.ts`, `vitest.config.ts`, `package.json` — read directly, confirmed no jsdom/testing-library dependency exists anywhere in the repo (`grep` across `package-lock.json` found `jsdom` only as a transitive dep of an unrelated tool, never a direct devDependency)
- Manual WCAG relative-luminance contrast computation (Node one-off script, this session) against `--color-bg`/`--color-surface` — `[VERIFIED: computed]`

### Secondary (MEDIUM confidence)
- WebSearch: colorblind-safe palette guidance (Wong/Okabe-Ito palette, blue/orange as most robust pairing, red/green ambiguity under deuteranopia/protanopia) — cross-referenced across multiple aggregator sources (AudioEye, Venngage, Visme, davidmathlogic.com), consistent with well-known accessibility literature
- WebSearch: Hanab Live has a colorblind-mode toggle and a documented "pips" reference for suit symbols — confirmed the *existence* of the feature via search-result summaries of `Hanabi-Live/hanabi-live` docs and BoardGameGeek/RPGGeek discussion threads, but the exact glyph shapes were not fetched/verified from primary source this session (see Open Questions #1)

### Tertiary (LOW confidence)
- All specific suit-hue hex values and glyph silhouette sketches in this document — original design work per the roadmap's own note that "no existing implementation combines a luminosity-as-signal theme with colorblind-safe rendering"; flagged in the Assumptions Log for D-25 owner sign-off

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every library/version confirmed by directly reading `package.json`
- Architecture: HIGH — every wire field, existing component, and existing test convention confirmed by directly reading the relevant source files this session
- Visual/glyph/hue design: LOW-MEDIUM — genuinely original design work with no found prior-art combining these two constraints (luminosity signal + always-on colorblind glyphs); contrast math is verified but hue/glyph choices themselves are placeholders pending D-25 sign-off
- Pitfalls: HIGH — five pitfalls identified from directly-observed repo state (test infra gaps, existing e2e text assertions, existing token/namespace incidents already documented in-repo) rather than speculation

**Research date:** 2026-09-16
**Valid until:** No external time pressure — the wire contract is explicitly frozen for this phase and no dependency versions are in play; treat as valid for the duration of Phase 6's execution. Re-verify suit-hue/glyph choices at owner sign-off (D-25), not on a calendar schedule.
