// An event waits on the trail after every other camp (run/trail.ts). Its
// optional effect applies once, as the event opens (run/events.ts); what it
// gave rides on the event stage so every seat sees it.

export type EventId = string;

/** What an event does. Its numbers stay in its def. */
export type EventEffect =
  /** The purse gains `coins`. */
  | { readonly kind: "coins"; readonly coins: number }
  /** The crew regains `supplies`, up to the cap; with supplies full, the purse gains `elseCoins`. */
  | { readonly kind: "supplies"; readonly supplies: number; readonly elseCoins: number }
  /** Each seat with room gets one random common item. */
  | { readonly kind: "common-item" };

export type EventDef = { readonly id: EventId; readonly name: string; readonly text: string; readonly effect?: EventEffect };

/** What an event gave the crew when it opened. */
export type EventGains = { readonly coins: number; readonly supplies: number; readonly items: readonly { readonly seatId: string; readonly itemId: string }[] };

export const NO_GAINS: EventGains = { coins: 0, supplies: 0, items: [] };

export function defineEvent(def: EventDef): EventDef {
  return def;
}
