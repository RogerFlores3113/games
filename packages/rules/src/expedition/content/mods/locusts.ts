import type { RunState } from "../../run/types";
import type { CampState } from "../../state";
import { defineBoss, type ModBody, type StatusPart } from "./mod-def";

const ID = "locusts";
const ATE_ITEM = "ate-item:";

/** The seat whose equipped item the swarm eats next: round the table after
 * the last seat it ate from, starting at the expedition leader; null when no
 * seat has an equipped item. */
function nextMeal(run: RunState, camp: CampState): string | null {
  const log = run.stage.tag === "camp" ? run.stage.attempt.log : [];
  const last = log.filter((l) => l.sourceId === ID && l.event.startsWith(ATE_ITEM)).at(-1)?.subjectSeatIds[0];
  const seatIds = camp.seatIds;
  const start = last === undefined ? seatIds.indexOf(camp.expeditionLeaderSeatId) : seatIds.indexOf(last) + 1;
  for (let i = 0; i < seatIds.length; i++) {
    const seatId = seatIds[(start + i) % seatIds.length]!;
    if ((run.seats.find((s) => s.seatId === seatId)?.equipped.length ?? 0) > 0) return seatId;
  }
  return null;
}

const odd = (trick: number) => trick % 2 === 1;

/** `itemsOnly` is the half body: it eats only items, and only after odd tricks. */
const body = (itemsOnly: boolean): ModBody => ({
  on: {
    "trick-completed": (ctx) => {
      if (itemsOnly && !odd(ctx.event.trickIndex)) return [];
      const seatId = nextMeal(ctx.run, ctx.camp);
      if (seatId !== null) {
        const seat = ctx.run.seats.find((s) => s.seatId === seatId)!;
        const uid = seat.equipped[ctx.draw(seat.equipped.length)]!;
        const itemId = seat.items.find((i) => i.uid === uid)!.itemId;
        return [
          { op: "break-item", seatId, uid },
          { op: "log", event: `${ATE_ITEM}${itemId}`, subjectSeatIds: [seatId], audience: "public" },
        ];
      }
      if (itemsOnly) return [];
      return [
        { op: "discard-round", cardIds: ctx.camp.seatIds.flatMap((s) => ctx.randomCards(s, 1)) },
        { op: "log", event: "ate-cards", subjectSeatIds: [], audience: "public" },
      ];
    },
  },
  status: (ctx) => {
    if (ctx.camp === null) return [];
    const seatId = nextMeal(ctx.run, ctx.camp);
    const parts: StatusPart[] = itemsOnly ? [{ kind: "alternating", activeNow: odd(ctx.camp.currentTrick.index) }] : [];
    if (seatId !== null || !itemsOnly) parts.push({ kind: "swarm", seatId });
    return parts;
  },
});

export const locusts = defineBoss({
  id: ID,
  kind: "disaster",
  name: "Locust swarm",
  weight: 1,
  text: "After every trick the locusts eat an equipped item, and once none are left a random card from every hand.",
  full: body(false),
  half: body(true),
});
