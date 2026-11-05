import type { ExpeditionView } from "@games/rules";
import type { ExpeditionErrorCode } from "@games/schema/games/expedition";
import { attemptOf } from "./view-access";
import { PROMPT_MAX_CHARS } from "./build-prompt";

/**
 * What the prompt says, for a moment, when the server refuses a request:
 * the view the refusal arrives with is usually already the one that made
 * it stale (the leader led before your whisper got there), so the line says
 * why in plain words. Every line fits the prompt's 56 cells.
 */

const REFUSAL_TEXT: Readonly<Partial<Record<ExpeditionErrorCode, string>>> = {
  wrong_window: "That has to wait for the gap between tricks",
  hold_unavailable: "You can hold once per gap, and not on your lead",
  not_your_turn: "Not your turn yet",
  must_follow_suit: "You have to follow the led suit",
  card_not_in_hand: "That card is not in your hand any more",
  objective_not_available: "That objective is taken",
  no_whispers_left: "No whispers left this camp",
  whisper_blocked: "Whispers are blocked right now",
  ability_spent: "That power is spent",
  cannot_afford: "The crew can't afford that",
  ability_unavailable: "That can't be used right now",
  invalid_target: "That pick is not allowed any more",
  nothing_to_skip: "Nothing to pass",
  backpack_full: "Your backpack is full: discard an item first",
  camp_over: "The camp is already decided",
  run_over: "The expedition is over",
};

const FALLBACK = "That didn't go through";

/** The line for an Expedition rule's refusal `code`; `nameOf` names a seat. */
export function refusalText(code: ExpeditionErrorCode, view: ExpeditionView | null, nameOf: (seatId: string) => string): string {
  if (code === "waiting_on_hold") {
    const holding = view === null ? [] : (attemptOf(view)?.holdingSeatIds ?? []);
    const text = holding.length === 1 ? `Waiting on ${nameOf(holding[0]!)}` : "A teammate asked you to wait";
    return text.length <= PROMPT_MAX_CHARS ? text : "A teammate asked you to wait";
  }
  return REFUSAL_TEXT[code] ?? FALLBACK;
}
