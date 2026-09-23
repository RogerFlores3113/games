# Project Research Summary

**Project:** games.rogerflores.dev — milestone v2.0 "Expedition"
**Domain:** Multi-game generalization of an existing Cloudflare Durable Object / Next.js real-time room layer, plus a new cooperative roguelite trick-taking game (The Crew-like) rendered as pixel art in Phaser
**Researched:** 2026-09-22
**Confidence:** MEDIUM-HIGH overall — the architecture and pitfalls findings are grounded in direct reads of this repository's code and the owner-approved design spec (HIGH confidence); stack findings on Phaser are HIGH confidence (directly measured/fetched); feature-landscape findings are MEDIUM confidence (cross-genre synthesis, but the spec already resolves most open questions correctly)

## Executive Summary

Expedition is not a from-scratch product — it is two sequential engineering efforts layered onto a live, working Hanabi site. Sub-project 1 generalizes the room/transport layer (currently hardwired to one game via a single `activeGame` constant, a Hanabi-shaped `VariantSchema`, global `MIN_PLAYERS`/`MAX_PLAYERS`, and a Hanabi-shaped `GameEndResult`) into a `gameId`-keyed registry. Sub-project 2 builds Expedition itself: a framework-free rules engine (`packages/rules/src/expedition/`) implementing a layered hook system (core → boss twist → gear) with a toolkit-only state-mutation discipline, wired through the same `GameAdapter` contract Hanabi already proved out, and rendered by a dynamically-imported Phaser 4 canvas that treats the server as sole source of truth (Phaser only draws a pure `buildSceneModel` output; player input becomes requests, never local decisions). The recommended stack addition is minimal and low-risk: `phaser@4.2.1` (MIT, ~350 KB gzipped, isolated to `apps/web` via `next/dynamic({ssr:false})` so it never touches the worker or other routes), no new state-management, testing, or PRNG libraries — the existing Zustand/Vitest/fast-check/Playwright/`sfc32` stack already covers Expedition's needs by design.

The single highest-leverage risk is sub-project 1: refactoring "the one game this was built for" into "one of several games" is a persisted-state and wire-schema shape change (`variant` → `config`, plus a new `gameId` field, `ROOM_SCHEMA_VERSION` bump to 5), and the existing bar for success ("Hanabi's full test suite passes unchanged") only proves *new* rooms work under new code — it does not prove an *already-persisted* Hanabi room (created before this deploy, hibernating in a Durable Object) still deserializes correctly afterward. This is a genuinely open decision the owner must make explicitly (see Gaps below), not something research can resolve unilaterally. The second cluster of risk is entirely inside Expedition's own rules engine: trick-taking has several rule interactions (the Sun/Moon two-card-suit follow rule, trump-vs-led-suit precedence, replayed-camp state leakage of "used this camp" gear flags, objective-failure-timing, reveal/log audience scoping over time) that are individually simple but easy to get subtly wrong in the untested permutation, and are exactly the shape of bug fast-check property tests are built to catch — the design spec's own testing section (§8) already calls for this, and the research confirms it is warranted, not over-engineering.

The rendering layer carries the project's other named risk class: canvas-based UI (Phaser) trades away DOM-based Playwright locatability and accessibility that the Hanabi board gets for free, which the spec's `window.__expeditionTest` bridge (compiled out of production) correctly anticipates but which must be grown alongside every scene change, not bolted on afterward, echoing the v1.0 retrospective's "stale locators after removals" lesson in a new form. Pixel-art crispness (`pixelArt: true`, integer/DPR-aware scaling) and React/Next.js Phaser-mount discipline (Strict Mode double-invoke guards, `game.destroy(true)` on real unmount) are both well-documented, solvable problems that should be verified early (Phaser shell phase, with placeholder art) rather than discovered late during the owner-gated art review, repeating v1.0's costly "green tests, rejected visuals" pattern.

## Key Findings

### Recommended Stack

Everything in the v1.0 stack (Next.js, Cloudflare Workers + Durable Objects + `partyserver`, `packages/rules`/`packages/schema`, Zustand, `partysocket`, Vitest/fast-check/Playwright, Tailwind) is unchanged and reused. The only new dependency is Phaser, and it is scoped tightly.

**Core technologies:**
- `phaser@4.2.1` (exact pin, matching repo convention) — canvas 2D/WebGL rendering for the camp/fireside/run-end scenes. MIT licensed, zero runtime dependencies, ships ESM. Phaser 4 is the current stable major (4.0.0 shipped 2026-04-10 per npm; Phaser's own guidance is "no reason to start new projects on Phaser 3"). Installed only in `apps/web`, never `apps/worker`.
- No new PRNG library — reuse the existing `sfc32`/`cyrb128` pair in `packages/rules/src/shuffle.ts`, carried in Expedition run state, to preserve the "whole run replays deterministically from seed + action log" guarantee (§6.5 of the design spec).
- No React-Phaser binding library — the design's one-way data flow (Zustand store → `buildSceneModel` → Phaser draws; Phaser input → store action → socket) is implementable with a handful of lines using Zustand's vanilla `subscribe`/`getState` API, already a dependency.
- Bitmap fonts (`Phaser.GameObjects.BitmapText`) or pre-rendered sprite glyphs, not `Phaser.GameObjects.Text`, for card rank/suit rendering — canvas-rasterized web-font text blurs at non-1x pixel scale exactly like DOM text, undermining the pixel-art visual goal.
- Isolation pattern: `next/dynamic(() => import(...), { ssr: false })` at the leaf Expedition route component, with the actual `import("phaser")` deferred inside it — this is the only way the ~350 KB gzipped bundle stays off every other route (landing page, Hanabi board).

Art sourcing (PixelLab generations plus Kenney/OpenGameArt/itch.io CC0-or-verified packs) follows the same per-asset licence-verification discipline the project already uses for Hanabi's background photos, recorded in `apps/web/public/expedition/CREDITS.md`.

### Expected Features

The design spec is fixed and owner-approved; feature research checked it against trick-taking/roguelite genre conventions rather than reopening decisions. Most gaps found are missing *display/feedback moments* over mechanisms the spec already builds, not missing mechanics.

**Must have (table stakes, add to requirements even though not explicit in the spec):**
- Legal-play highlighting/graying on the hand (mechanism already exists via `legalPlays` hook)
- Who-led / led-suit indicator in the trick area
- Last-completed-trick glance (who led, cards played, who won) — not in the spec, low-risk addition since completed tricks are fully public data
- Camp failure "why" feedback (which objective, whose card, what condition) before the replay/fireside transition — mechanism exists (`log`/reveal), display moment needs to be explicit
- Per-objective status (pending/done/failed) always visible during play, not just on hover
- An explicit "what window is open / what can I do" signal, distinct from whose-turn-to-play — genuinely harder than a stock trick-taker because of the four timing windows (§4.4)
- Enforcement (at the view-schema level, like Hanabi's redaction) of the Whisper's "everyone sees you whispered, only target sees the card" pattern
- Other players' public loadouts visibly surfaced during camp and fireside, not just the owner's own — identity-as-differentiator only "reads" if teammates can see it

**Should have (differentiators, already specced structurally):**
- Public loadouts as visible build identity (unusual for the trick-taking genre — this is the headline differentiator)
- Boss twists as pacing/variety spikes (genre-standard cadence, provisional content per owner's own note)
- Four board interactables (campfire, fireflies, lantern, mascot) — right-sized per genre convention (3-5 is the sweet spot before clutter)
- Run failure that costs a supply and replays rather than ending the run — gentler than typical permadeath roguelites, good fit for a friend-group session

**Defer (v1.x/v2+, explicitly out of scope):**
- Auto-play/pre-select next card (BGA's The Crew convention) — conflicts with the `between-tricks` timing window and gear activation windows; players could react to information that arrives moments before their queued play commits
- Fuller multi-trick history beyond "last trick" — add only if playtesting shows a real need
- Per-gear/per-objective run statistics, full replay/spectator mode — explicitly excluded by the spec (§2) and by standing project-wide anti-features

### Architecture Approach

The multi-game generalization is smaller than it sounds because the persisted-state opacity boundary (`RoomState.game: z.unknown()`, `adapterId: string`) already holds — the work is almost entirely renaming/widening the few fields that leaked Hanabi's specific vocabulary into the shared envelope (`variant` → `config`, a new `gameId` selector, per-game `minPlayers`/`maxPlayers`, a per-game `GameEndResult`/`AdapterError` type parameter on `GameAdapter`). No new adapter method, transport, store, or socket-layer code is needed: Expedition's multi-phase run, window-scoped actions from any seat, and pre-deal prompts are all just richer `TState`/`TAction` values flowing through the same four-method `GameAdapter` contract (`createInitialState`, `applyAction`, `toPlayerView`, `checkGameEnd`) Hanabi already uses.

**Major components:**
1. **Game registry** (`apps/worker/src/game-registration.ts`, modified) — `Record<GameId, GameRegistryEntry>` replacing the single `activeGame` constant; `resolveGame(gameId)` becomes the lookup used by every room-lifecycle function that used to close over one game.
2. **Expedition rules engine** (`packages/rules/src/expedition/`, new, zero runtime dependencies) — layered as core (deck/tricks/state machines) → rule hooks (deckFor, isTrump, legalPlays, nextLeader, whisperAllowed, objectiveAssignment, failureChecks, capacity, etc., composed fresh per camp: base → boss twist → equipped gear) → content catalogues (one file per gear/objective kind/boss twist/interactable, registered by id) → a toolkit (`moveCard`, `swapCards`, `reveal`, `addModifier`, `log`, `rng`) that is the *only* way content changes state.
3. **Expedition adapter + view** (`packages/rules/src/expedition/adapter.ts`, `view.ts`; `packages/schema/src/games/expedition.ts`) — implements `GameAdapter`, builds the per-seat view from an explicit field allowlist (never a state spread), extends the existing Hanabi leak-check pattern.
4. **Phaser rendering shell** (`apps/web/lib/expedition/`, `apps/web/components/expedition/ExpeditionGame.tsx`) — `buildSceneModel(serverView, localUi)` pure function, three scenes (camp, fireside, run-end), card-pack registry, and the `window.__expeditionTest` bridge (compiled out of production) for Playwright.
5. **Landing page / lobby** (`apps/web/app/page.tsx`, `RoomClient.tsx`, `Lobby.tsx`, modified) — become game-aware, branching on `view.gameId` to render `<HanabiBoard>` or `<ExpeditionGame>`.

Storage/CPU sizing is a non-issue at this project's scale: Expedition's full run state (hands, gear references, draft offers, reveal log, RNG state) is on the order of a few KB, well under the Durable Object's 2 MB single-value ceiling and 30s CPU budget; the one dimension worth tracking on the roadmap (not a blocker) is that Expedition's per-camp action cadence is plausibly higher-frequency than Hanabi's, relevant only if usage scaled far beyond "a few friends playing occasionally."

### Critical Pitfalls

Eighteen pitfalls were catalogued; the five most consequential:

1. **Multi-game refactor breaks a live, already-persisted Hanabi room** — "Hanabi's test suite passes unchanged" proves new rooms work under new code, not that a room persisted *before* this deploy (hibernating in a Durable Object) still deserializes after the schema changes (`variant`→`config`, new `gameId` field, `ROOM_SCHEMA_VERSION` bump). This is the one pitfall in the whole document that risks the *live* product, not just new scope — avoid by testing an actual or fixture pre-refactor state snapshot against post-refactor code, not only fresh-room creation. **This has surfaced as an explicit open decision for the owner — see Gaps below.**
2. **Replayed camps leak "used this camp" gear/modifier/leader state from the failed attempt** — "once per camp" naturally gets implemented as a flag on the persistent gear-ownership record rather than scoped to the ephemeral camp *attempt*; a failed-then-replayed camp must reset every camp-scoped resource (gear-used flags, active modifiers, the Whisper) while correctly preserving owned/equipped gear across the replay.
3. **Follow-suit and trick-winner logic mishandle the Sun/Moon two-card joker suit** — trick-taking engines conventionally model "trump" as a rank-above-all flag, not a followable suit; Expedition's rule (jokers act as a real suit only when led, trump when played reactively) needs `isTrump` and `ledSuit` modeled as independent hooks and property-tested across both lead directions and all deck sizes (base and Eclipse variants), not just the one hand-tested example.
4. **Objective failure detection and reveal/log audience scoping drift from "instant" and "scoped"** — `exactly-n`/`no-tricks` objectives must be re-evaluated for every holder after every trick (not just cards touched that trick), and reveals/log entries need an explicit, deliberately-decided retention policy (persist for the rest of the camp vs. ephemeral) rather than an implicit "whatever's still in the array," extended into the leak-checker so audience correctness is checked many turns after creation, not just immediately after.
5. **Phaser/React integration and pixel-art crispness are easy to get subtly wrong** — Strict Mode double-invoke in dev needs a ref-guarded singleton plus real `destroy(true)` cleanup; `pixelArt: true` plus integer/DPR-aware scaling should be verified with placeholder art *before* the owner-gated art pass, to avoid repeating v1.0's costly "green tests, rejected visuals" cycle.

## Implications for Roadmap

Based on the design spec's own build order (§9) and the architecture/pitfalls research confirming it and filling in the one under-specified step, the suggested phase structure is:

### Phase 1: Multi-game rooms
**Rationale:** Structurally must come first — Expedition's adapter wiring (later phase) depends on the registry seam this phase establishes; this is also the single highest-risk phase since it touches the *live* Hanabi product, not just new scope.
**Delivers:** `GameId`-keyed game registry, generalized `GameAdapter` type parameters, `config`/`gameId` room-envelope fields, `ROOM_SCHEMA_VERSION` bump, game-aware landing page/lobby — Hanabi re-registered as the sole entry, behavior otherwise unchanged.
**Addresses:** No FEATURES.md items directly; this is pure infrastructure enabling everything else.
**Avoids:** Pitfall 16 (breaking live persisted Hanabi rooms) and Pitfall 17 (the registry re-specializing to exactly two hardcoded games instead of staying genuinely open) — both should be explicit gates/design-review checkpoints in this phase, not just "Hanabi suite passes."

### Phase 2: Expedition rules core
**Rationale:** Zero dependency on Phase 1's output (a pure, framework-free package) — could run in parallel, but the spec sequences it after Phase 1 for review-load reasons, which this research does not recommend deviating from.
**Delivers:** Deck-for-player-count (base and Eclipse tables), legal plays, trick winner, camp/run state machines, objective-kind evaluation — all as pure functions with fast-check simulation tests.
**Uses:** Existing `sfc32`/`cyrb128` PRNG, Vitest, fast-check.
**Implements:** The "Core" layer of the engine architecture (§6.1).
**Avoids:** Pitfalls 1, 2, 4, 5 (follow-suit, trick-winner, uneven-deck tables, objective failure timing) — all rules-core-scoped bugs that need property tests against an oracle, not just hand-written examples.

### Phase 3: Run layer (camps, gear, draft, bosses)
**Rationale:** Builds on Phase 2's core; this is the largest single unit of new logic and the one the spec's extensibility requirement is validated against.
**Delivers:** Camp ramp, supplies, replay-on-failure, capacity, draft, loadout, boss twists, the hook composition (base → boss → gear), the toolkit, and the v1 gear catalogue.
**Addresses:** FEATURES.md differentiators (public loadouts as identity, boss twist pacing) and most table-stakes items depending on camp-failure feedback.
**Avoids:** Pitfalls 3, 6, 7, 8, 9 (leader rotation/Machete, ordered-objective/gear interaction, replayed-camp state leaks, draft-offer RNG determinism, reveal/log audience persistence) — write catalogue contract tests alongside the first few catalogue entries, not after all of them.

### Phase 4: Adapter, schemas, worker wiring
**Rationale:** This is where Phase 1's registry seam gets its second real entry and is proven end-to-end at the room-layer level, before any rendering work starts.
**Delivers:** `ExpeditionAdapter` implementing `GameAdapter`, `ExpeditionViewSchema`, per-seat view construction (explicit allowlist), leak-check extension.
**Implements:** The adapter/view layer of the engine architecture (§6.6).
**Avoids:** Pitfalls 10, 11, 12 (Thick Fog objective-visibility leak via client-side-only hiding, objective/RNG-deck-order leak via a view-spread shortcut, concurrent between-tricks actions racing the window close) — all specifically about server-side validation and view construction discipline.

### Phase 5: Phaser shell
**Rationale:** First point Phase 1-4's work is exercised end-to-end through a real browser; establishes the mount/unmount and pixel-art-config discipline once, correctly, before scenes multiply the surface area.
**Delivers:** Camp scene with placeholder art, `buildSceneModel`, card packs, test bridge, first e2e pass (create room, 3 players, draft, loadout, play a camp, use gear, Whisper, refresh-and-resume).
**Uses:** `phaser@4.2.1`, dynamic import isolation, Zustand vanilla subscribe API.
**Avoids:** Pitfalls 13, 14 (Phaser double-mount/leak under Strict Mode and route transitions, pixel-art blur from default antialiasing/DPR) — set `pixelArt: true` and verify crispness now, with placeholder rectangles, not deferred to the art pass.

### Phase 6: Fireside and run-end scenes
**Rationale:** Depends on Phase 5's scene infrastructure (bootstrap, scene-switching, `buildSceneModel` conventions) being in place.
**Delivers:** Trail-map fireside scene (draft, loadout-as-backpack), run-end scene (temple reached / turned back).
**Avoids:** Pitfall 15 (canvas test bridge / accessibility scope drifting out of sync with scene changes) — treat `window.__expeditionTest` as a living contract updated in the same commit as any scene change; explicitly record the accessibility scope decision (likely "reduced relative to Hanabi, given the friend-group audience") rather than leaving it a silent gap.

### Phase 7: Art pass
**Rationale:** Gated on owner visual review per the spec; depends on Phases 5-6 existing to have something to skin.
**Delivers:** PixelLab generations, CC0/verified pixel packs, interactables, animations, `CREDITS.md` entries.
**Avoids:** Pitfall 18 (licensing traps from AI-generated or "free"-labeled assets surfacing at review time, repeating v1.0's image-sourcing replacement cycles) — verify and record licence per-asset as it's sourced, atomically with the asset addition, not batched at phase end.

### Phase 8: Balance pass
**Rationale:** Depends on the full loop (Phases 1-6) being playable.
**Delivers:** Tuned camp-ramp balance table, playtested pacing.

### Phase Ordering Rationale

- Phase 1 must precede Phase 4 (adapter wiring needs the registry seam), but Phases 2-3 (pure rules engine) have no dependency on Phase 1 at all and could in principle run in parallel with it — the spec sequences everything serially anyway for review-load reasons on what appears to be a single-developer project, and this research does not recommend deviating from that.
- Rules-engine correctness (Phases 2-3) is front-loaded before any rendering work because these bugs are cheap to fix in isolation (pure functions, no persisted-state or wire-schema impact) if caught early, but expensive if discovered after real rooms have played failed/replayed camps in production.
- Rendering (Phases 5-7) is deliberately sequenced after the adapter is proven (Phase 4) so the Phaser shell is built against a real, leak-checked view schema rather than a moving target.
- The art pass (Phase 7) is placed last among build phases, gated on owner review, mirroring v1.0's lesson that visual work needs its own reviewed checkpoint rather than being folded into engineering phases.

### Research Flags

Needs research/extra scrutiny during phase planning:
- **Phase 1 (multi-game rooms):** the schema-migration decision (reset-on-deploy vs. read-time migration, see Gaps below) needs to be resolved before this phase's implementation plan is finalized — flag for `/gsd:plan-phase --research-phase 1` or an explicit owner decision captured first.
- **Phase 3 (run layer):** the ordered-objective/Compass-reroll interaction (can a not-yet-resolved *ordered* objective be rerolled?) is an open design question the spec doesn't resolve — flag for clarification before or during this phase.
- **Phase 5 (Phaser shell):** Next.js/Phaser integration patterns (dynamic import, Strict Mode guard, pixel-art config) are well-documented externally but this is the team's first Phaser integration in this codebase — worth a research pass during planning even though the stack research here already covers the concrete pattern.

Phases with standard, already-well-documented patterns (skip deep research-phase):
- **Phase 2 (rules core):** trick-taking rules are well-understood; the risk is property-test coverage discipline, not unfamiliar technology.
- **Phase 4 (adapter/wiring):** directly mirrors Hanabi's existing, already-proven adapter pattern.
- **Phase 6 (fireside/run-end scenes):** reuses Phase 5's established scene conventions.
- **Phase 8 (balance pass):** playtesting/tuning, not a research question.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Phaser version/license/bundle-size directly measured from npm registry and package contents; Next.js integration pattern cross-checked across multiple sources; art-licensing guidance is inherently per-asset (correctly flagged low-confidence-by-design, not a research gap) |
| Features | MEDIUM | Trick-taking UX conventions are HIGH confidence (well-documented, consistent with existing Hanabi patterns); roguelite pacing and board-interactable findings are MEDIUM (synthesized from multiple community/design sources, not single primary specs); the design spec already resolves most open questions correctly, reducing the practical risk of the MEDIUM rating |
| Architecture | HIGH | File-level integration points read directly from the current codebase; exact Expedition schema field lists are MEDIUM (spec is a design doc, not code) since some field names will be finalized during implementation |
| Pitfalls | HIGH (project-specific) / MEDIUM (general Phaser/React) | Project-specific pitfalls (multi-game refactor risk, replay-state leaks, reveal-scoping) are grounded directly in `.planning/RETROSPECTIVE.md` and the approved spec; general Phaser/React/PRNG pitfalls are WebSearch-verified against official docs and issue trackers |

**Overall confidence:** HIGH on what to build and in what order; MEDIUM on some exact implementation details (schema field names, migration approach) that are appropriately left to planning/implementation rather than research.

### Gaps to Address

- **Schema migration policy for sub-project 1 (OPEN DECISION FOR THE OWNER — do not resolve during roadmap creation without explicit sign-off).** ARCHITECTURE.md recommends simply bumping `ROOM_SCHEMA_VERSION` (already at 4, moving to 5) so any old-shape persisted room fails `RoomStateSchema.safeParse` and resets to an empty lobby, per the existing, previously-used D-17 policy ("a friend group can re-click a link, a corrupted mid-game state is worse"). PITFALLS.md separately raises that a pre-refactor persisted Hanabi room must still rehydrate correctly after the multi-game refactor, given the project's core value that the game must not "lose their seat." These two findings are in tension and the choice between them changes what Phase 1 must build. The two concrete options:
  - **(a) Reset on deploy.** Accept that any Hanabi room genuinely mid-game at the moment of this deploy is lost (resets to an empty lobby on next access); mitigate by deploying when nobody is actively playing. Lowest implementation cost, matches existing precedent (D-17), but is a real (if narrow) violation of "does not lose their seat" for anyone unlucky enough to be mid-game at deploy time.
  - **(b) Read-time migration.** Write a small migration step in `persistence.ts#loadRoom` that recognizes a v4 blob (has `variant`, lacks `gameId`) and coerces it into v5 shape on read (add `gameId: "hanabi"`, move `variant` into the new `config` field). Slightly more implementation cost, but zero risk to any in-flight Hanabi game across this specific deploy.
  Recommend flagging this explicitly as a Phase 1 planning decision, not resolving it here.
- **Reveal/log retention scope (Pitfall 9).** Whether Whisper/Spyglass/Signal Flare reveals and camp-scoped log entries persist in a player's view for the rest of the camp (so they can scroll back) or are ephemeral (shown once, then gone even from the intended audience's own view) is genuinely undecided by the spec — needs an explicit design decision during Phase 3, encoded as a `revealExpiry`/`logRetention` concept in the toolkit rather than left implicit.
- **Ordered-objective + Compass interaction.** The spec doesn't explicitly forbid rerolling an objective that is already part of an `ordered` pair — flag as an open design question for Phase 3, to be resolved by the owner or defaulted to "disallowed" with an explicit `canUse` rejection if not addressed.
- **Canvas accessibility scope.** Not mentioned anywhere in spec §7/§8 — likely an acceptable tradeoff given the small friend-group audience, but should be an explicit, recorded Key Decision during Phase 5 rather than a silent gap discovered later.
- **`AdapterError`/`ErrorDetailSchema` shape: flat vs. namespaced per-game union.** ARCHITECTURE.md's sketch widens `AdapterError` to a generic `TError extends string` per game, with `mapAdapterError` becoming per-game; PITFALLS.md's Pitfall 17 separately warns that designing this (and the registry generally) around exactly two concrete games risks a structurally two-case abstraction that looks generic but isn't. Whether the shared `ErrorDetailSchema` should be a flat union of both games' error strings or a namespaced/per-game-keyed structure is an implementation choice worth deciding deliberately during Phase 1, with an eye toward a hypothetical third game, rather than defaulting to whatever the first two-game sketch produces.

## Sources

### Primary (HIGH confidence)
- Direct npm registry queries (`npm view phaser dist-tags/versions/license`) and direct download/measurement of `phaser@4.2.1`'s `dist/` output — 2026-09-22
- `phaserjs/phaser` official "Phaser 4 Pixel Art Guide" (GitHub, fetched directly) — pixelArt/smoothPixelArt/roundPixels config and bitmap-font-vs-DOM-text guidance
- PixelLab Terms of Service (pixellab.ai/termsofservice, fetched directly) — output ownership, commercial-use permission, model-training restriction
- Direct reads of this repository: `apps/worker/src/{game-registration,room-state,room-do,seat-projection,persistence}.ts`, `packages/rules/src/adapter.ts`, `packages/schema/src/{room,messages,constants}.ts`, `packages/schema/src/games/hanabi.ts`, `apps/web/{app/page.tsx,app/api/room/route.ts,app/room/[code]/RoomClient.tsx,lib/room-store.ts,lib/room-socket.ts}`
- `docs/superpowers/specs/2026-09-22-expedition-design.md` — owner-approved design spec, source of truth for all architectural and game-rule constraints
- `.planning/RETROSPECTIVE.md` and `.planning/PROJECT.md` — v1.0 lessons and standing project constraints applied to v2.0 risks
- Orchestrator-verified facts (checked directly against this codebase, 2026-09-22): `phaser@4.2.1` published 2026-04-10 (correcting STACK.md's 2026-04-30 date); `apps/worker/src/room-state.ts` has exactly one `checkGameEnd` call site (line 461); `ROOM_SCHEMA_VERSION` is 4 in `packages/schema/src/constants.ts`

### Secondary (MEDIUM confidence)
- Kenney.nl CC0 licensing — WebSearch-corroborated across multiple independent sources
- Board Game Arena (The Crew), BoardGameGeek, and Slay the Spire/Roguebook design-postmortem sources — trick-taking and roguelite genre-convention findings
- Hearthstone board-interactable design postmortems (Out of Games, Hearthstone Wiki)
- React Strict Mode double-invoke cleanup gap (facebook/react#25614) and Phaser DPR blur issue (phaserjs/phaser#3198) — official issue trackers, WebSearch-surfaced

### Tertiary (LOW confidence)
- OpenGameArt.org / itch.io per-submission licensing — inherently per-asset, no blanket claim possible; correctly flagged as "verify individually" rather than a specific fact
- General trick-taking rules-engine bug-pattern knowledge (trump-vs-led-suit conflation, RNG rejection-sampling stream divergence) — training-data-derived domain knowledge, flagged as warranting extra property-test scrutiny during implementation

---
*Research completed: 2026-09-22*
*Ready for roadmap: yes, pending the schema-migration decision (see Gaps) being made explicitly during Phase 1 planning*
