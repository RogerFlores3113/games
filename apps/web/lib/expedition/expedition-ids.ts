import type { ExpeditionCardIdentityView, ExpeditionObjectiveView } from "@games/rules";

/**
 * The single source of the §7.5 test-bridge id scheme (`hand:Q♥`,
 * `gear:<id>`, `seat:<seatId>`, `objective:K♦`). Scenes and e2e helpers must
 * build ids only through the functions exported here — never inline a
 * template literal for one of these prefixes elsewhere.
 */

export const SUIT_GLYPH: Readonly<Record<"spades" | "hearts" | "diamonds" | "clubs", string>> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

/** 2-10 as digits; 11 J; 12 Q; 13 K; 14 A. */
export function rankLabel(rank: number): string {
  switch (rank) {
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    case 14:
      return "A";
    default:
      return String(rank);
  }
}

/** e.g. "Q♥", "10♠", "Sun", "Moon". */
export function cardLabel(identity: ExpeditionCardIdentityView): string {
  if (identity.kind === "joker") {
    return identity.joker === "sun" ? "Sun" : "Moon";
  }
  return `${rankLabel(identity.rank)}${SUIT_GLYPH[identity.suit]}`;
}

export function handObjectId(identity: ExpeditionCardIdentityView): string {
  return `hand:${cardLabel(identity)}`;
}

export function trickObjectId(identity: ExpeditionCardIdentityView): string {
  return `trick:${cardLabel(identity)}`;
}

export function revealObjectId(identity: ExpeditionCardIdentityView): string {
  return `reveal:${cardLabel(identity)}`;
}

/** For win-card/ordered objectives, uses the target's card label
 * (e.g. "objective:K♦"); for no-tricks/exactly-n objectives, which have no
 * card target, falls back to the objective's own id. */
export function objectiveObjectId(o: ExpeditionObjectiveView): string {
  if (o.kind === "win-card" || o.kind === "ordered") {
    return `objective:${cardLabel(o.target)}`;
  }
  return `objective:${o.id}`;
}

export function seatObjectId(seatId: string): string {
  return `seat:${seatId}`;
}

export function gearObjectId(gearId: string): string {
  return `gear:${gearId}`;
}

export function draftObjectId(gearId: string): string {
  return `draft:${gearId}`;
}

export function loadoutObjectId(gearId: string): string {
  return `loadout:${gearId}`;
}

export function preDealUseObjectId(gearId: string): string {
  return `predeal-use:${gearId}`;
}

export function interactableObjectId(id: string): string {
  return `interactable:${id}`;
}

export const READY_ID = "ready";
export const WHISPER_ID = "whisper";
export const CONFIRM_ID = "confirm";
export const CANCEL_ID = "cancel";
export const PREDEAL_SKIP_ID = "predeal-skip";
export const LAST_TRICK_ID = "last-trick";
export const NEW_EXPEDITION_ID = "run-end:new-expedition";
export const LEAVE_ID = "run-end:leave";
