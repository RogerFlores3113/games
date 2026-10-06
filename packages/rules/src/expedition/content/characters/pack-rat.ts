import { DRAFT } from "../../run/balance";
import type { DraftShape } from "../../run/draft";
import { roomFor } from "../../run/items";
import { currentStamp } from "../../run/usage";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

/** Item instance uids are minted as it<n> (run/items.ts). */
const ITEM_UID = /^it\d+$/;

/** After the usual draft, a pick of one of three Pack Rat items. */
const PACK_RAT_PICK: DraftShape = { options: 3, bundleSize: 0, exclusive: 1, rareChance: DRAFT.rareChance };

export const packRat = defineCharacter({
  id: "pack-rat",
  name: "The Pack Rat",
  theme: "Carries more",
  power: "Big Pack",
  text: "Carry three items, and after each draft pick one of three Pack Rat items.",
  passive: {
    modifier: (owner) => ({
      itemSlots: (prev) => (run, seatId) => prev(run, seatId) + (seatId === owner.seatId ? 1 : 0),
      draftShapes: (prev) => (run, seatId) => (seatId === owner.seatId ? [...prev(run, seatId), PACK_RAT_PICK] : prev(run, seatId)),
    }),
  },
  upgrades: [
    defineUpgrade({
      id: "pack-rat.quartermaster",
      name: "Quartermaster",
      text: "Hand one of your items to a teammate.",
      active: ability({
        window: "loadout",
        limit: { kind: "unlimited" },
        targets: [{ kind: "item", where: "any" }, { kind: "player", who: "teammate" }],
        canTarget: (ctx) => (roomFor(ctx.run, ctx.targets[1].seatId, ctx.catalog) > 0 ? true : "Their backpack is full"),
        apply: (ctx) => [{ op: "give-item", fromSeatId: ctx.self, uid: ctx.targets[0].uid, toSeatId: ctx.targets[1].seatId }],
      }),
    }),
    defineUpgrade({
      id: "pack-rat.pack-animal",
      name: "Pack Animal",
      text: "Open your backpack once each camp to swap items.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "item", where: "equipped" }, { kind: "item", where: "backpack" }],
        apply: (ctx) => [{ op: "swap-slots", seatId: ctx.self, unequip: ctx.targets[0].uid, equip: ctx.targets[1].uid }],
      }),
    }),
    defineUpgrade({
      id: "pack-rat.sturdy-straps",
      name: "Sturdy Straps",
      text: "The first item you use each camp isn't used up.",
      passive: {
        modifier: (owner) => ({
          freeUse: (prev) => (run, seatId, key) => {
            if (seatId !== owner.seatId || !ITEM_UID.test(key)) return prev(run, seatId, key);
            const stamp = currentStamp(run);
            const seat = run.seats.find((s) => s.seatId === seatId)!;
            const usedAnItem = seat.ledger.some((e) => e.kind === "used" && ITEM_UID.test(e.sourceKey) && stamp !== null && e.at.camp === stamp.camp && e.at.attempt === stamp.attempt);
            return !usedAnItem || prev(run, seatId, key);
          },
        }),
      },
    }),
  ],
});
