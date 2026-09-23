// D-06 single registration point (T-02-12). This is the ONLY non-test worker
// file permitted to name a specific game — room-state.ts and seat-projection.ts
// (Plan 03 Task 2) reach the active game solely through `activeGame` below.
// Phase 4 swapped this file's two imports (and nothing else in the worker) for
// Hanabi.
//
// `activeGame.adapter` is the pure GameAdapter<HanabiState, HanabiAction>
// from `@games/rules` (zero-dependency). `activeGame.viewSchema` is the strict,
// game-namespaced Zod schema from `@games/schema/games/hanabi` that
// `seat-projection.ts` runs on every projected view before it may reach a
// socket (D-06/D-07).

import { hanabiGame } from "@games/rules";
import type { HanabiState, HanabiView, AdapterError } from "@games/rules";
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
import type { HanabiViewWire, HanabiErrorCode } from "@games/schema/games/hanabi";
import type { GameErrorDetail } from "@games/schema";

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

export const activeGame = {
  adapter: hanabiGame,
  viewSchema: HanabiViewSchema,
  gameId: HANABI_GAME_ID,
  mapError,
} as const;

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

export type ActiveGameState = HanabiState;

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
