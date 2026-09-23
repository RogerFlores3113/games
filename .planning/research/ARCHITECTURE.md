# Architecture Research: Multi-Game Rooms + Expedition Integration

**Domain:** Integrating a second, structurally different game (Expedition) into an existing single-game-hardwired room/transport layer (Cloudflare Durable Object + Next.js/Vercel, Hanabi live in production)
**Researched:** 2026-09-22
**Confidence:** HIGH on the concrete file-level integration points (read directly from the current codebase); MEDIUM on exact Expedition schema field lists (spec is a design doc, not code) and on Phaser-specific implementation details (not verified against Phaser's current API in this session — verify at implementation time)

This is not ecosystem research. `docs/superpowers/specs/2026-09-22-expedition-design.md` is the fixed, owner-approved design. This file answers *how the codebase changes* to build it, file by file, against the code as it exists today.

## 1. The multi-game room-layer change

### 1.1 Current state (why it's hardwired)

Three files currently assume exactly one game:

- `apps/worker/src/game-registration.ts` exports a single `activeGame = { adapter, viewSchema, gameId }` constant. `room-state.ts` imports it once at module scope (`const adapter = activeGame.adapter`) and every room-lifecycle function (`createEmptyRoom`, `startGame`, `applyGameAction`, `toSeatView`) closes over that one constant.
- `packages/schema/src/room.ts`'s `RoomStateSchema`/`RoomViewSchema` carry a top-level `variant: VariantSchema` field (`"base"|"rainbow"|"black"`) — Hanabi's own vocabulary, baked into the room envelope rather than the opaque `game: unknown` field Hanabi's actual state lives in.
- `packages/schema/src/constants.ts`'s `MIN_PLAYERS = 2` / `MAX_PLAYERS = 5` are imported directly by `room-state.ts`'s `joinRoom`/`startGame` as global constants, not looked up per game.
- `apps/worker/src/seat-projection.ts`'s `validateGameView` calls `activeGame.viewSchema.safeParse(view.game)` — one schema, no per-game dispatch.
- `packages/rules/src/adapter.ts`'s `GameAdapter<TState, TAction>` already generic over state/action, but `createInitialState`'s `variant: Variant` parameter and the fixed `GameEndResult = { score, reason, band? }` / `AdapterError` union are Hanabi-shaped, not generic.

The good news: `RoomState.game: z.unknown()` and `RoomState.adapterId: z.string()` are *already* game-agnostic — the persisted-state opacity boundary (FDN-01) holds. The work is almost entirely about generalizing the few fields that leaked Hanabi's specific vocabulary into the shared envelope (`variant`, `MIN_PLAYERS`/`MAX_PLAYERS`, the single `viewSchema`), plus adding a `gameId` selector that room-state.ts didn't need when there was only one game to select.

### 1.2 Game registry shape (NEW)

Replace the single `activeGame` constant with a registry map, keyed by `gameId`. Keep the file name `apps/worker/src/game-registration.ts` (it's the documented "single non-test file permitted to name a specific game" — the doc comment's invariant still holds, just for *two* games instead of one) or rename to `game-registry.ts` for clarity; either is a MODIFIED file, not a new concept.

```ts
// apps/worker/src/game-registration.ts (MODIFIED)
export interface GameRegistryEntry<TState = unknown, TConfig = unknown> {
  readonly gameId: GameId;                 // "hanabi" | "expedition"
  readonly adapter: GameAdapter<TState, unknown, TConfig, unknown, string>;
  readonly viewSchema: ZodTypeAny;         // strict per-seat wire schema
  readonly configSchema: ZodTypeAny;       // e.g. VariantSchema, or Expedition's (near-empty) config
  readonly defaultConfig: TConfig;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

export const GAME_REGISTRY: Record<GameId, GameRegistryEntry> = {
  hanabi: { gameId: "hanabi", adapter: hanabiGame, viewSchema: HanabiViewSchema,
            configSchema: VariantSchema, defaultConfig: "base", minPlayers: 2, maxPlayers: 5 },
  expedition: { gameId: "expedition", adapter: expeditionGame, viewSchema: ExpeditionViewSchema,
                configSchema: ExpeditionConfigSchema, defaultConfig: {}, minPlayers: 3, maxPlayers: 5 },
};

export function resolveGame(gameId: GameId): GameRegistryEntry {
  return GAME_REGISTRY[gameId];
}
```

`GameId` (NEW type, `packages/schema/src/room.ts` or a new `packages/schema/src/games/registry.ts`): `z.enum(["hanabi", "expedition"])`. This is the one place the two `HANABI_GAME_ID`/`EXPEDITION_GAME_ID` string constants that already live in each game's own schema module (`games/hanabi.ts`, NEW `games/expedition.ts`) get unioned into a closed enum for the room envelope.

### 1.3 Where `gameId` lives

**Persisted `RoomState`** (`packages/schema/src/room.ts`, MODIFIED): add `gameId: GameIdSchema`, and replace the top-level `variant: VariantSchema` field with a generic `config: z.unknown()` (opaque, same "FDN-01 opacity" treatment `game` already gets). `RoomViewSchema` gets the same two changes so the client can see which game/board to render and gets the opaque `config` back for its own use (Hanabi's lobby variant picker, or a future Expedition pre-run option). This is a genuine wire-shape change to the envelope's key names (`variant` → `config`, plus a new `gameId` key) — not "byte-for-byte" at the envelope level, but it does not touch Hanabi's *own* state, view, or rules — see §1.6.

**Room creation.** Today a room is created lazily: `apps/web/app/api/room/route.ts`'s `POST /api/room` only mints a room *code* (no Worker call — see its own comment citing "lazy DO creation on the host's first WebSocket connect"); the actual `RoomState` is created inside `RoomDO#onStart`'s `loadRoom` fallback, which today hardcodes `createEmptyRoom(this.name as RoomCode, "base", Date.now())`. `gameId` must be resolved by the time the room *actually* comes into existence, but the DO's `onStart` only knows the room code, not which game the host picked on the landing page.

Recommended fix, minimal-diff and consistent with the existing "apply pending choice on first join" pattern (`apps/web/lib/pending-variant.ts`, used today so `set_variant` fires once right after the host's own `joined` reply): extend the **`join`** message (not a new message type) with an optional `gameId`, and let `joinRoom` (room-state.ts, MODIFIED) resolve it **only when this is the room's very first join** (`state.seats.length === 0` and it's a new join, not a reclaim) — exactly parallel to how `hostSeatId` is already set with `state.hostSeatId ?? seatId`:

```ts
// room-state.ts joinRoom, sketch of the new branch (MODIFIED)
const isFirstJoin = state.seats.length === 0 && existing === undefined;
const gameId = isFirstJoin ? (input.gameId ?? DEFAULT_GAME_ID) : state.gameId;
const game = resolveGame(gameId);
if (!isFirstJoin && state.seats.length >= game.maxPlayers) return { ok: false, reason: "full" };
```

`createEmptyRoom`'s fallback keeps a neutral default (`hanabi`, matching today's implicit default) until the first real join overwrites it — a window invisible to anyone but the host, who is by construction the only seat that can exist at that point. This avoids inventing a new host-only `select_game` wire message and a nullable-`gameId` state altogether. `apps/web/app/api/room/route.ts` (MODIFIED) accepts `gameId` in its POST body (landing page already collects it via the `game` `<select>`); `apps/web/lib/pending-variant.ts` (MODIFIED, or a new sibling `pending-game.ts`) persists it in `localStorage` next to the pending variant so `useRoomSocket`'s `onOpen` (MODIFIED, `apps/web/lib/room-socket.ts`) can attach `gameId` to its `join` frame, mirroring exactly how it already reads/attaches `seatToken`/`joinId`.

**Wire schemas.** `packages/schema/src/messages.ts` (MODIFIED):
- `JoinMessageSchema` gains `gameId: GameIdSchema.optional()` — ignored by the server on every join after the first (T-1-04: a later joiner cannot assert or change the room's game).
- `SetVariantMessageSchema` generalizes to `SetConfigMessageSchema { type: "set_config", config: z.unknown() }`. `room-state.ts`'s `setVariant` becomes `setConfig`, validating `config` against `resolveGame(state.gameId).configSchema` before accepting it (fail closed, same discipline `validateGameView` already applies to `game`).
- `RoomViewSchema`'s `variant` field is dropped in favor of the new `config: z.unknown()` field described above.
- `ErrorDetailSchema` today mirrors Hanabi's `AdapterError` 1:1 by name. With two games, this becomes the union of both games' error vocabularies (Expedition needs its own closed set — e.g. `wrong_window`, `gear_already_used`, `invalid_target`, `not_expedition_leader`) rather than trying to force Expedition's refusals into Hanabi's clue/discard-specific names. `mapAdapterError` (room-state.ts) becomes per-game: each registry entry supplies its own `mapError(error) => ErrorDetail` function (or the switch simply gets a second exhaustive branch keyed on `state.gameId`), keeping the same "closed union, compile-time exhaustiveness, no free-text leak" discipline (D-08/D-10) for both games.

**Persisted-state schemaVersion.** `ROOM_SCHEMA_VERSION` (`packages/schema/src/constants.ts`) must bump again (it is already at 4, bumped three times previously for exactly this class of change — adapter/shape swaps). A persisted Hanabi room from before this milestone has `variant` where the new schema expects `config`+`gameId`, and will fail `RoomStateSchema.safeParse` in `persistence.ts#loadRoom` → resets to an empty lobby, per the existing D-17 policy ("a friend group can re-click a link, a corrupted mid-game state is worse"). This is the intended, already-precedented behavior — no in-place migration code is needed or wanted. Any room genuinely mid-game across a deploy of this milestone is lost; given the 24h idle-GC window and the fact that this is a deliberate, scheduled deploy (not routine churn), that is an acceptable, already-accepted cost class in this codebase.

### 1.4 Per-game config schema (replacing global `Variant`)

Hanabi's registry entry keeps `configSchema: VariantSchema`, `defaultConfig: "base"` — its lobby variant picker (`apps/web/app/page.tsx`, `Lobby.tsx`) keeps working, just reading/writing through the renamed `config` field instead of `variant`. Expedition's entry gets its own (likely near-empty in v1 — the spec defines no lobby-configurable knob beyond player count, which is derived from seats, not chosen) `ExpeditionConfigSchema = z.strictObject({})` in the new `packages/schema/src/games/expedition.ts`.

### 1.5 Per-game seat limits

`joinRoom` and `startGame` (room-state.ts, MODIFIED) stop importing `MIN_PLAYERS`/`MAX_PLAYERS` from `@games/schema` and instead read `resolveGame(state.gameId).minPlayers`/`.maxPlayers`. Hanabi's entry keeps `2`/`5` (unchanged behavior). Expedition's entry uses `3`/`5` per the spec's "3-5 players, no 2-player mode" (§2). The global constants in `constants.ts` can stay as Hanabi-specific exports (or be renamed `HANABI_MIN_PLAYERS`/`HANABI_MAX_PLAYERS` and moved into `games/hanabi.ts`) — either way, nothing outside the registry entry should read a *global* min/max again.

### 1.6 Per-game view schema validation (seat-projection.ts)

`validateGameView` (seat-projection.ts, MODIFIED) changes its one line from `activeGame.viewSchema.safeParse(view.game)` to `resolveGame(view.gameId).viewSchema.safeParse(view.game)`. This is the only change needed there — the fail-closed contract (D-07: a schema failure produces `null`, never a fallback to an unvalidated view) is untouched and applies identically to both games. `toSeatView` (room-state.ts) picks up `gameId`/`config` on the returned `RoomView` alongside its existing `game: adapter.toPlayerView(...)` call, now resolved via `resolveGame(state.gameId).adapter` instead of the module-level `adapter` constant.

### 1.7 Per-game end result

`checkGameEnd`'s return value (`GameEndResult` today) is **never inspected for its shape by the room layer** — `applyGameAction` in room-state.ts only checks `ended !== null` to flip `status` to `"ended"`; the actual result data reaches the client exclusively through `toPlayerView`'s own output (Hanabi's `HanabiViewSchema` already embeds `score`/`history` itself; nothing outside the adapter ever serializes `GameEndResult` directly). This means `GameEndResult` can be safely widened to a generic `TEndResult` type parameter on `GameAdapter` with **zero behavioral change to the room layer** — the room layer keeps not caring what shape it is. Expedition's `checkGameEnd` returns its own shape (`{ outcome: "won" | "lost", campReached: number, suppliesLeft: number }` per §6.6), embedded by its own `toPlayerView` into the view the client actually renders (e.g. the run-end scene, §7.2).

### 1.8 Hanabi byte-for-byte compatibility

"Byte-for-byte compatible" should be read as: **Hanabi's rules engine, deck construction, clue legality, view content, and test suite are untouched** (`packages/rules/src/hanabi/**` needs no code changes; its adapter continues to receive a `Variant` as its config value — only the *name* of the field carrying it in the outer envelope changes, from `state.variant` to `state.config` typed opaquely). The full existing Hanabi Vitest/Playwright suite (§8's "Sub-project 1: the full existing Hanabi unit and e2e suites pass unchanged") passes because those suites exercise `packages/rules/src/hanabi/**` and `packages/schema/src/games/hanabi.ts` in isolation — neither package changes. What *does* need test updates (expected, in-scope diff, not a regression): `apps/worker/src/room-state.test.ts`, `apps/worker/src/seat-projection.test.ts`, `packages/schema/src/room.test.ts`, `packages/schema/src/messages.test.ts` — anything asserting on the literal `variant` key in a `RoomState`/`RoomView`/`ClientMessage` fixture.

### 1.9 Landing page and lobby becoming game-aware

- `apps/web/app/page.tsx` (MODIFIED): the `<select id="game">` already exists with `hanabi` enabled and `innovation` disabled — swap `innovation` for `expedition` and enable it once Expedition's registry entry ships; POST body sends `{ displayName, gameId, config }` instead of `{ displayName, variant }`; the `isHanabi` conditional that currently gates the variant fieldset generalizes to a per-game config-fieldset lookup (Hanabi shows the variant radios; Expedition shows nothing in v1, or a future "art pack" preview).
- `apps/web/app/room/[code]/RoomClient.tsx` (MODIFIED): the final render branch currently hardcodes `<HanabiBoard view={view} .../>`. Switches on `view.gameId`: `hanabi` → `<HanabiBoard/>` (unchanged component), `expedition` → the new `<ExpeditionGame/>` (§3). `Lobby.tsx` (MODIFIED, minor) reads `view.config` instead of `view.variant` for Hanabi's in-lobby variant picker, and needs a game-aware branch if Expedition ever gets a lobby-time option (v1: it doesn't).
- `apps/web/lib/room-store.ts` needs **no changes** — `RoomStoreState.view: RoomView | null` is already fully generic; it has never known anything about Hanabi specifically.

## 2. Does `GameAdapter` need changes for Expedition?

Reading `packages/rules/src/adapter.ts`: the four-method contract (`createInitialState`, `applyAction`, `toPlayerView`, `checkGameEnd`) already fits Expedition's shape structurally — multi-phase runs, window-scoped actions, and pre-deal prompts are all just richer `TState`/`TAction` values flowing through the *same* three mutating/reading hooks, not a different control flow:

- **Multi-phase run** (draft → loadout → camp → objective-pick → tricks → fireside → next camp → … → run end): this is internal `TState` phase-machine complexity, exactly the kind of thing `applyAction`'s "validated against the phase, the seat and the rule set" (spec §6.6) already describes as living *inside* the adapter. No new adapter method is needed — the room layer never needs to know what phase the game is in; it only needs `applyAction`'s ok/error result and `toPlayerView`'s output.
- **Actions from any seat in a window** (e.g. any teammate can Whisper or use between-tricks gear before the trick leader plays): `applyAction(state, actorSeatId, request)` already takes an arbitrary `actorSeatId` per call — it was never restricted to "whoever's turn it is" at the interface level (that's a Hanabi-specific rule enforced *inside* Hanabi's own validation, not something the adapter interface bakes in). The spec's own §4.4 confirms this is a server-arrival-order thing: "The server serialises actions in arrival order" — i.e. still one action per message, applied one at a time through the same `applyAction` entrypoint; there is no need for a batched/concurrent-actor method.
- **Pre-deal prompts** (confirm/skip pre-deal gear before the camp deals): just another `request` shape (`use-gear` in the `pre-deal` window, or `skip-window`) validated the same way as any other action.

What genuinely needs widening (type-level, not structural):

1. `createInitialState(input: { seatIds, variant: Variant, seed })` — the `variant: Variant` parameter is Hanabi-shaped. Generalize to `config: TConfig` (a new generic parameter on `GameAdapter`), so Expedition's `createInitialState` receives its own (near-empty) config type instead of being forced through Hanabi's `Variant` union. Hanabi's own adapter keeps `TConfig = Variant`, so its call sites are unaffected.
2. `GameEndResult` — widen to a generic `TEndResult` (§1.7); Hanabi keeps its existing `{ score, reason, band? }` as its concrete instantiation.
3. `AdapterError` — Hanabi's nine-member closed union (`not_your_turn`, `no_clue_tokens`, `clue_touches_nothing`, …) is Hanabi-specific vocabulary baked directly into the shared interface file. Widen to a generic `TError extends string`, so Expedition can declare its own closed union (`wrong_window`, `gear_unavailable`, `invalid_target`, `objective_already_taken`, …) without inheriting or repurposing Hanabi's clue-shaped refusal names. The room layer's `mapAdapterError` becomes per-game (§1.3).

The resulting interface shape (`packages/rules/src/adapter.ts`, MODIFIED, additive defaults so Hanabi's own `hanabi/adapter.ts` needs no code change beyond its type arguments resolving to the same concrete types it already used):

```ts
export interface GameAdapter<TState, TAction, TConfig = Variant, TEndResult = GameEndResult, TError extends string = AdapterError> {
  readonly id: string;
  createInitialState(input: { seatIds: readonly string[]; config: TConfig; seed: string }): TState;
  applyAction(state: TState, actorSeatId: string, request: unknown): AdapterResult<TState, TError>;
  toPlayerView(state: TState, seatId: string): unknown;
  checkGameEnd(state: TState): TEndResult | null;
}
```

No fifth method, no new adapter-level concept (no separate "phase" or "window" method) is warranted — the spec's own engine layering (§6.1: core / rule hooks / content catalogues) is entirely internal to `packages/rules/src/expedition/`, invisible to the adapter seam, exactly as Hanabi's clue-legality/endgame internals are invisible to it today.

## 3. Where Expedition's code lives, and the data flow

### 3.1 Monorepo placement (NEW unless noted)

```
packages/rules/src/expedition/
├── state.ts              # ExpeditionState, ExpeditionAction, phase types
├── core.ts                # deck-for-player-count, legal plays, trick winner, camp/run state machines
├── hooks.ts                # rule-hook composition: base -> boss -> gear layering (§6.1)
├── toolkit.ts               # moveCard/swapCards/replaceObjective/swapObjectives/reveal/addModifier/setNextLeader/log/rng (§6.3)
├── reveals.ts                # audience-scoped reveal bookkeeping (§6.4)
├── catalogues/
│   ├── gear/*.ts                # one file per gear item (§6.2), + registry.ts
│   ├── objectives/*.ts           # ObjectiveKindDef entries, + registry.ts
│   ├── bosses/*.ts                # BossDef entries, + registry.ts
│   └── interactables/*.ts          # client-only registry entries (never reach the server — see §3.3)
├── adapter.ts                       # ExpeditionAdapter implements GameAdapter<ExpeditionState, ExpeditionAction, ExpeditionConfig, ExpeditionEndResult, ExpeditionError>
├── view.ts                           # toPlayerView, explicit field list (§6.4)
├── contract-tests.ts                  # catalogue contract test harness (§8), run against every registered entry
└── README.md                           # recipes: add gear/objective/boss/interactable/card pack/hook (§6.7)

packages/schema/src/games/expedition.ts   # ExpeditionViewSchema (strict, mirrors hanabi.ts's pattern), EXPEDITION_GAME_ID, ExpeditionConfigSchema, ExpeditionErrorDetailSchema contribution

apps/worker/src/game-registration.ts        # MODIFIED (§1.2): registers expeditionGame alongside hanabiGame

apps/web/lib/expedition/
├── build-scene-model.ts       # pure buildSceneModel(serverView, localUi) -> SceneModel (§7.1)
├── scenes/
│   ├── camp-scene.ts               # Layout B table, night jungle, objectives/loadouts/supplies (§7.2)
│   ├── fireside-scene.ts            # trail map, draft, loadout-as-backpack (§7.2)
│   └── run-end-scene.ts              # temple-reached / turned-back (§7.2)
├── card-packs/
│   ├── big-index.ts                   # default CardPackDef (§7.3)
│   ├── classic.ts                      # second CardPackDef
│   └── registry.ts
├── test-bridge.ts                        # window.__expeditionTest, compiled out of production (§7.5)
└── phaser-config.ts                       # Phaser.Game bootstrap config

apps/web/components/expedition/
├── ExpeditionGame.tsx                     # dynamic-imports Phaser, mounts canvas, wires intents -> send()
└── (any thin DOM overlay components fireside/hover-text needs, if not done in-canvas)

apps/web/public/expedition/                # art assets + CREDITS.md (§7.4)
apps/web/art/expedition/prompts/            # PixelLab prompt specs (§7.4)
apps/web/package.json                       # MODIFIED: add `phaser` dependency
```

### 3.2 Data flow: server view → store → scene model → Phaser → intent → socket

```
RoomDO#applyGameAction (room-state.ts, unchanged call shape)
    -> resolveGame(state.gameId).adapter.applyAction(gameState, actorSeatId, request)
    -> ExpeditionAdapter validates against phase/seat/rule-set (packages/rules/src/expedition/adapter.ts)
    -> new ExpeditionState persisted (room-do.ts#commit, unchanged mechanism)
    -> #pushState -> projectSeatView -> toSeatView -> resolveGame(state.gameId).adapter.toPlayerView(state, seatId)
    -> validateGameView against resolveGame(view.gameId).viewSchema (ExpeditionViewSchema)
    -> ServerMessage{type:"state", view} over the socket (unchanged wire mechanism)

apps/web/lib/room-socket.ts (unchanged mechanism)
    -> useRoomStore.applyServerMessage (unchanged, already generic: view: RoomView | null)

apps/web/app/room/[code]/RoomClient.tsx (MODIFIED, §1.9)
    -> view.gameId === "expedition" -> <ExpeditionGame view={view} onAction={...} />

apps/web/components/expedition/ExpeditionGame.tsx (NEW)
    -> dynamic import Phaser (never ships on the landing page or with Hanabi, §7.1)
    -> buildSceneModel(view.game as ExpeditionViewWire, localUi) -- pure function (NEW, apps/web/lib/expedition/build-scene-model.ts)
    -> mounted Phaser scene's update(model) diffs the previous model, drives animation and draws state (camp-scene.ts / fireside-scene.ts / run-end-scene.ts)

User click in Phaser (e.g. play a card, use gear, target a teammate)
    -> scene's input handler builds a typed intent object (never decides an outcome -- §7.1: "Phaser never decides an outcome")
    -> scene calls a prop callback (onIntent) passed down from ExpeditionGame.tsx
    -> ExpeditionGame.tsx calls the SAME send() chokepoint RoomClient.tsx already exposes to HanabiBoard:
         send({ type: "game_action", actionId: nanoid(), request: intent })
    -> apps/web/lib/room-socket.ts sends the frame over the existing partysocket connection (zero changes to the socket layer itself)
```

The load-bearing point: **no new transport, store, or socket code is needed.** `room-store.ts`, `room-socket.ts`, and the `game_action`/`state` wire messages are already fully game-agnostic; Expedition plugs into the exact same `send()` chokepoint and the exact same `RoomView.game: unknown` field Hanabi already uses. The only new "consumer" of `RoomView` is `ExpeditionGame.tsx`/`buildSceneModel`, sitting where `HanabiBoard.tsx` sits today.

### 3.3 Interactables and card packs stay purely client-side

Per spec §5.4, interactables "never change game state and never reach the server" — their registry lives entirely in `apps/web/lib/expedition/` (or even inside a catalogues subfolder there, not in `packages/rules`), since `packages/rules` must stay a pure, zero-dependency, server-authoritative package (FDN-02) and interactables are explicitly *not* part of that authoritative state. Card packs (`CardPackDef`) are likewise a rendering-only concept — `apps/web` registers them and persists the player's choice per browser (`localStorage`, same pattern as Hanabi's tile-color preference, `apps/web/lib/tile-color-pref.ts`) — they never touch `packages/rules` or the wire protocol at all.

### 3.4 Test bridge

`window.__expeditionTest` (spec §7.5) is analogous to nothing currently in the Hanabi client (Hanabi's Playwright suite drives the DOM directly since it's not canvas-rendered) — this is a genuinely new testing seam, needed because Phaser draws to a `<canvas>` that Playwright's DOM-based selectors cannot see into. It must be compiled out of production builds (a `NODE_ENV`/build-flag guard in `apps/web/lib/expedition/test-bridge.ts`, referenced only from `ExpeditionGame.tsx` behind that same guard) — this is new infrastructure, not a variation of anything existing.

## 4. Durable Object storage sizing for a run's state

Cloudflare Workers Free plan limits relevant here (from the existing `.planning/milestones/v1.0-research/ARCHITECTURE.md`'s sourced figures, unchanged for this milestone): a single stored value has a 2 MB ceiling; a single request has a 30-second CPU budget.

**Storage shape today:** `apps/worker/src/persistence.ts#saveRoom` persists the *entire* `RoomState` (including the opaque `game` field) as **one value** under the `"room"` storage key on every mutating action (write-through, no separate event log is persisted anywhere in the current codebase — `room-do.ts`'s comments describe an in-memory event-log *pattern* from the v1.0 research doc, but the shipped implementation is snapshot-only). This means Expedition's entire `ExpeditionState` — both hands, gear catalog references (ids only; gear *definitions* are code, not data), draft offers per seat, objective assignments, reveal log, loadouts, supplies/camp counters, and the seeded-RNG state — all lands inside that same single 2 MB value alongside the room envelope (seats, tokens, timers).

**Sizing estimate (HIGH confidence, order-of-magnitude only):** a 54-card deck's worth of card identities, 5 seats' hands/loadouts/draft-offers, a handful of active reveal/log entries, and a small RNG state (`sfc32`/`cyrb128`, a handful of 32-bit integers per `packages/rules/src/shuffle.ts`) is on the order of a few kilobytes as JSON — comparable to or smaller than Hanabi's own state (which the v1.0 research already characterized as "a few KB" and which has run in production without approaching the 2 MB ceiling). Even a deliberately generous bounded history (e.g. this camp's played tricks plus a short recent-event tail for UI narration) adds low single-digit KB. There is no plausible path to the 2 MB ceiling at this data model's scale — **do not persist an unbounded full-run replay log** (explicitly out of scope per spec §2, "Anything persisting across runs except the room's best-run record"); keep the existing snapshot-only persistence discipline and this stays a non-issue by construction.

**CPU sizing:** the heaviest single `applyAction` calls are deck/objective-deck shuffles and draft-offer computation at camp start — pure, allocation-light JS operations over ≤54-card arrays. The spec's own property-based simulated-run tests (§8: fast-check bots playing full 3/4/5-player runs across every boss twist) already exercise thousands of full runs in a normal CI test run in low single-digit seconds total; one request's share of that is microseconds to low milliseconds, several orders of magnitude under the 30s/request budget. No CPU risk identified.

**One real cost dimension not covered by these two limits, but worth naming for the roadmap:** Cloudflare's *daily write count* (100k requests/day, millions of row writes/month on Free — see the v1.0 research's own sourced figures) scales with *how often* `saveRoom` is called, not with payload size. Expedition's per-camp action cadence (draft picks, loadout changes, gear activations, Whispers, every trick's card plays) is plausibly *higher-frequency* than Hanabi's (a 35-45 minute run across 6 camps vs. Hanabi's ~25 minutes of clue/play/discard) — still nowhere near the free-tier ceiling at "a few friends playing occasionally" scale (the same conclusion the v1.0 research reached for Hanabi), but it is the dimension that would matter first if this app were ever played by many more groups than intended. Not a blocker; noted for completeness, not a sizing concern for the two limits this question specifically asked about.

## 5. Suggested build order

The spec's own §9 build order is the source of truth and is not being reopened. What follows makes it concrete against real files and fills in the one step the spec left undetailed (sub-project 1), checked against dependency order: the room layer must generalize *before* Expedition's adapter can be wired in (step 4 structurally depends on step 1), but Expedition's pure rules core (steps 2-3) has **no dependency on the room layer at all** — it is a zero-dependency package, so it could in principle be built in parallel with sub-project 1. The spec sequences them serially anyway (a reasonable choice for a single-developer or small-team project — avoids reviewing two large, unrelated diffs at once) and this research does not recommend deviating from that.

1. **Sub-project 1: multi-game rooms** (MODIFIED files only, no Expedition code yet — validated by Hanabi's full existing suite passing unchanged, §1.8):
   - `packages/rules/src/adapter.ts` — widen `GameAdapter` to the five-type-parameter generic (§2).
   - `packages/schema/src/room.ts`, `constants.ts` — add `GameId`, `gameId` field, `config` replacing `variant`, bump `ROOM_SCHEMA_VERSION` (§1.3).
   - `packages/schema/src/messages.ts` — `JoinMessageSchema.gameId`, `SetVariantMessageSchema` → `SetConfigMessageSchema`, `RoomViewSchema` update, `ErrorDetailSchema` widened (§1.3).
   - `apps/worker/src/game-registration.ts` — registry map + `resolveGame` (§1.2), Hanabi's entry only for now.
   - `apps/worker/src/room-state.ts`, `seat-projection.ts` — every `activeGame`/global-constant reference becomes a `resolveGame(state.gameId)`/`resolveGame(view.gameId)` call (§1.3, §1.5, §1.6).
   - `apps/web/app/api/room/route.ts`, `apps/web/app/page.tsx`, `apps/web/lib/pending-variant.ts` (or new `pending-game.ts`), `apps/web/lib/room-socket.ts`, `apps/web/app/room/[code]/RoomClient.tsx`, `Lobby.tsx` — landing page and lobby become game-aware (§1.9).
   - **Gate:** existing Hanabi Vitest + Playwright suites pass with only the expected fixture-key-rename diffs (§1.8); no behavioral change to Hanabi.

2. **Rules core** (NEW, `packages/rules/src/expedition/{state,core}.ts`): deck-for-player-count (incl. Eclipse's variant deck math), legal plays, trick winner, the camp state machine, the run state machine, objective-kind evaluation. Simulation tests per §8. Zero dependency on sub-project 1's output — can start immediately, in parallel if resourcing allows.

3. **Run layer** (NEW, `packages/rules/src/expedition/{hooks,toolkit,reveals}.ts` + `catalogues/**`): camps, supplies, replay-on-failure, capacity, draft, loadout, boss twists; the hook composition and toolkit; the v1 gear catalogue. This is the largest single unit of new logic and the one the spec's own extensibility requirement (§1, "adding gear/objective/boss/interactable is a one-file change plus a registry line") is validated against — write the catalogue contract tests (§8) alongside the first few catalogue entries, not after all of them, so the contract is exercised from the start rather than retrofitted.

4. **Adapter, schemas and worker wiring** (`packages/rules/src/expedition/adapter.ts`, `view.ts`; `packages/schema/src/games/expedition.ts`; `apps/worker/src/game-registration.ts` MODIFIED again to add Expedition's entry): per-seat views, leak checks (extending the existing Hanabi leak-check pattern per §8). This is where sub-project 1's registry seam gets its second real entry and is proven — the natural integration checkpoint before any rendering work starts.

5. **Phaser shell** (NEW, `apps/web/lib/expedition/**`, `apps/web/components/expedition/ExpeditionGame.tsx`): camp scene with placeholder art, `buildSceneModel`, card packs, test bridge, first e2e pass (create room, 3 players, draft, loadout, play a camp to completion, use gear, Whisper, refresh mid-camp and resume — per §8's E2E list). This is the first point the room-layer generalization (step 1) and the rules/adapter work (steps 2-4) are both exercised end-to-end through a real browser.

6. **Fireside and run-end scenes** (NEW, `fireside-scene.ts`, `run-end-scene.ts`): depends on step 5's scene infrastructure (Phaser bootstrap, scene-switching, `buildSceneModel` conventions) being in place.

7. **Art pass** (MODIFIED/NEW assets under `apps/web/public/expedition/`, `apps/web/art/expedition/prompts/`): PixelLab generations and CC0 packs, interactables, animations — gated on owner visual review per spec. Depends on steps 5-6 existing to have something to skin.

8. **Balance pass**: play-tests, tuning the one balance table (spec §4.3's camp ramp) in code — depends on the full loop (steps 1-6) being playable.

## Sources

- Direct reads of the current repository (HIGH confidence — this is what the code does today, not a claim about an external ecosystem): `apps/worker/src/{game-registration,room-state,room-do,seat-projection,persistence}.ts`, `packages/rules/src/adapter.ts`, `packages/schema/src/{room,messages,constants}.ts`, `packages/schema/src/games/hanabi.ts`, `apps/web/{app/page.tsx,app/api/room/route.ts,app/room/[code]/RoomClient.tsx,lib/room-store.ts,lib/room-socket.ts}`, `apps/worker/package.json`, `apps/web/package.json`.
- `docs/superpowers/specs/2026-09-22-expedition-design.md` (owner-approved 2026-09-22) — the fixed design this research integrates against; §2, §6, §7, §9 specifically cited throughout.
- `.planning/PROJECT.md` — milestone framing, the three pre-existing Hanabi-specific wirings named in "Current state", and the v2.0 Expedition requirement list.
- `.planning/milestones/v1.0-research/ARCHITECTURE.md` — prior-milestone architecture research, cited for the storage/CPU limit figures reused in §4 and for the snapshot-vs-event-log persistence pattern actually shipped.

---
*Architecture research for: multi-game room layer + Expedition integration (games.rogerflores.dev, milestone v2.0)*
*Researched: 2026-09-22*
