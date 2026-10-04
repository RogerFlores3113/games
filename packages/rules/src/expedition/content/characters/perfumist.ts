import { lowestSeat } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";
import { SUITS } from "../../deck";
import type { Suit } from "../../state";

export const perfumist = defineCharacter({
  id: "perfumist",
  name: "The Perfumist",
  theme: "Bends what a trick does",
  power: "Pink Mist",
  text: "Mist a trick you lead so every card goes back to its hand; no whispers until upgraded.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "per-camp", times: 1 },
    targets: [],
    canUse: (ctx) => (ctx.camp!.currentTrick.leaderSeatId === ctx.self ? true : "Only as the trick's leader"),
    apply: () => [{ op: "add-modifier", lasts: "trick", audience: "public", params: {} }],
    effect: () => ({ voidsTrick: () => () => true }),
  }),
  passive: {
    // Last, so no item or teammate's gift lets an unupgraded Perfumist whisper.
    foldsLast: true,
    modifier: (owner) => ({
      whispersPerCamp: (prev) => (run, seatId) => (seatId === owner.seatId && run.seats.find((s) => s.seatId === seatId)?.upgradeId === null ? 0 : prev(run, seatId)),
    }),
  },
  upgrades: [
    defineUpgrade({
      id: "perfumist.turncoat",
      name: "Turncoat",
      text: "Change the led suit of this trick.",
      active: ability({
        window: "in-trick",
        limit: { kind: "per-camp", times: 1 },
        targets: [
          {
            kind: "option",
            prompt: "Pick the new led suit",
            options: (scope) => {
              const lead = scope.camp?.currentTrick.plays[0]?.card;
              if (lead === undefined || lead.identity.kind !== "standard") return [];
              const led = scope.rules.identityOf(lead);
              return SUITS.filter((suit) => led.kind !== "standard" || suit !== led.suit);
            },
          },
        ],
        canUse: (ctx) => (ctx.camp!.currentTrick.plays[0]?.card.identity.kind === "standard" ? true : "A joker's lead can't turn"),
        apply: (ctx) => [{ op: "add-modifier", lasts: "trick", audience: "public", params: { cardId: ctx.camp!.currentTrick.plays[0]!.card.id, suit: ctx.targets[0].value } }],
        effect: (effect) => ({
          identityOf: (prev) => (card) => {
            const identity = prev(card);
            return card.id === effect.params.cardId && identity.kind === "standard" ? { ...identity, suit: effect.params.suit as Suit } : identity;
          },
        }),
      }),
    }),
    defineUpgrade({
      id: "perfumist.upside-down",
      name: "Upside Down",
      text: "The lowest card wins this trick.",
      active: ability({
        window: "in-trick",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "board" }],
        apply: () => [{ op: "add-modifier", lasts: "trick", audience: "public", params: {} }],
        effect: () => ({ trickWinner: () => (plays) => lowestSeat(plays) }),
      }),
    }),
    defineUpgrade({
      id: "perfumist.smelling-salts",
      name: "Smelling Salts",
      text: "Turn the trick that just failed the camp into a hallucination.",
      active: ability({
        window: "rescue",
        limit: { kind: "per-run", times: 1 },
        targets: [],
        canUse: (ctx) => (ctx.camp!.completedTricks.length > 0 ? true : "No trick to undo"),
        apply: (ctx) => [{ op: "void-trick", trickIndex: ctx.camp!.completedTricks.at(-1)!.index }],
      }),
    }),
  ],
});
