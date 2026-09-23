// D-08/D-09 single registration point (T-02-12). This is the ONLY non-test
// worker file permitted to name a specific game — room-state.ts and
// seat-projection.ts reach a game's adapter/viewSchema/configSchema/limits/
// mapError/displayName solely through `resolveGame`/`GAME_REGISTRY` below,
// never by importing a game's own package directly.
//
// The production registry holds Hanabi only in this phase (D-09) — a second
// game (the test-only toy game, plan 08-07) is proven through the injectable
// `games` parameter every registry-reading function in room-state.ts and
// seat-projection.ts takes, never by widening this file's own registry.

import { hanabiGame } from "@games/rules";
import type { AdapterError, GameAdapter, GameEndResult, HanabiAction, HanabiState, HanabiView, Variant } from "@games/rules";
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
import type { HanabiViewWire, HanabiErrorCode } from "@games/schema/games/hanabi";
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
  mapError(error: TError): GameErrorDetail;
}): GameRegistryEntry {
  return entry as unknown as GameRegistryEntry;
}

export type GameRegistry = Readonly<Record<string, GameRegistryEntry>>;

/** D-09: the PRODUCTION registry. Hanabi only in this phase — Expedition
 * joins alongside `GameIdSchema`'s widening in Phase 11. `satisfies
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
}) satisfies Readonly<Record<GameId, GameRegistryEntry>>;

/** D-03: the interim default game id. `RoomState` has no `gameId` field
 * until plan 08-05 — until then, every registry lookup in room-state.ts
 * resolves this constant through `roomGame`'s single helper, so plan 08-05's
 * re-key to `state.gameId` is a one-line change. */
export const DEFAULT_GAME_ID: GameId = HANABI_GAME_ID;

/** Resolves a game id against a registry (defaulting to the production
 * `GAME_REGISTRY`), returning `undefined` for anything not an OWN key —
 * `Object.hasOwn` guards this against `"__proto__"`/`"toString"`/any other
 * prototype-chain property ever resolving to an entry (T-8-06). */
export function resolveGame(gameId: string, games: GameRegistry = GAME_REGISTRY): GameRegistryEntry | undefined {
  return Object.hasOwn(games, gameId) ? games[gameId] : undefined;
}

/** Test-only convenience alias: `state.game`/`view.game` are `unknown` at
 * the room layer (opaque per FDN-01) and erased to `unknown` again through
 * `GameRegistryEntry`'s type-erased `adapter`. Tests that inspect Hanabi's
 * OWN fields (never production code, which never casts `state.game`) narrow
 * with this alias instead of duplicating the concrete state type. */
export type ActiveGameState = HanabiState;
