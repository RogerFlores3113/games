import { currentStamp } from "../../run/usage";
import type { RunState } from "../../run/types";
import { hasPendingObjective } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

const UPGRADES = ["magician.double-act", "magician.misdirection", "magician.switcheroo"];
/** Swaps per camp with any upgrade. */
const UPGRADED_SWAPS = 2;

/** The Magician's swaps this attempt, by any of its swap abilities, each
 * counting what it spends. */
function swapsUsed(run: RunState, seatId: string): number {
  const stamp = currentStamp(run);
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (stamp === null || seat === undefined) return 0;
  return seat.ledger.filter((e) => e.kind === "used" && e.free !== true && e.sourceKey === "magician" && e.at.camp === stamp.camp && e.at.attempt === stamp.attempt).length;
}

export const magician = defineCharacter({
  id: "magician",
  name: "The Magician",
  theme: "Moves cards around",
  power: "Card Trick",
  text: "Swap a card in your hand for one from a teammate's fanned-out hand.",
  active: ability({
    window: "between-tricks",
    limit: (owner) =>
      owner.hasUpgrade("magician.double-act")
        ? { kind: "whispers" }
        : { kind: "per-camp", times: UPGRADES.some((id) => owner.hasUpgrade(id)) ? UPGRADED_SWAPS : 1 },
    targets: [{ kind: "card", where: "my-hand" }, { kind: "fanned-card" }],
    apply: (ctx) => [{ op: "swap-cards", seatA: ctx.self, cardIdA: ctx.targets[0].cardId, seatB: ctx.targets[1].seatId, cardIdB: ctx.targets[1].cardId }],
  }),
  upgrades: [
    defineUpgrade({
      id: "magician.double-act",
      name: "Double Act",
      text: "Two swaps per camp, and swaps and whispers trade for each other.",
      passive: {
        modifier: (owner) => ({
          whispersPerCamp: (prev) => (run, seatId) => (seatId === owner.seatId ? prev(run, seatId) + UPGRADED_SWAPS - swapsUsed(run, seatId) : prev(run, seatId)),
        }),
      },
    }),
    defineUpgrade({
      id: "magician.misdirection",
      name: "Misdirection",
      text: "Swap cards between two teammates' fanned-out hands instead.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "shares", of: "magician", spends: 1 },
        targets: [{ kind: "fanned-card" }, { kind: "fanned-card" }],
        canTarget: (ctx) => (ctx.targets[0].seatId === ctx.targets[1].seatId ? "Pick from two different hands" : true),
        apply: (ctx) => [{ op: "swap-cards", seatA: ctx.targets[0].seatId, cardIdA: ctx.targets[0].cardId, seatB: ctx.targets[1].seatId, cardIdB: ctx.targets[1].cardId }],
      }),
    }),
    defineUpgrade({
      id: "magician.switcheroo",
      name: "Switcheroo",
      text: "Spend both swaps to swap two players' open objectives.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "shares", of: "magician", spends: UPGRADED_SWAPS },
        targets: [{ kind: "player", who: "anyone" }, { kind: "player", who: "anyone" }],
        canTarget: (ctx) => {
          const [a, b] = ctx.targets;
          if (a.seatId === b.seatId) return "Pick two different players";
          return hasPendingObjective(ctx.camp!, a.seatId, ctx.rules) || hasPendingObjective(ctx.camp!, b.seatId, ctx.rules) ? true : "Neither has an open objective";
        },
        apply: (ctx) => [{ op: "swap-objectives", seatA: ctx.targets[0].seatId, seatB: ctx.targets[1].seatId }],
      }),
    }),
  ],
});
