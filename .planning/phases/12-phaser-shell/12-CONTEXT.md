# Phase 12: Phaser Shell - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Expedition becomes playable in the browser as a pixel-art camp scene in a Phaser canvas. The canvas is dynamically imported and only loads on an Expedition game page. The React mount/unmount discipline, the pixel-art config and the Playwright test bridge are set up once, correctly, before later phases add more scenes.

Delivers:
- Landing picker's Expedition option enabled and create-room working end to end (SCENE-01)
- The camp table scene (SCENE-02/03/04): seats around the oval stump in turn order, your hand at the bottom, the trick in the middle, each seat's objectives with status and its gear, supplies, camp number and boss twist, legal-play dimming, a led-card marker, and the last-trick glance
- Card packs Big Index (default) and Classic, saved per browser (SCENE-08)
- The four interactables (SCENE-09)
- Crisp pixel scaling (SCENE-10)
- Refresh/reconnect resume mid-camp (SCENE-11)
- `window.__expeditionTest` bridge, absent from production builds (SCENE-12)
- Playable, throwaway between-camps draft/loadout steps, so a full camp and run can be driven now

Requirements: SCENE-01, SCENE-02, SCENE-03, SCENE-04, SCENE-08, SCENE-09, SCENE-10, SCENE-11, SCENE-12.

Out of this phase:
- The real fireside scene with the trail map, backpack and hover-only rules text (SCENE-05). Phase 13.
- The run-end scene (SCENE-06) and the rules reference (SCENE-07). Phase 13.
- Real art, CREDITS.md and PixelLab prompts (ARTX-01..03), plus sound. Phase 14.
- Balance tuning (BAL-01). Phase 15.

</domain>

<decisions>
## Implementation Decisions

### Between-camps steps & table interaction
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

### In-game chrome & host controls
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

### Canvas fit & resolution
- **D-09:** The canvas is a **fixed 16:9 stage with whole-number scaling**. Leftover space is letterboxed with a dark jungle-coloured fill. There is no fractional scaling at or above the minimum.
- **D-10:** The **stage is 640×360**:
  - That gives 2× at 1280×720, 3× at 1080p and 4× at 1440p.
  - Layouts are designed once, at stage resolution.
  - A 17-card hand (3 players) fans with overlap, and the hovered card lifts.
  - The Big Index pack must stay readable at 2× on this stage.
- **D-11:** **Below 1280×720 the stage renders at 1× (640×360)**, small but crisp and fully playable, with a subtle hint to enlarge the window or zoom out. It is never blocked.
- **D-12:** **Scene text uses a bitmap pixel font at stage resolution** (names, the window sign, gear names, supplies). Long names are truncated. The HTML settings modal keeps the site font.

### Placeholder art & owner sign-off
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

### Carried from Phase 11
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Expedition design
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §7 (Rendering: architecture, scenes, card packs, art pipeline, test bridge) — Phaser renders only a pure `buildSceneModel(serverView, localUi)`, and input becomes requests
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §4.4 — timing windows (`pre-deal`, `objective-pick`, `between-tricks`, `passive`)
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §5.4 — the four interactables
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §6.4 — the hidden-information contract the view already enforces
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §10 — owner decisions log, including the milestone scoping decisions (mouse only, confirm step, no undo/auto-play, reveal lifetime)

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — SCENE-01..04, 08..12 (this phase); SCENE-05..07 (Phase 13); ARTX-* (Phase 14)
- `.planning/ROADMAP.md` Phase 12 section — success criteria 1–5

### Phase 11 outputs (the view this scene renders)
- `packages/rules/src/expedition/adapter/view-types.ts` — the `ExpeditionView` contract
- `packages/schema/src/games/expedition.ts` — `ExpeditionViewSchema`, the wire shape the client receives
- `.planning/phases/11-adapter-schemas-worker-wiring/11-REVIEW.md` — WR-05 (no exit controls, closed by D-05) and WR-06 (native form config, D-17)
- `.planning/phases/11-adapter-schemas-worker-wiring/11-VERIFICATION.md` — what Phase 11 proved and its caveats
- `.planning/phases/10-run-layer-gear-engine-bosses/10-CONTEXT.md` — D-07 (disconnect pauses the table), D-12/D-13 (window waiting rules)

### Next.js version note
- `apps/web/AGENTS.md` — this Next.js version has breaking changes; read `node_modules/next/dist/docs/` before writing Next code, especially for the dynamic import / client-only mount

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/components/expedition/ExpeditionBoard.tsx`: Phase 11's placeholder, registered in `BOARD_COMPONENTS` (`apps/web/components/game-ui.tsx`). Phase 12 replaces its body with the dynamically-imported Phaser mount.
- `apps/web/components/hanabi/SettingsModal.tsx` and the host-control handling in `HanabiBoard.tsx` (`delete_room`, host-only, server re-checked): the pattern for D-05.
- `apps/web/lib/tile-color-pref.ts` and `apps/web/lib/safe-storage.ts`: per-browser preference storage. The card-pack choice (SCENE-08) follows the same pattern.
- `apps/web/lib/seat-token.ts` and `apps/web/components/ReconnectingBanner.tsx`: the existing seat-token reconnect flow that SCENE-11 relies on.
- `apps/web/app/LandingForm.tsx`: the game picker, where Expedition is currently `disabled: true`.
- `e2e/*.spec.ts`, `e2e/helpers.ts` and `playwright.config.ts`: the existing Playwright harness and multi-browser room helpers.

### Established Patterns
- **Server-authoritative per-seat views.** The client only ever holds its own `ExpeditionView`. Scenes render from it; clicks become action requests.
- **Registry-per-game UI.** `BOARD_COMPONENTS` is `Record<GameId, ...>` and must stay exhaustive.
- **Zustand** holds client state (last server view plus local UI state), per the project stack. `buildSceneModel(serverView, localUi)` is pure and unit-testable.

### Integration Points
- Landing picker → `POST /api/room` (`apps/web/app/api/room/route.ts`) → `CreateRoomRequestSchema`, which already accepts `"expedition"` with `config: null`.
- Room page → `game-ui.tsx` → `ExpeditionBoard` → dynamic `import()` of the Phaser game, client-only.
- Actions go through the same room WebSocket message path as Hanabi, validated server-side by `parseRunAction`.

</code_context>

<specifics>
## Specific Ideas

- Keep the text in the world ("world-as-interface"). The only HTML chrome is the corner settings button and modal, plus the existing reconnect banner.
- The in-world wooden sign is the single place for short window or state labels (window name, boss twist name).
- The owner will judge the placeholder scene by glance-readability at a real 3-player table, not by beauty.

</specifics>

<deferred>
## Deferred Ideas

- Mascot reactions to game events (hop on a completed objective, flop on a failed camp): Phase 14, with real art.
- Sound effects and ambience: Phase 14.
- Leak-checker hardening from Phase 11 review WR-01..04 (seed scan in Property D, detecting a revealed card's post-move location, checks that depend on field names). Not scene work. Track it as a separate hardening task before or alongside Phase 12 execution.

</deferred>

---

*Phase: 12-phaser-shell*
*Context gathered: 2026-09-27*
