// The real Hanabi GameAdapter (D-01/D-03), composing every module from plans
// 01-04 behind the same five-member GameAdapter object literal
// forehead-card.ts:103 demonstrates. `toPlayerView` is the ONLY exit point
// from state — this file adds no whole-state serializer, matching
// adapter.ts's file-level invariant #3. `applyAction`/`toPlayerView`/
// `checkGameEnd` contain no logic of their own; they delegate entirely to
// actions.ts/projection.ts/endgame.ts.

import type { GameAdapter } from "../adapter";
import { applyHanabiAction } from "./actions";
import { checkHanabiGameEnd } from "./endgame";
import { dealInitialHands } from "./deck";
import { toHanabiPlayerView } from "./projection";
import { MAX_CLUE_TOKENS } from "./legality";
import { variantConfig } from "./variant";
import type { HanabiAction, HanabiState, StackEntry } from "./state";

export const hanabiGame: GameAdapter<HanabiState, HanabiAction> = {
  id: "hanabi",

  createInitialState({ seatIds, variant, seed }): HanabiState {
    const config = variantConfig(variant);
    const { hands, deck } = dealInitialHands({ config, seatIds, seed });
    const stacks: StackEntry[] = config.suits.map((suit) => ({ suit, topRank: 0 }));

    return {
      variant,
      seatIds: [...seatIds],
      turnIndex: 0,
      hands,
      deck,
      stacks,
      discard: [],
      discardOrder: [],
      clueTokens: MAX_CLUE_TOKENS,
      fuses: 0,
      finalTurnsRemaining: null,
      history: [],
    };
  },

  applyAction(state, actorSeatId, request) {
    return applyHanabiAction(state, actorSeatId, request);
  },

  toPlayerView(state, seatId) {
    return toHanabiPlayerView(state, seatId);
  },

  checkGameEnd(state) {
    return checkHanabiGameEnd(state);
  },
};
