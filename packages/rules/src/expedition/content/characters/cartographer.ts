import { ability, defineCharacter, definePower, defineUpgrade } from "../source-def";
import type { ToolkitOp } from "../../run/toolkit";

/** Treasure Map: special drafts per player, their shape, and the coins found. */
const TREASURE = { drafts: 2, shape: { options: 3, bundleSize: 1, exclusive: 0, rareChance: 50 }, coins: 10 } as const;

export const cartographer = defineCharacter({
  id: "cartographer",
  name: "The Cartographer",
  theme: "Chooses the route",
  power: "Mapmaker",
  text: "See three routes, one to another boss, and reroll a route for a supply.",
  passive: {
    modifier: () => ({
      routeOptionCount: () => () => 3,
      swapsBoss: (prev) => (run, option) => option === 2 || prev(run, option),
    }),
  },
  active: ability({
    window: "route",
    limit: { kind: "supplies", cost: 1 },
    targets: [{ kind: "route-option" }],
    apply: (ctx) => [{ op: "reroll-route", option: ctx.targets[0].option.id }],
  }),
  powers: [
    definePower({
      id: "cartographer.redraw",
      name: "Redraw",
      text: "Replace a face-up objective with a new one.",
      active: ability({
        window: "objective-pick",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "objective", whose: "unclaimed" }],
        canTarget: (ctx) => {
          const { objective } = ctx.targets[0];
          if (objective.kind !== "win-card" && objective.kind !== "ordered") return "Only card objectives can be redrawn";
          if (ctx.camp!.objectiveDeck.length === 0) return "The objective deck is empty";
          return true;
        },
        apply: (ctx) => [{ op: "replace-objective", objectiveId: ctx.targets[0].objective.id }],
      }),
    }),
  ],
  upgrades: [
    defineUpgrade({
      id: "cartographer.survey",
      name: "Survey",
      text: "See the objective cards each coming camp will deal.",
      passive: { modifier: (owner) => ({ surveys: (prev) => (run, seatId) => seatId === owner.seatId || prev(run, seatId) }) },
    }),
    defineUpgrade({
      id: "cartographer.treasure-map",
      name: "Treasure Map",
      text: "Every player gets two special one-item drafts, and the crew finds 10 coins.",
      active: ability({
        window: "draft",
        limit: { kind: "per-run", times: 1 },
        targets: [],
        apply: (ctx) => [
          ...ctx.run.seatIds.flatMap((seatId) =>
            Array.from({ length: TREASURE.drafts }, (): ToolkitOp => ({ op: "add-offer", seatId, offer: ctx.drawOffer(seatId, TREASURE.shape) })),
          ),
          { op: "adjust-coins", delta: TREASURE.coins },
        ],
      }),
    }),
  ],
});
