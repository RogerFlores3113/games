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

/** A face-down card on the table, named by the seat that played it. */
export function faceDownTrickObjectId(seatId: string): string {
  return `trick:face-down:${seatId}`;
}

export function revealObjectId(identity: ExpeditionCardIdentityView): string {
  return `reveal:${cardLabel(identity)}`;
}

/** For win-card/ordered objectives, uses the target's card label
 * (e.g. "objective:K♦"); for no-tricks/exactly-n and hidden objectives,
 * which show no card, falls back to the objective's own id. */
export function objectiveObjectId(o: ExpeditionObjectiveView): string {
  if (o.kind === "win-card" || o.kind === "ordered") {
    return `objective:${cardLabel(o.target)}`;
  }
  return `objective:${o.id}`;
}

/** The fog over a teammate's items, for its tooltip. */
export function seatFogObjectId(seatId: string): string {
  return `seat-fog:${seatId}`;
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

/** An empty patch of your backpack, by its place. */
export function packCellObjectId(cell: number): string {
  return `pack-cell:${cell}`;
}

/** One of your item slots on the item bar under the trail, by its index. */
export function barSlotObjectId(slot: number): string {
  return `bar-slot:${slot}`;
}

/** An objective icon in a camp preview: the preview's owner (`loadout`, a
 * route id) and the icon's place in its row. */
export function previewObjectiveObjectId(owner: string, place: number): string {
  return `preview-objective:${owner}:${place}`;
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

/** A power's button between camps. */
export function powerObjectId(sourceKey: string): string {
  return `power:${sourceKey}`;
}

/** A route card's Reroll button. */
export function rerollObjectId(routeId: string): string {
  return `reroll:${routeId}`;
}

/** A crew row on the trail, a pick for a power aimed at a teammate. */
export function crewObjectId(seatId: string): string {
  return `crew:${seatId}`;
}

/** Using a source in a gated window (a rescue). */
export function gateUseObjectId(sourceId: string): string {
  return `gate-use:${sourceId}`;
}

/** A camp modifier's chip on the top bar. */
/** A boss's mark hung under a teammate's plate. */
export function seatMarkObjectId(seatId: string): string {
  return `seat-mark:${seatId}`;
}

export function modObjectId(modId: string): string {
  return `mod:${modId}`;
}

export function interactableObjectId(id: string): string {
  return `interactable:${id}`;
}

export const READY_ID = "ready";
/** The item bar's backpack, which opens the inventory window. */
export const BACKPACK_ID = "backpack";
export const INVENTORY_CLOSE_ID = "inventory:close";
/** The inventory window's discard patch, and the Discard and Keep of its confirm row. */
export const DISCARD_ID = "inventory:discard";
export const DISCARD_CONFIRM_ID = "inventory:discard-confirm";
export const DISCARD_KEEP_ID = "inventory:discard-keep";
/** Stops aiming a power at one of your items, from the inventory window. */
export const INVENTORY_CANCEL_ID = "inventory:cancel";
export const BOARD_ID = "board";
export const TRAY_MORE_ID = "pick:more";
export const SUPPLIES_ID = "supplies";
/** The top bar's camp label, which opens the map of the run. */
export const MAP_ID = "map";
export const WHISPER_ID = "whisper";
export const CONFIRM_ID = "confirm";
export const CANCEL_ID = "cancel";
export const GATE_SKIP_ID = "gate-skip";
export const LAST_TRICK_ID = "last-trick";
export const NEW_EXPEDITION_ID = "run-end:new-expedition";
export const LEAVE_ID = "run-end:leave";
