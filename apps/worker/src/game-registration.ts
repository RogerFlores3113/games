// D-06 single registration point (T-02-12). This is the ONLY non-test worker
// file permitted to name a specific game — room-state.ts and seat-projection.ts
// (Plan 03 Task 2) reach the active game solely through `activeGame` below.
// Phase 4 swaps this file's two imports (and nothing else in the worker) for
// Hanabi.
//
// `activeGame.adapter` is the pure GameAdapter<ForeheadCardState, ForeheadCardAction>
// from `@games/rules` (zero-dependency). `activeGame.viewSchema` is the strict,
// game-namespaced Zod schema from `@games/schema/games/forehead-card` that
// `seat-projection.ts` runs on every projected view before it may reach a
// socket (D-06/D-07).

import { foreheadCardGame } from "@games/rules";
import type { ForeheadCardState, ForeheadCardView } from "@games/rules";
import { FOREHEAD_CARD_GAME_ID, ForeheadCardViewSchema } from "@games/schema/games/forehead-card";
import type { ForeheadCardViewWire } from "@games/schema/games/forehead-card";

export const activeGame = {
  adapter: foreheadCardGame,
  viewSchema: ForeheadCardViewSchema,
  gameId: FOREHEAD_CARD_GAME_ID,
} as const;

export type ActiveGameState = ForeheadCardState;

// ---------------------------------------------------------------------------
// Compile-time contract check (no runtime cost): ForeheadCardView (the
// adapter's TS view type) must stay assignable to ForeheadCardViewWire (the
// Zod schema's inferred type), and their top-level key sets must be mutually
// assignable. A drift between the two would mean the schema silently rejects
// every view the adapter actually produces (or worse, accepts a shape the
// adapter no longer emits). Wrapped in one-element tuples to avoid
// conditional-type distribution over unions.
// ---------------------------------------------------------------------------

type _AssertViewAssignable = [ForeheadCardView] extends [ForeheadCardViewWire] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertViewAssignable: _AssertViewAssignable = true;

type _AssertKeysMutuallyAssignable = [keyof ForeheadCardView] extends [keyof ForeheadCardViewWire]
  ? [keyof ForeheadCardViewWire] extends [keyof ForeheadCardView]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertKeysMutuallyAssignable: _AssertKeysMutuallyAssignable = true;
