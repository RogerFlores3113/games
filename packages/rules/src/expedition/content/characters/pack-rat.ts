import { currentStamp } from "../../run/usage";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

/** Item instance uids are minted as it<n> (run/items.ts). */
const ITEM_UID = /^it\d+$/;

export const packRat = defineCharacter({
  id: "pack-rat",
  name: "The Pack Rat",
  theme: "Carries more",
  power: "Big Pack",
  text: "Carry three items, and draft bundles add two Pack Rat items.",
  passive: {
    modifier: (owner) => ({
      itemSlots: (prev) => (run, seatId) => prev(run, seatId) + (seatId === owner.seatId ? 1 : 0),
      draftShape: (prev) => (run, seatId) => (seatId === owner.seatId ? { ...prev(run, seatId), exclusive: 2 } : prev(run, seatId)),
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
        apply: (ctx) => [{ op: "give-item", fromSeatId: ctx.self, uid: ctx.targets[0].uid, toSeatId: ctx.targets[1].seatId }],
      }),
    }),
    defineUpgrade({
      id: "pack-rat.pack-animal",
      name: "Pack Animal",
      text: "Swap a carried item for one in your backpack.",
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
