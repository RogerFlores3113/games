import { SUITS } from "../../deck";
import type { RunState } from "../../run/types";
import type { RunRules } from "../../run/run-rules";
import type { CampState, CardIdentity, Goal, Suit } from "../../state";
import { ability } from "../source-def";
import { defineMod, type ModCtx } from "./mod-def";

const ID = "temple";
const SUN: CardIdentity = { kind: "joker", joker: "sun" };

export type Plate = Suit | "sun";

/** `floor(totalTricks / 2) - 1` rolled suit plates, then the Sun. */
export function platePath(ctx: ModCtx, camp: CampState): readonly Plate[] {
  const suits = Math.max(0, Math.floor(camp.totalTricks / 2) - 1);
  return [...Array.from({ length: suits }, (_, i) => SUITS[ctx.roll(`plate${i}`, SUITS.length)]!), "sun"];
}

function presses(led: CardIdentity, plate: Plate): boolean {
  return plate === "sun" ? led.kind === "joker" && led.joker === "sun" : led.kind === "standard" && led.suit === plate;
}

/** Plates pressed so far: each completed trick whose led identity is the
 * next plate's presses it; any other lead does nothing. */
export function pressedCount(camp: CampState, path: readonly Plate[]): number {
  return camp.completedTricks.reduce((pressed, trick) => {
    const lead = trick.plays[0]!;
    return pressed < path.length && presses(lead.countsAs ?? lead.card.identity, path[pressed]!) ? pressed + 1 : pressed;
  }, 0);
}

const isSun = (identity: CardIdentity) => identity.kind === "joker" && identity.joker === "sun";

/** Done once every plate is pressed. Failed once fewer tricks remain than
 * plates, or once the Sun has left play without pressing the last plate. */
function platesGoal(camp: CampState, path: readonly Plate[]): Goal {
  const pressed = pressedCount(camp, path);
  if (pressed === path.length) return { id: ID, status: "done" };
  const tricksLeft = camp.totalTricks - camp.completedTricks.length;
  const sunGone =
    camp.completedTricks.some((trick) => trick.plays.some((play) => isSun(play.card.identity))) || camp.discards.some((d) => isSun(d.card.identity));
  return { id: ID, status: sunGone || tricksLeft < path.length - pressed ? "failed" : "pending" };
}

/** Whether the camp's Sun objective is done under the composed rules. */
function sunWon(run: RunState, rules: RunRules): boolean {
  if (run.stage.tag !== "camp") return false;
  const camp = run.stage.attempt.camp;
  return camp.objectives.some((o) => o.kind === "win-card" && isSun(o.target) && rules.objectiveStatus(camp, o) === "done");
}

export const temple = defineMod({
  id: ID,
  kind: "temple",
  name: "The Temple",
  weight: 0,
  text: "Lead each plate's suit in order, ending with the Sun, and win the Sun to earn the crew a skip.",
  full: {
    slots: (prev) => [...prev, { kind: "win-card", fixed: SUN }],
    rules: (ctx) => ({ goals: (prev) => (camp, statuses) => [...prev(camp, statuses), platesGoal(camp, platePath(ctx, camp))] }),
    status: (ctx) => {
      if (ctx.camp === null) return [];
      const plates = platePath(ctx, ctx.camp);
      return [{ kind: "path", plates, pressed: pressedCount(ctx.camp, plates) }];
    },
    grants: {
      name: "Skip",
      text: "Drop one open objective.",
      ...ability({
        window: ["between-tricks", "rescue"],
        limit: { kind: "crew-tokens", earned: (run, rules) => (sunWon(run, rules) ? 1 : 0), locked: "Win the Sun to earn it" },
        targets: [{ kind: "objective", whose: "open" }],
        apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }],
      }),
    },
  },
});
