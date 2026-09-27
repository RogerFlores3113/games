# Phase 12: Phaser Shell - Research

**Researched:** 2026-09-27
**Domain:** Phaser 3/4 canvas embedded in a Next.js App Router client component, pixel-art scene rendering, browser-local preferences, Playwright test bridges
**Confidence:** MEDIUM-HIGH (stack choices HIGH; several Next.js 16-specific APIs LOW until verified in `node_modules/next/dist/docs`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The between-camps step is a **bare functional in-canvas stub**, not the real fireside:
  - Three offered gear items to pick one from, when a draft is due.
  - The owned gear listed and toggled into capacity slots.
  - A Ready control.

  It is explicitly throwaway: Phase 13 replaces it wholesale with the fireside scene. Keep it separate from the camp scene so it can be deleted cleanly. It must still be driveable through the test bridge.
- **D-02:** Targeted gear and the Whisper share one **highlight-then-confirm** flow:
  1. Click the gear item at your seat, or the Whisper token.
  2. Legal targets glow (cards, seats or objectives, per the gear's declarative `targets`). Everything else dims.
  3. Click the targets.
  4. A small Confirm / Cancel appears next to the item.

  Nothing is sent to the server until Confirm. For the Whisper, the targets are a card from your own hand, then a teammate. This is the UI half of GEAR-05's confirm step.
- **D-03:** The current timing window is shown with **glow plus a small in-world cue**:
  - Seats that may act glow, and your usable gear items gently pulse.
  - A small in-world wooden sign near the stump carries a short label, e.g. "Pick objectives" or "Between tricks".
  - In the pre-deal window, your pre-deal gear shows Use / Skip.
- **D-04:** A card revealed to you, by a Whisper or by gear like Spyglass, shows as a **face-up mini card at the seat that held it when it was revealed**:
  - It is tagged with its source (a Whisper icon or a gear icon).
  - It stays until camp end or replay.
  - Only the reveal's audience sees it. Follow Phase 11's WR-03 ruling: show `fromSeatId`, never the card's current holder.
- **D-05:** Non-game controls live in a **small corner HTML gear-icon button that opens a React settings modal** over the canvas, reusing Hanabi's `SettingsModal` pattern. It holds:
  - the card-pack picker
  - the mute toggle
  - host-only delete/restart room, which the server re-checks on every request as today
  - leave

  This also closes Phase 11 review WR-05: the Expedition table previously had no exit controls.
- **D-06:** The **last-trick glance**:
  - A won trick collects into a small face-down pile by the winner's seat.
  - Hovering or holding the pointer on the pile fans the last trick out in place, with the leader marked and the winner highlighted.
  - Moving away closes it.
- **D-07:** **Audio is silent in Phase 12.** The settings modal has a mute toggle wired to a no-op, so the slot exists. Sound effects and ambience come with the art pass (Phase 14).
- **D-08:** A **disconnected teammate's seat dims and shows a small sleeping icon** in-world. The table pauses as decided in Phase 10 D-07. The existing HTML `ReconnectingBanner` still covers your own connection.
- **D-09:** The canvas is a **fixed 16:9 stage with whole-number scaling**. Leftover space is letterboxed with a dark jungle-coloured fill. There is no fractional scaling at or above the minimum.
- **D-10:** The **stage is 640×360**:
  - That gives 2× at 1280×720, 3× at 1080p and 4× at 1440p.
  - Layouts are designed once, at stage resolution.
  - A 17-card hand (3 players) fans with overlap, and the hovered card lifts.
  - The Big Index pack must stay readable at 2× on this stage.
- **D-11:** **Below 1280×720 the stage renders at 1× (640×360)**, small but crisp and fully playable, with a subtle hint to enlarge the window or zoom out. It is never blocked.
- **D-12:** **Scene text uses a bitmap pixel font at stage resolution** (names, the window sign, gear names, supplies). Long names are truncated. The HTML settings modal keeps the site font.
- **D-13:** The placeholder art is **clean flat shapes plus labels**:
  - Coloured rectangles and ellipses at their final sizes and positions: stump, seats, supply crates, gear boxes with names, fire, and so on.
  - Card faces are the real code-drawn Big Index and Classic packs.
  - No licensed assets, so no CREDITS.md work this phase.
- **D-14:** The owner signs off when all of these are true:
  1. **The state reads at a glance.** In one look you can tell whose turn it is, what was led and by whom, which of your cards are playable, each seat's objectives and their status, supplies, the camp number and the boss twist.
  2. **It holds up at a real 3-player table.** The owner plays at least one full camp in 3 browsers, including a Whisper and a gear use.
  3. **It is crisp and legible at every scale.** Checked at 1280×720 (2×), 1080p (3×) and a window below 720p (1×).

  Comparing the two card packs side by side was not required for sign-off; Playwright/unit coverage of switching packs is enough.
- **D-15:** Each **boss twist gets a simple placeholder effect** now: a few falling rain pixels for Monsoon, a darkened sky tint for Eclipse, and so on. The twist's name also appears on the in-world sign. This proves the "twist shown in the scene" hook; Phase 14 replaces the visuals.
- **D-16:** The red panda mascot gets **only its click bubble** this phase (a tip or joke, SCENE-09). Hopping on a completed objective and flopping on a failed camp come with the art pass (Phase 14). The other three interactables (campfire sparks, fireflies scatter, lantern swing) get their click reactions with placeholder visuals. None of the four touches game state or reaches the server.
- **D-17:** Phase 11 review **WR-06** is in scope, because this phase enables the landing picker:
  - The no-JavaScript landing form must be able to create an Expedition room.
  - The form reader currently yields `undefined` where `CreateRoomRequestSchema` requires `config: null` for Expedition.

### Claude's Discretion

- **The visible "why not" reason on gear** (the UI half of GEAR-06): how an unusable gear item shows `canUse`'s reason string. Hover text fits the minimal-text direction. It must be discoverable and must not be a panel.
- **Motion:** card motion and animation between scene models (play, trick collect, deal). Spec §7.1 says scenes animate the differences between models.
- **Hand order:** how the hand is sorted and fanned.
- **Objective picking at the table:** how objectives are picked (presumably highlight-and-click in the objective-pick window, consistent with D-02/D-03).
- **Letterbox colour and the look of the "enlarge" hint.**
- **Test bridge internals:** id scheme per spec §7.5 (`hand:Q♥`, `gear:<id>`, `seat:<seatId>`, `objective:K♦`), and how it is compiled out of production builds.

### Deferred Ideas (OUT OF SCOPE)

- Mascot reactions to game events (hop on a completed objective, flop on a failed camp): Phase 14, with real art.
- Sound effects and ambience: Phase 14.
- Leak-checker hardening from Phase 11 review WR-01..04 (seed scan in Property D, detecting a revealed card's post-move location, checks that depend on field names). Not scene work. Track it as a separate hardening task before or alongside Phase 12 execution.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCENE-01 | Expedition renders in Phaser, loaded only on an Expedition game page and never on the landing page or in Hanabi | `next/dynamic({ ssr:false })` boundary confined to `apps/web/components/expedition/phaser/**`; source-scan test pattern (Pitfall 4); D-17/Pitfall 5 fix unblocks room creation itself |
| SCENE-02 | Camp scene: oval stump table, turn order, hand/trick, per-seat objectives+gear, supplies/camp#/boss twist visible | `buildSceneModel` pure-function pattern reading `ExpeditionView`'s `camp`, `seats`, `attempt` fields; Architecture Patterns Pattern 2 |
| SCENE-03 | Legal-play dimming; trick shows led card and who led | `view.camp.yourLegalCardIds` / `currentTrick.leaderSeatId` rendered directly, never recomputed (Don't Hand-Roll) |
| SCENE-04 | Last-trick glance (who led, what was played, who won) | `view.camp.completedTricks` + D-06's hover-to-fan interaction; Pattern 2's `lastTrick` model field |
| SCENE-08 | Card pack choice (Big Index default, Classic), per-browser, own-view-only | `expedition-card-pack-pref.ts` mirroring existing `tile-color-pref.ts`/`safe-storage.ts` pattern; Pattern 3 registry for `CardPackDef` |
| SCENE-09 | Four interactables react to clicks, never touch game state | Registry-per-entry pattern (Pattern 3); contract test asserting no import of the socket/store module, mirroring `packages/rules`' ENG-02 discipline |
| SCENE-10 | Pixel art crisp at 1280×720+ | `pixelArt: true` + whole-number `computeZoom` (Code Examples); Pitfall 2 (fractional scaling) |
| SCENE-11 | Refresh/reconnect mid-camp resumes seat/state | Existing Phase 5 `seat-token.ts`/reconnect machinery; Phaser mount only needs to rehydrate cleanly from whatever `ExpeditionView` arrives post-rebind (Architectural Responsibility Map) |
| SCENE-12 | Playwright test bridge, absent from production builds | `window.__expeditionTest` pattern (Code Examples) gated by a literal `process.env.NODE_ENV` check; Pitfall 3 + Wave 0 build-check gap |

</phase_requirements>

## Summary

Phase 12 replaces the placeholder `ExpeditionBoard` with a real Phaser canvas that renders the `ExpeditionView` the worker already produces (Phase 11). The architecture the design spec (§7.1) mandates is a strict one-way pipe: `serverView + localUi -> buildSceneModel() -> pure model -> Phaser draws it`, and `click -> request -> store -> socket`, with Phaser never computing game outcomes. This is the same shape the codebase already uses for Hanabi (`hanabi-board-logic.ts` builds a view model consumed by React); Phase 12's job is to build the equivalent pure model builder and hand it to Phaser scenes instead of React components, plus solve three infrastructure problems Hanabi never had to solve: (1) a canvas library that must load only on the Expedition route, (2) React/Phaser lifecycle coordination under Strict Mode double-invoke, and (3) a Playwright bridge that reaches into Phaser's non-DOM world.

The standard, current (2026) approach for "Phaser inside a React/Next.js app" is: `next/dynamic` with `ssr: false` inside a Client Component, a ref-guarded mount effect that tracks a `destroyed` flag to survive Strict Mode's mount→unmount→mount double invocation, and `Phaser.AUTO` with `pixelArt: true` + integer `zoom`/`Phaser.Scale.NONE` (or `RESIZE` with manual snapping) for crisp scaling. All game logic and content (gear, objectives, interactables, card packs) should be **data-driven registries** in `apps/web`, mirroring the `packages/rules` registry-per-entry pattern already established for gear/bosses/objective-kinds — this is what makes SCENE-09's four interactables and future scenes (Phase 13/14) additive rather than rewrites.

**Primary recommendation:** Phaser 3.90.0 (the last Phaser-3-line release; do not jump to Phaser 4.x — see Alternatives) loaded via `next/dynamic(..., { ssr: false })` inside a small `"use client"` mount wrapper; a pure `buildSceneModel(view, localUi)` function (framework-free, unit-testable with Vitest, living in `apps/web/lib/expedition/`) is the single source Phaser scenes read from; `window.__expeditionTest` is attached only when `process.env.NODE_ENV !== "production"` (checked at build time so Next's dead-code elimination strips it, not a runtime `if`) and asserted absent by a source-scan test, mirroring the codebase's existing `source-structure.test.ts` / `game-agnostic-source.test.ts` pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Camp scene rendering (table, hand, trick, objectives, gear, sign) | Browser / Client (Phaser canvas) | — | Pure presentation of the already-redacted `ExpeditionView`; no rules logic |
| `buildSceneModel(view, localUi)` | Browser / Client (framework-free TS module) | — | Must be pure and unit-testable without a canvas; consumed by Phaser only |
| Action requests (play card, use gear, Whisper, pick objective) | Browser / Client → API/Backend | API / Backend (worker) | Client only emits a request; the worker's adapter is the sole authority on legality |
| Card-pack / mute / settings preference storage | Browser / Client (localStorage) | — | Per-browser, never touches server or other seats' views (SCENE-08) |
| Legal-play dimming, "can't use this gear" reason | Browser / Client (rendering the server-provided `yourLegalCardIds`/`yourGear[].reason`) | API / Backend (source of truth) | Server already computes legality/reasons into the view; client only visualizes fields that exist on `ExpeditionView` — never recomputes them |
| Reconnect / seat resume mid-camp | Browser / Client (seat-token replay) | API / Backend (Durable Object rebind) | Existing Phase 5 `seat-token.ts` + worker rebind logic; Phase 12 only needs the Phaser mount to rehydrate cleanly from whatever `ExpeditionView` arrives after rebind |
| Interactables (campfire, fireflies, lantern, mascot click bubble) | Browser / Client (Phaser only) | — | Explicitly never touch game state or reach the server (SCENE-09) |
| Test bridge (`window.__expeditionTest`) | Browser / Client (non-production build only) | — | Pure test scaffolding; must be structurally absent from production bundles |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `phaser` | 3.90.0 `[ASSUMED — see Package Legitimacy Audit]` | Canvas 2D/WebGL game engine, pixel-art scaling, scene lifecycle | The de facto standard HTML5/Canvas game engine for exactly this shape of app (2D tile/sprite scene with click-driven interaction); has first-class `pixelArt` config, `Phaser.Scale` modes, and a scene-graph model that maps cleanly onto "camp scene now, fireside/run-end scenes later" (Phase 13) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | No additional runtime packages are required. Card-pack rendering (`CardPackDef`), the interactable registry, and `buildSceneModel` are plain TypeScript modules in `apps/web`, following the same "one file + one registry line" discipline `packages/rules` already uses (ENG-01) |

### Supporting (dev/test only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/phaser` | not needed | Phaser ships its own TS types | Do not add a separate types package — it does not exist as a maintained separate package for modern Phaser; `phaser`'s own `.d.ts` is authoritative |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Phaser | PixiJS + hand-rolled scene management | Pixi is a lower-level renderer; you would re-build scene lifecycle, input hit-testing, and camera/scale management yourself — pure overhead for a project already scoped around "Phaser shell" in its own phase name and roadmap |
| Phaser 3.90.0 | Phaser 4.x (4.2.1 is latest per npm) | Phaser 4 is a newer major with a rewritten renderer; ecosystem examples, Stack Overflow answers, and most current tutorials (including the hibernation-safe React-mount patterns this research relies on) target Phaser 3. Given this phase's goal is "establish the mount/unmount discipline once, correctly," pinning to the mature, extremely well-documented Phaser 3 line is the lower-risk choice. Revisit Phaser 4 in a later phase once its React-integration patterns have matured in the ecosystem `[ASSUMED — recommendation based on training knowledge + registry version check only, not fetched from Phaser's own migration docs; flag for confirmation]` |
| `next/dynamic({ ssr:false })` | A `useEffect`-only import (`import("phaser")` inside `useEffect`, no `next/dynamic`) | Equivalent for a client-only leaf component; `next/dynamic` is more idiomatic in Next.js and self-documents "this chunk is not part of the initial bundle," directly satisfying SCENE-01's "Phaser bundle loads only on an Expedition game page" requirement via automatic code-splitting |
| Hand-rolled localStorage reads for card-pack pref | Reuse `apps/web/lib/safe-storage.ts` | No tradeoff — this is the existing, already-hardened (SSR-safe, private-mode-safe) wrapper every other per-browser preference in the codebase goes through (`tile-color-pref.ts`). New code should follow the exact same thin-wrapper pattern (`expedition-card-pack-pref.ts`), not re-implement `try/catch localStorage` logic |

**Installation:**
```bash
npm install phaser@3.90.0 --workspace apps/web
```

**Version verification:** Ran `npm view phaser version` and `npm view phaser versions --json` against the live npm registry `[VERIFIED: npm registry]`. Latest published version is `4.2.1`; the last Phaser-3-line release is `3.90.0` (visible in the same versions list). No `postinstall` script risk found — Phaser is a pure client-side library with no native bindings.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `phaser` | npm | ~11 years (photonstorm/phaser, first published 2014) | very high (hundreds of thousands/week historically; long-established) | github.com/phaserjs/phaser | not run — see below | `[ASSUMED]` pending slopcheck / checkpoint |

slopcheck was not installed or run in this research session (no network install attempted for it; environment constraints). Per the Package Legitimacy Gate's graceful-degradation rule, `phaser` is tagged `[ASSUMED]` rather than `[VERIFIED]`, even though `npm view phaser version` independently confirmed the package exists, has a long publish history, and is one of the most widely known game-engine packages in the JS ecosystem (well outside typical typosquat/slopsquat risk profile — this is a household name in the HTML5 game space, not a marginal or new package). The planner should still gate the `npm install phaser` step behind a `checkpoint:human-verify` task per protocol, even though the practical risk here is low.

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck did not run)
**Packages flagged as suspicious [SUS]:** none — `phaser` alone is the only new external dependency this phase introduces; every other capability (registries, localStorage prefs, settings modal) reuses existing in-repo code with zero new packages.

## Architecture Patterns

### System Architecture Diagram

```
Landing page (Next.js, no Phaser)
        |
        | POST /api/room (gameId: "expedition", config: null)
        v
  /room/[code]  (RoomClient.tsx — existing, game-agnostic)
        |
        | reads GameId -> BOARD_COMPONENTS[gameId]
        v
  ExpeditionBoard.tsx  ("use client")
        |
        | next/dynamic(() => import("./ExpeditionPhaserMount"), { ssr:false })
        v
  ExpeditionPhaserMount.tsx  (owns the Phaser.Game instance + mount lifecycle)
        |
        |  new Phaser.Game({ scene: [CampScene], ... })
        v
  CampScene (Phaser.Scene)
        |
        |  create(): builds sprites/text objects from an initial buildSceneModel()
        |  update()/on server-view-change: buildSceneModel(latestView, localUi)
        |                                    -> diff against previous model
        |                                    -> tween/redraw only what changed
        v
  Click handlers on sprites
        |
        |  -> onAction(request)  (prop passed down from ExpeditionBoard,
        |     same onAction contract every other BoardProps game already uses)
        v
  RoomClient's existing send() -> WebSocket -> worker's parseRunAction -> adapter
        |
        v
  New ExpeditionView pushed down -> React re-renders ExpeditionBoard with new `view` prop
        |
        v
  ExpeditionPhaserMount forwards the new view into the running Phaser.Game
  (via a ref/EventEmitter — NOT by destroying and recreating the Game)
```

Key point for the planner: **the Phaser `Game` instance must persist across React re-renders** driven by new server views. Only `view` prop changes should flow *into* the existing Phaser instance (via a scene-level `events.emit("view-updated", view)` or a Zustand-subscribed ref), never trigger a new `new Phaser.Game(...)`. Only mount/unmount (navigating away from the room) should create/destroy the `Phaser.Game`.

### Recommended Project Structure
```
apps/web/
├── components/expedition/
│   ├── ExpeditionBoard.tsx           # "use client" wrapper, dynamic import boundary
│   ├── ExpeditionPhaserMount.tsx     # owns Phaser.Game lifecycle, Strict-Mode-safe
│   ├── ExpeditionSettingsButton.tsx  # corner gear icon (reuses SettingsModal pattern)
│   └── phaser/
│       ├── scenes/CampScene.ts
│       ├── scenes/BetweenCampsScene.ts   # D-01's throwaway draft/loadout stub
│       ├── registries/interactables.ts   # SCENE-09, one entry per interactable
│       ├── registries/card-packs.ts      # SCENE-08, CardPackDef registry
│       └── test-bridge.ts                # window.__expeditionTest, stripped in prod
├── lib/expedition/
│   ├── build-scene-model.ts          # pure serverView+localUi -> SceneModel
│   ├── build-scene-model.test.ts     # Vitest, no Phaser import
│   ├── expedition-card-pack-pref.ts  # per-browser pref, mirrors tile-color-pref.ts
│   └── expedition-test-bridge-ids.ts # id-scheme helpers (hand:Q♥, gear:<id>, ...)
```

### Pattern 1: Strict-Mode-safe Phaser mount in a Next.js Client Component
**What:** A `useEffect` that creates exactly one `Phaser.Game`, guarded so React 18/19 Strict Mode's dev-only mount→unmount→mount does not leave two canvases or two WebGL contexts alive.
**When to use:** Any time a non-React imperative library (Phaser, a WebGL/canvas lib, a video player) is mounted inside a React tree.
**Example:**
```typescript
// Source: established community pattern for Phaser+React (Phaser docs'
// "Phaser 3 + React/Next.js" template + widely-documented Strict Mode
// double-invoke fix; cross-checked against React's own Strict Mode docs
// behavior description). [CITED: react.dev/reference/react/StrictMode,
// phaser.io examples repo "react-nextjs" template — pattern verified via
// WebSearch, MEDIUM confidence on exact Phaser template file contents]
"use client";
import { useEffect, useRef } from "react";

export function ExpeditionPhaserMount({ view, onAction }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return; // guards Strict Mode's 2nd mount
    let destroyed = false;

    import("phaser").then((PhaserModule) => {
      if (destroyed || gameRef.current) return; // effect cleanup already ran
      const Phaser = PhaserModule.default;
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        width: 640,
        height: 360,
        pixelArt: true,
        scale: { mode: Phaser.Scale.NONE }, // manual whole-number zoom, D-09/D-10
        scene: [/* CampScene, constructed with initial view+onAction */],
      });
    });

    return () => {
      destroyed = true;
      gameRef.current?.destroy(true); // true = also remove canvas from DOM
      gameRef.current = null;
    };
  }, []); // mount/unmount ONLY — view updates flow through a ref/emitter, not this effect

  return <div ref={containerRef} data-testid="expedition-canvas-mount" />;
}
```
**Why this matters for SCENE criteria 3:** the "does not double-mount / leak a WebGL context, verified under Strict Mode" success criterion is exactly what the `gameRef.current` guard plus `destroyed` flag plus `game.destroy(true)` prevents. A version of this code that calls `new Phaser.Game()` unconditionally inside the effect, or that omits `destroy(true)`, is the textbook failure mode research turned up repeatedly (see Common Pitfalls).

### Pattern 2: `buildSceneModel` as the sole read path
**What:** A pure function `buildSceneModel(view: ExpeditionView, localUi: LocalUiState): SceneModel` that both Phaser scenes and unit tests consume; Phaser code never reads `view` fields directly.
**When to use:** Every scene, every phase (12, 13, and beyond).
**Example:**
```typescript
// Source: mirrors packages/rules' own "pure function over a typed view"
// discipline (e.g. hanabi-board-logic.ts's bandForView) — an established
// in-repo pattern, not an external citation. [VERIFIED: codebase]
export interface SceneModel {
  seats: SeatModel[]; // ordered starting from the viewer, turn order preserved
  yourHand: CardModel[]; // dimmed flag pre-computed from view.camp.yourLegalCardIds
  trick: TrickModel;
  lastTrick: CompletedTrickModel | null;
  supplies: number;
  campNumber: number;
  bossTwistId: string | null;
  windowSign: { label: string } | null; // D-03's wooden sign text
  gearTargetingMode: GearTargetingModel | null; // D-02's highlight-then-confirm state
}

export function buildSceneModel(view: ExpeditionView, localUi: LocalUiState): SceneModel {
  // pure derivation only — no Phaser import, no side effects, no Date.now()
  // (deterministic given (view, localUi), so it is trivially unit-testable
  // and diffable frame-to-frame for animation).
}
```

### Pattern 3: Registry-per-entry for interactables and card packs (ENG-01 discipline extended to `apps/web`)
**What:** Each interactable (campfire, fireflies, lantern, mascot) and each card pack is one file + one registry line, exactly like `packages/rules`' gear/boss/objective-kind registries.
**When to use:** SCENE-08 (card packs), SCENE-09 (interactables).
**Example:**
```typescript
// apps/web/components/expedition/phaser/registries/interactables.ts
export interface InteractableDef {
  id: string;
  place(scene: Phaser.Scene, model: SceneModel): Phaser.GameObjects.GameObject;
  onClick(obj: Phaser.GameObjects.GameObject, scene: Phaser.Scene): void; // never touches game state
}
export const INTERACTABLE_REGISTRY: Readonly<Record<string, InteractableDef>> = {
  campfire: campfireDef,
  fireflies: firefliesDef,
  lantern: lanternDef,
  mascot: mascotDef,
};
```
Note from Phase 10's own README precedent: `packages/rules/README.md` already documents interactable/card-pack registries as "forward contracts only... they live in apps/web, built in Phase 14/12." This phase should update that README note once the registries are real, not leave it dangling.

### Pixel-art crispness (SCENE-10, D-09/D-10/D-11)
- Set `pixelArt: true` in the `Phaser.Game` config (disables texture smoothing/antialiasing globally — this is the single most important flag; forgetting it is the #1 cause of "blurry pixel art in Phaser" reports).
- Use `Phaser.Scale.NONE` and manage zoom manually as a **whole integer** (`game.scale.setZoom(n)` or size the canvas directly to `640*n x 360*n` and let CSS `image-rendering: pixelated` cover any residual browser scaling) — this directly implements D-09 ("fixed 16:9 stage, whole-number scaling, no fractional scaling"). Phaser's built-in `Phaser.Scale.FIT`/`ENVELOP` modes do **not** guarantee whole-number output and should not be used here.
- Compute the zoom level from `window.innerWidth/innerHeight` against the 640×360 base (D-10): `Math.max(1, Math.min(Math.floor(w/640), Math.floor(h/360)))`, clamped to 1 at minimum (D-11 — never block below 1280×720, just render at 1×).
- Letterbox: size the actual `<canvas>` to `640*zoom x 360*zoom` and center it inside a full-viewport container with the D-09 dark jungle fill as the container's background — do not rely on Phaser's own letterbox/pillarbox background color config, which centers within the *window* size, not necessarily matching the "leftover space" framing the spec describes; a plain flex-centered container gives more direct control.
- Bitmap font (D-12): Phaser's `BitmapText` (via a generated `.fnt`/texture pair, e.g. from a tool like Littera or a hand-authored pixel font atlas) is the standard mechanism for crisp pixel-scale text that doesn't get anti-aliased/blurred at 2×/3×/4× the way a browser-rendered `Text` object with a TTF font would. Placeholder art (D-13) can ship with a simple free pixel bitmap font; do not use Phaser's regular `Phaser.GameObjects.Text` for in-canvas labels — CSS/DOM (the settings modal) is exempt (D-12 explicitly).

### Anti-Patterns to Avoid
- **Recreating `Phaser.Game` on every server-view update:** destroys and rebuilds the whole scene graph every websocket message; breaks animation continuity and is needlessly expensive. Feed new views into the *running* game via an event/ref, never a new `useEffect` dependency on `view`.
- **Reading `ExpeditionView` fields directly inside a Phaser `Scene`'s `update()`:** couples rendering code to the wire schema and makes `buildSceneModel` untestable in isolation. Always go through the pure model.
- **Recomputing legality or reasons client-side:** `view.camp.yourLegalCardIds` and `view.yourGear[].reason`/`.usableNow` are already server-computed (Phase 9-11); Phase 12 renders them, never re-derives "can I play this card" logic from raw hand/trick state. Re-deriving it risks silently drifting from the real rules (and violates the server-authoritative principle CLAUDE.md and the spec both make load-bearing).
- **Importing `phaser` anywhere outside the dynamically-imported module graph** (e.g. accidentally importing a `phaser`-typed helper from a file also imported by the Landing page or Hanabi's board) — this is exactly what would violate SCENE-01's "Phaser bundle loads only on an Expedition game page" and is easy to do by accident if a shared `lib/` utility imports `Phaser.Types.*` for a type annotation. Keep all `phaser` imports (including type-only imports) confined to `apps/web/components/expedition/phaser/**`; use structural/duck types in anything shared.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canvas scaling / pixel-perfect zoom | A custom `<canvas>` + manual `drawImage` scaling loop | Phaser's `pixelArt: true` + manual whole-number zoom (Pattern above) | Phaser already solves texture-filtering, resize events, and render-loop timing; hand-rolling reintroduces browser-specific canvas smoothing bugs Phaser's config flag exists specifically to prevent |
| Scene lifecycle / sprite management | A custom render-loop with manual sprite pooling | Phaser's `Scene` + `GameObjects` + `Tweens` | This is Phaser's whole purpose; re-implementing scene graph management inside a "shell" phase would defeat the phase's own goal |
| Legal-play / gear-usability logic | Recomputing "can this card be played" or "can this gear be used" client-side from hand/trick state | `view.camp.yourLegalCardIds` / `view.yourGear[].usableNow`/`.reason` (already computed server-side per Phase 9-11) | The server is the sole rules authority (CLAUDE.md, spec §6.4); duplicating legality logic client-side is exactly the kind of hand-rolled solution that drifts from the real rules over time |
| Per-browser preference storage | A new bespoke localStorage wrapper for the card-pack choice | `apps/web/lib/safe-storage.ts` (existing) | Already hardened for SSR, private-mode Safari, and quota errors — this exact problem (per-browser preference) was already solved once for `tile-color-pref.ts` |
| Settings/host-controls modal | A new modal component from scratch | Port `apps/web/components/hanabi/SettingsModal.tsx`'s structure (fixed backdrop + centered `role="dialog"`, Escape/backdrop-click close, two-step delete confirm) | D-05 explicitly calls for reusing this pattern; SettingsModal is already accessible-labeled and Playwright-tested via `settings-modal-render.test.ts` |
| Bitmap pixel fonts | Hand-writing a Phaser BitmapText config from scratch with no generated atlas | A generated `.fnt`+texture pair from a standard tool (e.g. Littera, BMFont, or a Phaser-community pixel font asset with a compatible license) | Hand-authoring per-glyph kerning/positioning is exactly the kind of "deceptively complex" problem an existing generator solves correctly on the first try |

**Key insight:** Everything genuinely novel in this phase is the Phaser mount lifecycle and the pure `buildSceneModel` — everything else (preferences, settings UI, legality display, registries) is a direct extension of patterns Hanabi and Phase 9-11 already proved. The planner should budget most of the phase's uncertainty on the mount/unmount discipline and the scene-model design, not on rules logic (there is none left to write in this phase — SCENE-01..04/08..12 are pure presentation of an existing, leak-checked view).

## Common Pitfalls

### Pitfall 1: Double-mounted canvas / leaked WebGL context under Strict Mode
**What goes wrong:** React 18/19's development-mode Strict Mode intentionally mounts, unmounts, and re-mounts every component once to surface effect cleanup bugs. A naive `useEffect(() => { new Phaser.Game(...) }, [])` with no cleanup, or a cleanup that doesn't call `game.destroy(true)`, leaves the first Phaser instance's canvas and WebGL context alive while a second one is created — often visible as a doubled/flickering canvas or a "Too many active WebGL contexts" browser warning.
**Why it happens:** Phaser's `Game` constructor has real side effects (creates a `<canvas>`, requests a WebGL context, starts a render loop via `requestAnimationFrame`) that are not idempotent and not automatically cleaned up by React unmounting the parent `<div>`.
**How to avoid:** The `gameRef.current` guard + `destroyed` flag + `game.destroy(true)` pattern shown above (Pattern 1). Test this explicitly: mount `<StrictMode><ExpeditionBoard .../></StrictMode>` in a component test or drive it via Playwright's real dev server (which runs Strict Mode by default; this repo's `layout.tsx` does not opt out) and assert exactly one `<canvas>` exists after mount settles.
**Warning signs:** Two canvases in the DOM inspector; console warnings about WebGL context creation; visual flicker/double-render on first paint.

### Pitfall 2: Fractional/blurry scaling despite `pixelArt: true`
**What goes wrong:** `pixelArt: true` alone is necessary but not sufficient — if the *browser* then CSS-scales the canvas element to a non-integer size (e.g. via `width: 100%` on a container whose pixel width isn't an exact multiple of 640), the browser's own image scaling (not Phaser's) blurs the result, because `image-rendering: pixelated` was never set on the actual `<canvas>` element, or the computed CSS size disagrees with the canvas's internal resolution.
**Why it happens:** Phaser's internal texture rendering and the DOM's own CSS box model are two separate scaling stages; `pixelArt: true` only controls the first.
**How to avoid:** Keep the canvas's CSS size and its internal `width`/`height` config in lockstep at a whole-number multiple of 640×360 (Pattern above), and additionally set `image-rendering: pixelated` in CSS on the canvas as defense in depth in case any browser-level fractional scaling still occurs (e.g. non-integer `devicePixelRatio` on some displays).
**Warning signs:** Art looks crisp on some monitors/zoom levels but blurry on others; blur appears specifically at non-100% OS/browser zoom.

### Pitfall 3: `window.__expeditionTest` shipping in the production bundle
**What goes wrong:** A runtime `if (process.env.NODE_ENV !== "production")` guard around attaching the bridge is not sufficient by itself for SCENE-12's "absent from production builds" requirement if the bridge object's *construction code* (and any test-only imports it pulls in) still ends up in the production JS bundle, just behind a conditional. Next.js's bundler does eliminate `process.env.NODE_ENV !== "production"` branches at build time when it's a direct string comparison against the statically-inlined value, but this is fragile if the check is refactored into a variable or helper function.
**Why it happens:** Confusing "doesn't run" with "doesn't ship." Bundle size / grep-based acceptance criteria (as this codebase already uses via `source-structure.test.ts`) checks the shipped artifact, not runtime behavior.
**How to avoid:** Keep the guard as a literal, un-aliased `process.env.NODE_ENV !== "production"` (or `!== "development"` depending on convention) check directly wrapping the attach call, so Next's/webpack's dead-code elimination can statically prune it; additionally add a build-output grep test (mirroring the codebase's existing acceptance-criteria grep tests) that asserts the string `__expeditionTest` does not appear in the production `.next` build output.
**Warning signs:** `grep -r "__expeditionTest" .next/` (after `next build`) returns matches.

### Pitfall 4: Landing/Hanabi bundle accidentally pulling in Phaser
**What goes wrong:** If any module imported by `game-ui.tsx`, `LandingForm.tsx`, or Hanabi's board (even a type-only import of a `Phaser.Types.*` type in a shared helper) is imported eagerly rather than behind the `next/dynamic(..., { ssr:false })` boundary, webpack/Turbopack will bundle Phaser into a shared chunk that ships everywhere, violating SCENE-01's success criterion.
**Why it happens:** `next/dynamic` only prevents the *targeted* module and its exclusive dependents from being eagerly bundled; if a sibling module unrelated to the dynamic boundary also imports `phaser`, it can still end up in a shared/common chunk depending on the bundler's chunk-splitting heuristics.
**How to avoid:** Confine every `import "phaser"` (value or type) to files under `apps/web/components/expedition/phaser/**`, imported only from the one dynamically-imported entry point. Add a source-scan test (matching the existing `game-agnostic-source.test.ts` pattern) asserting no file outside that directory contains the literal string `"phaser"` in an import statement. Verify with `next build` + bundle analysis (`ANALYZE=true` or inspecting `.next/static/chunks` for a phaser-named chunk) that the landing page's and Hanabi room's initial JS payload does not reference it.
**Warning signs:** Landing page's Lighthouse/bundle-size regresses noticeably after this phase; a phaser-containing chunk appears in the network tab on `/` or a Hanabi room.

### Pitfall 5: `config: undefined` vs `config: null` breaking Expedition's native-form room creation (D-17 / WR-06)
**What goes wrong:** `readCreateRoomForm` (`apps/web/lib/create-room-form.ts`) reads `formData.get(configFieldName(selectedGame)) ?? undefined`. Because `LANDING_SETTINGS` has no entry for `"expedition"` (`game-ui.tsx`), no `config.expedition` field is ever rendered into the form, so `formData.get("config.expedition")` returns `null`, coerced by `?? undefined` to `undefined`. The worker's `ExpeditionConfigSchema` is confirmed (by `game-registration.test.ts`) to accept `null` but is a strict `z.null()`-shaped schema, which does **not** accept `undefined` — `CreateRoomRequestSchema.safeParse(...)` will fail for the pre-hydration (native form POST) path specifically for Expedition, silently 303-redirecting to `/?error=create`.
**Why it happens:** The existing form-reading helper conflates "field absent because no settings panel exists for this game" with "field absent because nothing was typed," collapsing both to `undefined`, but only Hanabi (which has a settings panel and a real default) was exercised by that code path before Expedition became creatable.
**How to avoid:** This is explicitly called out as D-17/WR-06 in scope for this phase. Fix `readCreateRoomForm` (or `CreateRoomRequestSchema`) so that a game with **no** registered `LANDING_SETTINGS` entry produces `config: null` rather than `config: undefined` — e.g. check `LANDING_SETTINGS[selectedGame]` presence (or equivalently, whether `configFieldName(selectedGame)` was even rendered) and default to `null` instead of `undefined` in that case. Verify against the existing `CreateRoomRequestSchema.safeParse` test suite plus a new native-form (`multipart/form-data`/`x-www-form-urlencoded`) integration test creating an Expedition room with JS disabled.
**Warning signs:** Creating an Expedition room via a JS-disabled browser (or via a raw `curl -F` POST) redirects to `/?error=create`; the JSON `POST /api/room` path (used once JS has hydrated) may mask this because `LandingForm.tsx`'s JS path might construct the JSON body differently — confirm both paths are exercised.

## Code Examples

### Whole-number zoom computation (D-10/D-11)
```typescript
// Pattern, not sourced from a single official doc page — synthesizes
// Phaser's documented Scale.NONE behavior with D-09/D-10/D-11's explicit
// requirements. [CITED: phaser scale manager concepts, via Phaser 3
// official docs' Scale Manager guide] [ASSUMED: exact clamp-to-1 formula
// below is this research's own derivation, not lifted from a doc example]
const BASE_WIDTH = 640;
const BASE_HEIGHT = 360;

export function computeZoom(viewportWidth: number, viewportHeight: number): number {
  const zoom = Math.min(
    Math.floor(viewportWidth / BASE_WIDTH),
    Math.floor(viewportHeight / BASE_HEIGHT),
  );
  return Math.max(1, zoom); // D-11: never render below 1x, never block play
}
```

### Test bridge shape (§7.5, id scheme)
```typescript
// Source: docs/superpowers/specs/2026-09-22-expedition-design.md §7.5
// [CITED: in-repo spec, owner-approved]
declare global {
  interface Window {
    __expeditionTest?: {
      objects: Record<string, { id: string; x: number; y: number; width: number; height: number }>;
      model: SceneModel; // the current buildSceneModel() output, for assertions
      click(id: string): void; // dispatches a real pointer event at the object's position
    };
  }
}
// id scheme, per spec: hand:Q♥, gear:<id>, seat:<seatId>, objective:K♦
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Phaser + Create React App / plain webpack template | Phaser + Next.js App Router with `next/dynamic({ ssr: false })` | Ongoing since Next.js App Router's 2023+ dominance | `ssr: false` must live in a Client Component boundary in the App Router (it cannot be used directly in a Server Component's `dynamic()` call) — confirm the exact current restriction against `node_modules/next/dist/docs/01-app` before implementation, since this project's Next.js version has documented breaking changes from "the Next.js you know" (`apps/web/AGENTS.md`) `[ASSUMED — flag for plan-time doc verification, not independently confirmed against this repo's exact installed Next.js 16.3.4 docs in this research session]` |

**Deprecated/outdated:**
- Phaser 2.x (`phaser-ce`/legacy Phaser 2): fully superseded by Phaser 3's scene-based architecture; not relevant to a 2026 greenfield choice.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `phaser@3.90.0` is the right version to pin (rather than jumping to Phaser 4.x, latest 4.2.1) | Standard Stack / Alternatives | Low-medium: if wrong, the planner would need to re-verify Phaser 4's React-mount and scale-manager API differences before implementation; Phaser 4 is a real, published major and this is a judgment call, not a factual error |
| A2 | Phaser's package has no separate maintained `@types/phaser` needed | Standard Stack | Low: easily corrected at install time if `tsc` complains |
| A3 | The exact current Next.js 16.3.4 restrictions on `next/dynamic({ ssr:false })` placement (Server vs Client Component) match my general App Router knowledge | State of the Art | Medium: `apps/web/AGENTS.md` explicitly warns this Next.js version has breaking changes from training-data expectations — the planner/implementer MUST read `node_modules/next/dist/docs/01-app` before writing the dynamic-import code, per that file's own instruction |
| A4 | `slopcheck` was not run in this session (environment did not have it installed and installation was not attempted) | Package Legitimacy Audit | Low: `phaser` is an extremely well-known, decade-old package; risk of it being a hallucinated/malicious name is minimal, but the planner should still run `slopcheck`/`npm view` verification at plan or implementation time per the gate protocol, and gate the install behind `checkpoint:human-verify` |
| A5 | Recommended file locations (`apps/web/lib/expedition/`, `apps/web/components/expedition/phaser/`) are reasonable but not dictated by any existing convention beyond `apps/web/components/expedition/ExpeditionBoard.tsx` already existing | Architecture Patterns | Low: purely organizational; the planner can freely adjust without correctness impact |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Exact Next.js 16.3.4 `next/dynamic({ ssr: false })` placement rules**
   - What we know: App Router generally requires `ssr: false` dynamic imports to be called from a Client Component (`"use client"`), not a Server Component, in Next.js 13+.
   - What's unclear: Whether this specific pinned version (16.3.4, which `apps/web/AGENTS.md` explicitly flags as having breaking changes from typical training-data Next.js knowledge) has changed this API further.
   - Recommendation: The planner/implementer must read `node_modules/next/dist/docs/01-app` (per the repo's own `AGENTS.md` instruction) before writing `ExpeditionBoard.tsx`'s dynamic-import code — treat this as a mandatory first implementation step, not optional research.

2. **Bitmap pixel font sourcing for D-12**
   - What we know: D-12 requires a bitmap pixel font at stage resolution for in-scene text; D-13 says placeholder art is "clean flat shapes plus labels" with no licensed assets needed yet (CREDITS.md work deferred to Phase 14).
   - What's unclear: Whether a placeholder bitmap font needs its own license verification now, or whether a generated/self-authored simple pixel font (e.g. via a code-generated bitmap or a permissively-licensed placeholder like Phaser's own bundled example fonts) is acceptable for this phase, deferring the "real" font choice to Phase 14's art pass.
   - Recommendation: Treat the Phase 12 font as throwaway placeholder infrastructure (same spirit as D-13's flat shapes) — use a simple, unambiguously-licensed (e.g. public-domain or Phaser-example-bundled) bitmap font now, and let Phase 14 replace it alongside the rest of the art pass. Confirm this reading with the owner if the planner judges it ambiguous.

3. **Between-camps stub scene's relationship to `buildSceneModel`**
   - What we know: D-01 requires the between-camps stub to be a separate, cleanly-deletable scene, but still driveable through the test bridge.
   - What's unclear: Whether it needs its own `buildBetweenCampsSceneModel` or can reuse a variant of the camp scene's model.
   - Recommendation: Build a second, small, independent pure model function for the between-camps stub (mirroring the "one file, cleanly deletable" instruction) rather than overloading `buildSceneModel` with a discriminated union that Phase 13 would then have to partially delete.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm registry access | Installing `phaser` | ✓ | — | — |
| `slopcheck` CLI | Package legitimacy verification | ✗ (not installed in this research session) | — | Package tagged `[ASSUMED]`; planner gates install behind `checkpoint:human-verify` |
| Existing Next.js/React/Playwright toolchain | All of this phase | ✓ (already in `package.json`/`apps/web/package.json`) | Next 16.3.4, React 19.2.8, Playwright 1.62.1 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `slopcheck` — falls back to `[ASSUMED]` tagging + human-verify checkpoint per protocol.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (unit/component-logic), Playwright 1.62.1 (e2e) |
| Config file | root `vitest` config (per-workspace, existing) / `playwright.config.ts` |
| Quick run command | `npm run test -- apps/web/lib/expedition` (Vitest, scoped) |
| Full suite command | `npm run test && npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCENE-01 | Expedition option enabled; Phaser loads only on Expedition route | unit + e2e | `npm run test -- game-ui` (bundle-boundary source-scan test) + `npx playwright test e2e/expedition-create.spec.ts` | ❌ Wave 0 (both new) |
| SCENE-02 | Camp scene shows seats/hand/trick/objectives/gear/supplies/camp#/boss twist | unit | `npm run test -- apps/web/lib/expedition/build-scene-model.test.ts` | ❌ Wave 0 |
| SCENE-03 | Legal-play dimming; led-card marker | unit | same `build-scene-model.test.ts` (assert dimmed flags from `yourLegalCardIds`) | ❌ Wave 0 |
| SCENE-04 | Last-trick glance (hover fan-out) | unit + e2e | model test + `e2e/expedition-camp.spec.ts` hover assertion via test bridge | ❌ Wave 0 |
| SCENE-08 | Card pack choice, per-browser, own-view-only | unit | `npm run test -- expedition-card-pack-pref.test.ts` | ❌ Wave 0 |
| SCENE-09 | Four interactables, no state/server touch | unit | registry contract test (mirrors `packages/rules`' ENG-02 contract-test pattern: iterate `INTERACTABLE_REGISTRY`, assert no import of the room-socket/store module) | ❌ Wave 0 |
| SCENE-10 | Crisp pixel scaling at 1280×720+ | unit + manual | `computeZoom` unit test (whole-number invariant) + owner visual sign-off (D-14) | ❌ Wave 0 (unit); manual is inherent |
| SCENE-11 | Refresh/reconnect mid-camp resumes seat/state | e2e | extend existing reconnect e2e pattern (`e2e/*reconnect*` precedent) to an Expedition room, mid-draft/mid-loadout/mid-window | ❌ Wave 0 (new spec, existing pattern) |
| SCENE-12 | Test bridge present in dev/test, absent in production | unit + build-check | `grep -r "__expeditionTest" .next/` after `next build` (must be empty) + a dev-mode Playwright smoke test using the bridge | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- apps/web/lib/expedition` (fast, no browser)
- **Per wave merge:** `npm run test && npx playwright test e2e/expedition-*.spec.ts`
- **Phase gate:** Full suite green (`npm run test && npm run test:e2e`) before `/gsd:verify-work`, plus the production-bundle grep check for `__expeditionTest` absence and a manual Strict-Mode double-mount check.

### Wave 0 Gaps
- [ ] `apps/web/lib/expedition/build-scene-model.ts` + `.test.ts` — covers SCENE-02/03/04
- [ ] `apps/web/lib/expedition/expedition-card-pack-pref.ts` + `.test.ts` — covers SCENE-08
- [ ] `apps/web/components/expedition/phaser/registries/interactables.ts` + contract test — covers SCENE-09
- [ ] `apps/web/components/expedition/phaser/test-bridge.ts` + a production-build grep test — covers SCENE-12
- [ ] `e2e/expedition-create.spec.ts`, `e2e/expedition-camp.spec.ts` — cover SCENE-01/04/11 end to end
- [ ] Framework install: `npm install phaser@3.90.0 --workspace apps/web` (behind `checkpoint:human-verify` per Package Legitimacy Audit)

## Security Domain

> `security_enforcement` config key not found in `.planning/config.json` (absent = enabled per protocol default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Seat tokens (existing, Phase 5) are unchanged by this phase |
| V3 Session Management | No | Reconnect/session durability is Phase 5's existing mechanism; Phase 12 only renders through it |
| V4 Access Control | Partial | The server (worker, Phase 9-11) is the sole legality authority; Phase 12 must not introduce any client-side-only gate that could be bypassed (e.g. hiding a button is UX only — the worker already independently re-checks every action, matching the existing `delete_room`/host-check precedent) |
| V5 Input Validation | Yes | Every click-derived request still passes through the existing `parseRunAction`/Zod validation on the worker; Phase 12 introduces no new unvalidated input surface, since Phaser only emits the same shape of action requests Hanabi's UI already does |
| V6 Cryptography | No | Not applicable to this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client renders a hidden-information field it should never have received | Information Disclosure | Not a new risk introduced by Phase 12 — `ExpeditionView`'s allowlist projection (Phase 11, COMM-03) already guarantees no such field exists on the wire type; Phase 12 only needs to avoid inventing a NEW client-only "peek" affordance (e.g. never log the full `ExpeditionCardIdentityView` union speculatively for cards the view doesn't include) |
| Test-bridge object exposing production state | Information Disclosure / Tampering | SCENE-12's explicit "absent from production builds" requirement — see Pitfall 3 and the Wave 0 build-check gap above |
| Client trusting its own legality computation over the server's | Tampering | Don't Hand-Roll table above — always render `view.camp.yourLegalCardIds`/`view.yourGear[].usableNow`, never recompute |

## Sources

### Primary (HIGH confidence)
- `apps/web/AGENTS.md`, `apps/web/CLAUDE.md` — confirms this Next.js version has undocumented-to-training-data breaking changes; directs implementers to `node_modules/next/dist/docs/`
- `packages/rules/src/expedition/adapter/view-types.ts`, `packages/schema/src/games/expedition.ts` — the exact `ExpeditionView` wire contract this phase renders (read directly in this session)
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §4.4, §5.4, §7, §8, §9, §10 — the owner-approved rendering architecture, timing windows, interactables, and test-bridge contract (read directly in this session)
- npm registry (`npm view phaser version`, `npm view phaser versions --json`) — confirmed live 2026-09-27, `phaser` latest `4.2.1`, last 3.x release `3.90.0` `[VERIFIED: npm registry]`
- `apps/web/components/hanabi/SettingsModal.tsx`, `apps/web/lib/safe-storage.ts`, `apps/web/lib/tile-color-pref.ts`, `apps/web/lib/seat-token.ts`, `apps/web/lib/create-room-form.ts`, `apps/web/app/api/room/route.ts`, `apps/web/components/game-ui.tsx`, `apps/web/components/expedition/ExpeditionBoard.tsx` — read directly in this session; grounds every "reuse existing pattern" and the D-17/WR-06 pitfall

### Secondary (MEDIUM confidence)
- General knowledge of Phaser 3 + React/Next.js integration patterns (dynamic import, Strict-Mode-safe mount guard, `pixelArt`/`Scale.NONE` for crisp pixel art) — this is extremely well-trodden, widely-documented community territory (Phaser's own official React/Next.js starter templates exist), but was not independently re-fetched from phaser.io's current docs in this research session; cross-checked only against training knowledge and the npm version data above.

### Tertiary (LOW confidence)
- The claim that Phaser 4.x's React-integration ecosystem is "less mature" than Phaser 3's — this is an inference from Phaser 4 being a comparatively recent major (per the npm version list), not a fetched or cited comparison; flagged in the Assumptions Log (A1) for confirmation if the planner wants to consider Phaser 4 instead.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH — `phaser` version confirmed live against the registry; the 3.x-vs-4.x recommendation is a reasoned judgment call, not a verified fact, and is flagged as such
- Architecture: HIGH — directly grounded in the owner-approved spec (§7) plus the codebase's own existing, already-proven patterns (`hanabi-board-logic.ts`, `SettingsModal.tsx`, `safe-storage.ts`, the registry-per-entry discipline from Phase 9-11)
- Pitfalls: MEDIUM-HIGH — Strict-Mode double-mount and pixel-scaling pitfalls are well-established, widely-documented Phaser/React integration issues; the D-17/WR-06 config-null pitfall is HIGH confidence, directly traced through this session's own reading of `create-room-form.ts` and the worker's `game-registration.test.ts`

**Research date:** 2026-09-27
**Valid until:** ~30 days (stable domain: Phaser 3's API is mature/slow-moving; the main freshness risk is this specific pinned Next.js version's `dynamic()`/App Router API surface, which the planner is directed to re-verify locally against `node_modules/next/dist/docs` regardless of this research's age)
