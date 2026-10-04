import { z } from "zod";

// D-07 prep: Expedition's own closed error vocabulary. Each game supplies its
// own closed code enum — this is the per-game member that plan 08-03's
// discriminated-union `ErrorDetailSchema` (`{ gameId: "expedition", code }`)
// consumes, mirroring Hanabi's own entry.
//
// Names mirror `RunError` (packages/rules/src/expedition/run/types.ts, itself
// `CampError | ...`) 1:1 so `mapExpeditionError` (Plan 11-06) stays lossless.
// Closed vocabulary, never free text (D-08) — this stays a closed enum,
// never an unconstrained-string widening.
//
// This module imports only zod — it must never import from the rules
// package (packages/rules stays zero-dependency per FDN-02) or duplicate
// logic, only the closed vocabulary of names.

export const ExpeditionErrorCodeSchema = z.enum([
  "not_your_turn",
  "wrong_phase",
  "camp_over",
  "card_not_in_hand",
  "must_follow_suit",
  "objective_not_available",
  "invalid_action",
  "not_a_seat",
  "run_over",
  "wrong_stage",
  "not_a_choice",
  "unknown_character",
  "character_taken",
  "not_owned_item",
  "too_many_items",
  "sold_out",
  "supplies_full",
  "upgrade_owned",
  "not_your_upgrade",
  "already_ready",
  "not_owned",
  "wrong_window",
  "ability_spent",
  "cannot_afford",
  "ability_unavailable",
  "invalid_target",
  "whisper_blocked",
  "no_whispers_left",
  "nothing_to_skip",
]);
export type ExpeditionErrorCode = z.infer<typeof ExpeditionErrorCodeSchema>;
