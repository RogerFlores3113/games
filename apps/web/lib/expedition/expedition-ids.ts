import type { ExpeditionCardIdentityView, ExpeditionObjectiveView } from "@games/rules";

/**
 * The single source of the §7.5 test-bridge id scheme (`hand:Q♥`,
 * `source:<id>`, `seat:<seatId>`, `objective:K♦`). Scenes and e2e helpers must
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

/** A seat's hand as one thing, for an ability that picks a hand. */
export function seatHandObjectId(seatId: string): string {
  return `seat-hand:${seatId}`;
}

/** An option in the pick tray, by its choice id: `pick:whisper:0`. */
export function pickObjectId(choiceId: string): string {
  return `pick:${choiceId}`;
}

/** Your own character or kit source. */
export function sourceObjectId(sourceId: string): string {
  return `source:${sourceId}`;
}

/** A teammate's source. Source ids alone are per source, not per seat. */
export function mateSourceObjectId(seatId: string, sourceId: string): string {
  return `seat-source:${seatId}:${sourceId}`;
}

/** A draft offer or, during muster, a character to pick. */
export function draftObjectId(sourceId: string): string {
  return `draft:${sourceId}`;
}

/** A bundle of your draft offer, by its index. */
export function bundleObjectId(bundle: number): string {
  return `bundle:${bundle}`;
}

/** One item of a draft bundle, for its rules on hover. */
export function bundleItemObjectId(bundle: number, item: number): string {
  return `bundle-item:${bundle}:${item}`;
}

/** One of your item slots in the loadout, by its index. */
export function slotObjectId(slot: number): string {
  return `slot:${slot}`;
}

/** An item instance in your backpack, by its uid. */
export function packObjectId(uid: string): string {
  return `pack:${uid}`;
}

/** A shop entry's buy button, by its stock id (`supplies`, `item0`, `upgrade:<id>`). */
export function shopObjectId(stockId: string): string {
  return `shop:${stockId}`;
}

/** A shop entry's name and icon, for its rules on hover. */
export function shopInfoObjectId(stockId: string): string {
  return `shop-info:${stockId}`;
}

/** A run length on the muster's ballot. */
export function lengthObjectId(lengthId: string): string {
  return `length:${lengthId}`;
}

/** A route option on the route vote. */
export function routeObjectId(routeId: string): string {
  return `route:${routeId}`;
}

export function kitObjectId(sourceId: string): string {
  return `kit:${sourceId}`;
}

/** Using a source in a gated window (a rescue). */
export function gateUseObjectId(sourceId: string): string {
  return `gate-use:${sourceId}`;
}

export function interactableObjectId(id: string): string {
  return `interactable:${id}`;
}

export const READY_ID = "ready";
export const PACK_PREV_ID = "pack-page:prev";
export const PACK_NEXT_ID = "pack-page:next";
export const BOARD_ID = "board";
export const TRAY_MORE_ID = "pick:more";
export const SUPPLIES_ID = "supplies";
export const WHISPER_ID = "whisper";
export const CONFIRM_ID = "confirm";
export const CANCEL_ID = "cancel";
export const GATE_SKIP_ID = "gate-skip";
export const LAST_TRICK_ID = "last-trick";
export const NEW_EXPEDITION_ID = "run-end:new-expedition";
export const LEAVE_ID = "run-end:leave";
