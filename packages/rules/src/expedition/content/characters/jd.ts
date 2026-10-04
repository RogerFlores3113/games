import { DRAFT } from "../../run/balance";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

/** Points added to every route's chance of fair weather. Never shown. */
const HIDDEN_LUCK = 5;

export const jd = defineCharacter({
  id: "jd",
  name: "J.D.",
  theme: "The beginner's pick",
  power: "Beginner's Luck",
  text: "Start the run with an extra random item.",
  on: {
    "run-started": (ctx) => {
      const itemId = ctx.drawOffer(ctx.self, { options: 1, bundleSize: 1, exclusive: 0, rareChance: DRAFT.rareChance }).bundles[0]?.[0];
      return itemId === undefined ? [] : [{ op: "grant-item", seatId: ctx.self, itemId }];
    },
  },
  passive: { modifier: () => ({ normalWeatherChance: (prev) => (run, chance) => Math.min(100, prev(run, chance) + HIDDEN_LUCK) }) },
  upgrades: [
    defineUpgrade({
      id: "jd.blend-in",
      name: "Blend In",
      text: "Animal bosses can't single you out.",
      passive: {
        modifier: (owner) => ({
          affectsSeat: (prev) => (run, seatId, origin) =>
            seatId === owner.seatId && origin.kind === "mod" && (run.plan?.bosses ?? []).some((boss) => boss.tier === "animal" && boss.modId === origin.modId)
              ? false
              : prev(run, seatId, origin),
        }),
      },
    }),
    defineUpgrade({
      id: "jd.free-spirit",
      name: "Free Spirit",
      text: "Win ordered objectives in any order this camp.",
      active: ability({
        window: ["objective-pick", "between-tricks", "rescue"],
        limit: { kind: "per-camp", times: 1 },
        targets: [],
        canUse: (ctx) => (ctx.camp!.objectives.some((o) => o.kind === "ordered") ? true : "No ordered objectives this camp"),
        apply: () => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: {} }],
        effect: () => ({
          objectiveStatus: (prev) => (camp, objective) =>
            objective.kind === "ordered" ? prev(camp, { id: objective.id, kind: "win-card", target: objective.target, ownerSeatId: objective.ownerSeatId }) : prev(camp, objective),
        }),
      }),
    }),
    defineUpgrade({
      id: "jd.rule-breaker",
      name: "Rule Breaker",
      text: "Play any card this trick, even one off the led suit.",
      active: ability({
        window: "in-trick",
        limit: { kind: "per-camp", times: 1 },
        targets: [],
        apply: (ctx) => [{ op: "add-modifier", lasts: "trick", audience: "public", params: { seatId: ctx.self } }],
        effect: (effect) => ({
          legalPlays: (prev) => (camp, seatId) => (seatId === effect.params.seatId ? (camp.hands.find((h) => h.seatId === seatId)?.cards ?? []) : prev(camp, seatId)),
        }),
      }),
    }),
  ],
});
