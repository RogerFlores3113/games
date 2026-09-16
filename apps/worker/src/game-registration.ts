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
import type { HanabiState, HanabiView } from "@games/rules";
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
import type { HanabiViewWire } from "@games/schema/games/hanabi";

export const activeGame = {
  adapter: hanabiGame,
  viewSchema: HanabiViewSchema,
  gameId: HANABI_GAME_ID,
} as const;

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
