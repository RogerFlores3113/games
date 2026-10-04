// D-08/D-09 single registration point (T-02-12). This is the ONLY non-test
// worker file permitted to name a specific game — room-state.ts and
// seat-projection.ts reach a game's adapter/viewSchema/configSchema/limits/
// mapError/displayName solely through `resolveGame`/`GAME_REGISTRY` below,
// never by importing a game's own package directly.
//
// The production registry holds Hanabi and Expedition (D-09 fulfilled in
// Phase 11) — a third game (the test-only toy game, plan 08-07) is proven
// through the injectable `games` parameter every registry-reading function
// in room-state.ts and seat-projection.ts takes, never by widening this
// file's own registry.

import { hanabiGame, expeditionGame } from "@games/rules";
import type {
  AdapterError,
  GameAdapter,
  GameEndResult,
  HanabiAction,
  HanabiState,
  HanabiView,
  Variant,
  ExpeditionConfig,
  ExpeditionEndResult,
  ExpeditionView,
  RunAction,
  RunError,
  RunState,
} from "@games/rules";
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
import type { HanabiViewWire, HanabiErrorCode } from "@games/schema/games/hanabi";
import { EXPEDITION_GAME_ID, ExpeditionViewSchema, ExpeditionConfigSchema, ExpeditionRunStateSchema } from "@games/schema/games/expedition";
import type { ExpeditionViewWire, ExpeditionErrorCode, ExpeditionRunStateWire } from "@games/schema/games/expedition";
import { VariantSchema, type GameErrorDetail, type GameId } from "@games/schema";
import type { z } from "zod";

/** D-07: Hanabi's own error mapper — an exhaustive switch with a
 * `never`-typed default, mirroring `room-state.ts`'s (now-deleted)
 * `mapAdapterError` exactly. Every registry entry supplies its own mapper
 * like this one; none may fall back to `String(error)` or any other
 * free-text shortcut (Pitfall 3, D-08). */
function mapError(error: AdapterError): GameErrorDetail {
  switch (error) {
    case "not_your_turn":
      return { gameId: HANABI_GAME_ID, code: "not_your_turn" };
    case "invalid_action":
      return { gameId: HANABI_GAME_ID, code: "invalid_action" };
    case "game_over":
      return { gameId: HANABI_GAME_ID, code: "game_over" };
    case "card_not_in_hand":
      return { gameId: HANABI_GAME_ID, code: "card_not_in_hand" };
    case "no_clue_tokens":
      return { gameId: HANABI_GAME_ID, code: "no_clue_tokens" };
    case "clue_touches_nothing":
      return { gameId: HANABI_GAME_ID, code: "clue_touches_nothing" };
    case "clue_target_invalid":
      return { gameId: HANABI_GAME_ID, code: "clue_target_invalid" };
    case "discard_at_max_clues":
      return { gameId: HANABI_GAME_ID, code: "discard_at_max_clues" };
    case "clue_color_not_nameable":
      return { gameId: HANABI_GAME_ID, code: "clue_color_not_nameable" };
    default: {
      const exhaustiveCheck: never = error;
      throw new Error(`Unrecognized AdapterError: ${String(exhaustiveCheck)}`);
    }
  }
}

/** Expedition's own error mapper — an exhaustive switch over all 25
 * `RunError` members with a `never`-typed default, mirroring Hanabi's
 * `mapError` above exactly (D-07, D-08). No `String(error)` fallback. */
function mapExpeditionError(error: RunError): GameErrorDetail {
  switch (error) {
    case "not_your_turn":
      return { gameId: EXPEDITION_GAME_ID, code: "not_your_turn" };
    case "wrong_phase":
      return { gameId: EXPEDITION_GAME_ID, code: "wrong_phase" };
    case "camp_over":
      return { gameId: EXPEDITION_GAME_ID, code: "camp_over" };
    case "card_not_in_hand":
      return { gameId: EXPEDITION_GAME_ID, code: "card_not_in_hand" };
    case "must_follow_suit":
      return { gameId: EXPEDITION_GAME_ID, code: "must_follow_suit" };
    case "objective_not_available":
      return { gameId: EXPEDITION_GAME_ID, code: "objective_not_available" };
    case "invalid_action":
      return { gameId: EXPEDITION_GAME_ID, code: "invalid_action" };
    case "not_a_seat":
      return { gameId: EXPEDITION_GAME_ID, code: "not_a_seat" };
    case "run_over":
      return { gameId: EXPEDITION_GAME_ID, code: "run_over" };
    case "unknown_character":
      return { gameId: EXPEDITION_GAME_ID, code: "unknown_character" };
    case "character_taken":
      return { gameId: EXPEDITION_GAME_ID, code: "character_taken" };
    case "character_pending":
      return { gameId: EXPEDITION_GAME_ID, code: "character_pending" };
    case "draft_pending":
      return { gameId: EXPEDITION_GAME_ID, code: "draft_pending" };
    case "no_draft_pending":
      return { gameId: EXPEDITION_GAME_ID, code: "no_draft_pending" };
    case "not_offered":
      return { gameId: EXPEDITION_GAME_ID, code: "not_offered" };
    case "already_ready":
      return { gameId: EXPEDITION_GAME_ID, code: "already_ready" };
    case "not_owned":
      return { gameId: EXPEDITION_GAME_ID, code: "not_owned" };
    case "wrong_window":
      return { gameId: EXPEDITION_GAME_ID, code: "wrong_window" };
    case "ability_spent":
      return { gameId: EXPEDITION_GAME_ID, code: "ability_spent" };
    case "cannot_afford":
      return { gameId: EXPEDITION_GAME_ID, code: "cannot_afford" };
    case "ability_unavailable":
      return { gameId: EXPEDITION_GAME_ID, code: "ability_unavailable" };
    case "invalid_target":
      return { gameId: EXPEDITION_GAME_ID, code: "invalid_target" };
    case "whisper_blocked":
      return { gameId: EXPEDITION_GAME_ID, code: "whisper_blocked" };
    case "no_whispers_left":
      return { gameId: EXPEDITION_GAME_ID, code: "no_whispers_left" };
    case "nothing_to_skip":
      return { gameId: EXPEDITION_GAME_ID, code: "nothing_to_skip" };
    default: {
      const exhaustiveCheck: never = error;
      throw new Error(`Unrecognized RunError: ${String(exhaustiveCheck)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Compile-time contract check (no runtime cost): `AdapterError` (the
// adapter's own TS error union) and `HanabiErrorCode` (the Zod schema's
// inferred type) must stay mutually assignable, so `mapError` above can
// never silently drift from the wire's closed vocabulary.
// ---------------------------------------------------------------------------

type _AssertErrorMutuallyAssignable = [AdapterError] extends [HanabiErrorCode]
  ? [HanabiErrorCode] extends [AdapterError]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertErrorMutuallyAssignable: _AssertErrorMutuallyAssignable = true;

// ---------------------------------------------------------------------------
// Compile-time contract check (no runtime cost): HanabiView (the
// adapter's TS view type) must stay assignable to HanabiViewWire (the
// Zod schema's inferred type), and their top-level key sets must be mutually
// assignable. A drift between the two would mean the schema silently rejects
// every view the adapter actually produces (or worse, accepts a shape the
// adapter no longer emits). Wrapped in one-element tuples to avoid
// conditional-type distribution over unions.
// ---------------------------------------------------------------------------

type _AssertViewAssignable = [HanabiView] extends [HanabiViewWire] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertViewAssignable: _AssertViewAssignable = true;

type _AssertKeysMutuallyAssignable = [keyof HanabiView] extends [keyof HanabiViewWire]
  ? [keyof HanabiViewWire] extends [keyof HanabiView]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertKeysMutuallyAssignable: _AssertKeysMutuallyAssignable = true;

// ---------------------------------------------------------------------------
// Compile-time contract check (no runtime cost), Expedition's counterpart to
// the three Hanabi assertions above: `RunError` (the adapter's own TS error
// union) and `ExpeditionErrorCode` (the Zod schema's inferred type) must stay
// mutually assignable, so `mapExpeditionError` above can never silently
// drift from the wire's closed vocabulary; `ExpeditionView` (the adapter's TS
// view type) must stay assignable to `ExpeditionViewWire` (the Zod schema's
// inferred type), with mutually assignable top-level key sets.
// ---------------------------------------------------------------------------

type _AssertExpeditionErrorMutuallyAssignable = [RunError] extends [ExpeditionErrorCode]
  ? [ExpeditionErrorCode] extends [RunError]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertExpeditionErrorMutuallyAssignable: _AssertExpeditionErrorMutuallyAssignable = true;

type _AssertExpeditionViewAssignable = [ExpeditionView] extends [ExpeditionViewWire] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertExpeditionViewAssignable: _AssertExpeditionViewAssignable = true;

type _AssertExpeditionKeysMutuallyAssignable = [keyof ExpeditionView] extends [keyof ExpeditionViewWire]
  ? [keyof ExpeditionViewWire] extends [keyof ExpeditionView]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertExpeditionKeysMutuallyAssignable: _AssertExpeditionKeysMutuallyAssignable = true;

// Dev mode loads an edited RunState through ExpeditionRunStateSchema, so a
// parsed value must be a RunState, with the same top-level keys. A RunState
// redesign fails here until the schema follows it.
type _AssertRunStateParses = [ExpeditionRunStateWire] extends [RunState] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertRunStateParses: _AssertRunStateParses = true;

type _AssertRunStateKeys = [keyof RunState] extends [keyof ExpeditionRunStateWire]
  ? [keyof ExpeditionRunStateWire] extends [keyof RunState]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertRunStateKeys: _AssertRunStateKeys = true;

// ---------------------------------------------------------------------------
// The registry (D-08)
// ---------------------------------------------------------------------------

/** The type-erased shape every registry entry is stored as. `adapter` and
 * `mapError` are deliberately erased to `unknown`/`string` here — the real,
 * compile-checked typing lives at each `defineGame(...)` call site, before
 * erasure. Room-state.ts/seat-projection.ts consume only this erased shape,
 * exactly like `GameAdapter`'s own generic erasure boundary
 * (`checkGameEnd(...) !== null`, D-06). */
export interface GameRegistryEntry {
  readonly gameId: string;
  readonly displayName: string;
  readonly adapter: GameAdapter<unknown, unknown, unknown, unknown, string>;
  readonly viewSchema: z.ZodType;
  readonly configSchema: z.ZodType;
  readonly defaultConfig: unknown;
  readonly limits: { readonly min: number; readonly max: number };
  /** Dev mode only: parses a whole edited game state before the adapter's
   * `dev.check`. A game without one cannot load edited states. */
  readonly devStateSchema?: z.ZodType;
  mapError(error: string): GameErrorDetail;
}

/** Constructs a `GameRegistryEntry` from a FULLY TYPED entry — every one of
 * `adapter`'s five type parameters, `configSchema`'s inferred type, and
 * `mapError`'s parameter type are named explicitly at the call site (D-06:
 * `GameAdapter` has no default type arguments, so this cannot silently
 * re-specialize back to Hanabi's shapes). Type erasure to `GameRegistryEntry`
 * happens ONLY inside this function's return — every entry's own exhaustive
 * mapper and config typing stay fully compile-checked up to that point. */
export function defineGame<TState, TAction, TConfig, TEndResult, TError extends string>(entry: {
  gameId: string;
  displayName: string;
  adapter: GameAdapter<TState, TAction, TConfig, TEndResult, TError>;
  viewSchema: z.ZodType;
  configSchema: z.ZodType<TConfig>;
  defaultConfig: TConfig;
  limits: { min: number; max: number };
  devStateSchema?: z.ZodType<TState>;
  mapError(error: TError): GameErrorDetail;
}): GameRegistryEntry {
  return entry as unknown as GameRegistryEntry;
}

export type GameRegistry = Readonly<Record<string, GameRegistryEntry>>;

/** D-09: the PRODUCTION registry. Hanabi and Expedition, as of Phase 11
 * (D-09 fulfilled alongside `GameIdSchema`'s widening). `satisfies
 * Readonly<Record<GameId, GameRegistryEntry>>` means a future widening of
 * `GameId` without a matching entry here fails to compile. */
export const GAME_REGISTRY = Object.freeze({
  [HANABI_GAME_ID]: defineGame<HanabiState, HanabiAction, Variant, GameEndResult, AdapterError>({
    gameId: HANABI_GAME_ID,
    displayName: "Hanabi",
    adapter: hanabiGame,
    viewSchema: HanabiViewSchema,
    configSchema: VariantSchema,
    defaultConfig: "base",
    limits: { min: 2, max: 5 }, // ROOM-06, D-10
    mapError,
  }),
  [EXPEDITION_GAME_ID]: defineGame<RunState, RunAction, ExpeditionConfig, ExpeditionEndResult, RunError>({
    gameId: EXPEDITION_GAME_ID,
    displayName: "Expedition",
    adapter: expeditionGame,
    viewSchema: ExpeditionViewSchema,
    configSchema: ExpeditionConfigSchema,
    defaultConfig: null,
    limits: { min: 3, max: 5 }, // MGR-02
    devStateSchema: ExpeditionRunStateSchema,
    mapError: mapExpeditionError,
  }),
}) satisfies Readonly<Record<GameId, GameRegistryEntry>>;

/** D-03: the interim default game id. `RoomState` has no `gameId` field
 * until plan 08-05 — until then, every registry lookup in room-state.ts
 * resolves this constant through `roomGame`'s single helper, so plan 08-05's
 * re-key to `state.gameId` is a one-line change. */
export const DEFAULT_GAME_ID: GameId = HANABI_GAME_ID;

/** Resolves a game id against a registry (defaulting to the production
 * `GAME_REGISTRY`), returning `undefined` for anything not an OWN key —
 * `Object.hasOwn` guards this against `"__proto__"`/`"toString"`/any other
 * prototype-chain property ever resolving to an entry (T-8-06). An entry
 * whose own `gameId` differs from the key it is registered under also
 * resolves to `undefined` (fail closed): otherwise its mapper could emit
 * errors namespaced to another game (WR-04). */
export function resolveGame(gameId: string, games: GameRegistry = GAME_REGISTRY): GameRegistryEntry | undefined {
  const entry = Object.hasOwn(games, gameId) ? games[gameId] : undefined;
  return entry !== undefined && entry.gameId === gameId ? entry : undefined;
}

/** Test-only convenience alias: `state.game`/`view.game` are `unknown` at
 * the room layer (opaque per FDN-01) and erased to `unknown` again through
 * `GameRegistryEntry`'s type-erased `adapter`. Tests that inspect Hanabi's
 * OWN fields (never production code, which never casts `state.game`) narrow
 * with this alias instead of duplicating the concrete state type. */
export type ActiveGameState = HanabiState;
