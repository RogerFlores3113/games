import { attemptOf } from "../../run/attempt";
import { openPool } from "../../run/draft";
import type { OptionScope } from "../../run/targets";
import type { ToolkitOp } from "../../run/toolkit";
import type { Catalog, RunState } from "../../run/types";
import { ability, defineCharacter, definePower, defineUpgrade, type CoinCost } from "../source-def";

/** Coins for 0, 1 and 2 or more empty item slots taken into a camp. */
const EMPTY_SLOT_COINS = [0, 2, 5];
const CASH_OUT_COINS = 4;
const BUYOUT_PER_OBJECTIVE = 10;
const POPUP_STOCK = 3;
/** The Pop-up Shop's price for an item of each shop price. */
const POPUP_PRICES: Readonly<Record<number, number>> = { 1: 2, 2: 4, 3: 5, 4: 7, 5: 9 };
const POPUP = "businessman.pop-up-shop";

/** What an item sells for at the shop. */
export function salePrice(price: number): number {
  return Math.max(1, Math.floor(price / 2));
}

function popupPrice(price: number): number {
  return POPUP_PRICES[price] ?? 2 * price - 1;
}

/** The Pop-up Shop's private memory this attempt: its refreshes, and the
 * stock places sold since the last one, from the owner's own log entries. */
function popupState(run: RunState, seatId: string): { readonly refreshes: number; readonly sold: ReadonlySet<number> } {
  const entries = (attemptOf(run)?.log ?? []).filter((e) => e.sourceId === POPUP && e.actorSeatId === seatId);
  const last = entries.map((e) => e.event).lastIndexOf("popup-refresh");
  const refreshes = entries.filter((e) => e.event === "popup-refresh").length;
  const sold = entries.slice(last + 1).flatMap((e) => (e.event.startsWith("popup-sold:") ? [Number(e.event.slice("popup-sold:".length))] : []));
  return { refreshes, sold: new Set(sold) };
}

/** The stock: POPUP_STOCK distinct items any character drafts, rolled anew
 * on each refresh. */
function popupStock(scope: OptionScope, refreshes: number): readonly string[] {
  const left = [...openPool(scope.catalog).common, ...openPool(scope.catalog).rare].sort();
  const stock: string[] = [];
  for (let i = 0; i < POPUP_STOCK && left.length > 0; i++) stock.push(left.splice(scope.roll(`stock-r${refreshes}-i${i}`, left.length), 1)[0]!);
  return stock;
}

/** `buy:<place>:<item>:<price>:<seat>` for each unsold place and each
 * seat, then `refresh:<price>`: each value carries its price, so the table
 * can show it. */
function popupOptions(scope: OptionScope): readonly string[] {
  const { refreshes, sold } = popupState(scope.run, scope.seatId);
  const buys = popupStock(scope, refreshes).flatMap((itemId, place) => {
    const price = popupPrice(scope.catalog.items[itemId]!.price);
    return sold.has(place) ? [] : scope.run.seatIds.map((seatId) => `buy:${place}:${itemId}:${price}:${seatId}`);
  });
  return [...buys, `refresh:${refreshes + 1}`];
}

type PopupPick =
  | { readonly kind: "refresh"; readonly price: number }
  | { readonly kind: "buy"; readonly place: number; readonly itemId: string; readonly price: number; readonly seatId: string };

function parsePick(value: string): PopupPick {
  const [kind, ...rest] = value.split(":");
  if (kind === "refresh") return { kind: "refresh", price: Number(rest[0]) };
  const [place, itemId, price, seatId] = rest;
  return { kind: "buy", place: Number(place), itemId: itemId!, price: Number(price), seatId: seatId! };
}

function popupCost(ctx: CoinCost): number {
  const pick = ctx.targets?.[0];
  if (pick === undefined || pick.kind !== "option") return Math.min(popupState(ctx.run, ctx.seatId).refreshes + 1, ...cheapestOf(ctx.catalog));
  return parsePick(pick.value).price;
}

function cheapestOf(catalog: Catalog): number[] {
  const prices = Object.values(catalog.items).filter((item) => item.exclusiveTo === undefined).map((item) => popupPrice(item.price));
  return prices.length === 0 ? [] : [Math.min(...prices)];
}

function failedObjectiveIds(run: RunState, rules: CoinCost["rules"]): readonly string[] {
  const camp = attemptOf(run)?.camp;
  return camp === undefined ? [] : camp.objectives.filter((o) => rules.objectiveStatus(camp, o) === "failed").map((o) => o.id);
}

export const businessman = defineCharacter({
  id: "businessman",
  name: "The Businessman",
  theme: "Power now for money later",
  power: "Bottom Line",
  text: "Empty slots pay 2 coins a camp, 5 for two; you can sell at the shop.",
  on: {
    "camp-dealt": (ctx) => {
      const seat = ctx.run.seats.find((s) => s.seatId === ctx.self)!;
      const empty = Math.max(0, ctx.rules.itemSlots(ctx.run, ctx.self) - seat.equipped.length);
      const coins = EMPTY_SLOT_COINS[Math.min(empty, EMPTY_SLOT_COINS.length - 1)]!;
      return coins === 0 ? [] : [{ op: "adjust-coins", delta: coins }];
    },
  },
  active: ability({
    window: "loadout",
    limit: { kind: "unlimited" },
    targets: [{ kind: "item", where: "any" }],
    canUse: (ctx) => (ctx.run.stage.tag === "shop" ? true : "Sell only at the shop"),
    apply: (ctx) => {
      const item = ctx.targets[0];
      return [
        { op: "drop-item", seatId: ctx.self, uid: item.uid },
        { op: "adjust-coins", delta: salePrice(ctx.catalog.items[item.itemId]!.price) },
      ];
    },
  }),
  powers: [
    definePower({
      id: "businessman.cash-out",
      name: "Cash Out",
      text: "Skip a draft for 4 coins.",
      active: ability({
        window: "draft",
        limit: { kind: "unlimited" },
        targets: [],
        apply: (ctx) => [
          { op: "drop-offer", seatId: ctx.self },
          { op: "adjust-coins", delta: CASH_OUT_COINS },
        ],
      }),
    }),
  ],
  upgrades: [
    defineUpgrade({
      id: POPUP,
      name: "Pop-up Shop",
      text: "Buy from your own shop of three items during a camp, for anyone's slots.",
      active: ability({
        window: ["objective-pick", "between-tricks", "in-trick"],
        limit: { kind: "coins", cost: popupCost },
        targets: [{ kind: "option", prompt: "Buy an item for a player, or refresh the stock", options: popupOptions }],
        canTarget: (ctx) => {
          const pick = parsePick(ctx.targets[0].value);
          if (pick.kind === "refresh") return true;
          const seat = ctx.run.seats.find((s) => s.seatId === pick.seatId)!;
          return seat.equipped.length < ctx.rules.itemSlots(ctx.run, pick.seatId) ? true : "Their slots are full";
        },
        apply: (ctx) => {
          const pick = parsePick(ctx.targets[0].value);
          const memory = (event: string): ToolkitOp => ({ op: "log", event, subjectSeatIds: [], audience: [ctx.self] });
          if (pick.kind === "refresh") return [memory("popup-refresh")];
          return [{ op: "grant-item", seatId: pick.seatId, itemId: pick.itemId }, memory(`popup-sold:${pick.place}`)];
        },
      }),
    }),
    defineUpgrade({
      id: "businessman.buyout",
      name: "Buyout",
      text: "Once the tricks run out, pay 10 coins per failed objective to clear the camp.",
      active: ability({
        window: "rescue",
        limit: { kind: "coins", cost: (ctx) => BUYOUT_PER_OBJECTIVE * failedObjectiveIds(ctx.run, ctx.rules).length },
        targets: [],
        canUse: (ctx) => (ctx.camp!.hands.every((hand) => hand.cards.length === 0) ? true : "Only once the tricks run out"),
        apply: (ctx) => failedObjectiveIds(ctx.run, ctx.rules).map((objectiveId) => ({ op: "remove-objective", objectiveId })),
      }),
    }),
    defineUpgrade({
      id: "businessman.haggle",
      name: "Haggle",
      text: "Everything at the shop costs you 1 coin less.",
      passive: {
        modifier: (owner) => ({ shopPrice: (prev) => (run, seatId, price) => (seatId === owner.seatId ? Math.max(1, prev(run, seatId, price) - 1) : prev(run, seatId, price)) }),
      },
    }),
  ],
});
