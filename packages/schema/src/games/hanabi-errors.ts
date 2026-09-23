import { z } from "zod";

// D-07 prep: Hanabi's own closed error vocabulary. Each game supplies its
// own closed code enum — this is the per-game member that plan 08-03's
// discriminated-union `ErrorDetailSchema` (`{ gameId: "hanabi", code }`)
// consumes, replacing today's flat, single-game `ErrorDetailSchema`.
//
// Zero tolerance for free text (D-08): this stays a closed enum, never an
// unconstrained-string widening, mirroring `AdapterError`
// (`packages/rules/src/adapter.ts`) 1:1 by name so the mapping in
// `apps/worker/src/room-state.ts`'s `mapAdapterError` stays lossless.
//
// This module imports only zod — it must never import from `@games/rules`
// (packages/rules stays zero-dependency per FDN-02) or duplicate logic, only
// the closed vocabulary of names.

export const HanabiErrorCodeSchema = z.enum([
  "not_your_turn",
  "invalid_action",
  "game_over",
  "card_not_in_hand",
  "no_clue_tokens",
  "clue_touches_nothing",
  "clue_target_invalid",
  "discard_at_max_clues",
  "clue_color_not_nameable",
]);
export type HanabiErrorCode = z.infer<typeof HanabiErrorCodeSchema>;
