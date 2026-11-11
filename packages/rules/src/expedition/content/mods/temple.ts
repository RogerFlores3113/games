import { SUITS } from "../../deck";
import type { RunState } from "../../run/types";
import type { RunRules } from "../../run/run-rules";
import type { CampState, CardIdentity, Goal, Suit } from "../../state";
import { ability } from "../source-def";
import { defineMod, type ModCtx } from "./mod-def";

const ID = "temple";
/** The Temple goal's id once it failed because the Sun left play before its plate. */
export const SUN_EARLY_ID = `${ID}:sun`;
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

function sunLeftPlay(camp: CampState): boolean {
  return camp.completedTricks.some((trick) => trick.plays.some((play) => isSun(play.card.identity))) || camp.discards.some((d) => isSun(d.card.identity));
}

/** Done once every plate is pressed. Failed once fewer tricks remain than
 * plates, or once the Sun has left play without pressing the last plate. */
function platesGoal(camp: CampState, path: readonly Plate[]): Goal {
  const pressed = pressedCount(camp, path);
  if (pressed === path.length) return { id: ID, status: "done" };
  const tricksLeft = camp.totalTricks - camp.completedTricks.length;
  // The recap names why: the Sun leaving play early is "temple:sun".
  if (sunLeftPlay(camp)) return { id: SUN_EARLY_ID, status: "failed" };
  return { id: ID, status: tricksLeft < path.length - pressed ? "failed" : "pending" };
}

const SUIT_NAMES: Readonly<Record<Plate, string>> = { clubs: "clubs", diamonds: "diamonds", hearts: "hearts", spades: "spades", sun: "the Sun" };

/** The plates still to press, named by suit ("clubs, then hearts"), shortened
 * to fit a prompt (under 80 characters with its frame). */
function nextPlates(path: readonly Plate[], pressed: number): string {
  const left = path.slice(pressed, -1).map((plate) => SUIT_NAMES[plate]);
  const full = left.join(", then ");
  return full.length <= 40 ? full : `${left.slice(0, 2).join(", then ")}, ...`;
}

/** Playing the Sun fails the Temple unless it leads as the last plate: the
 * Sun leaving play any other way, early or as a follow, is the goal's failure. */
export function sunWarning(camp: CampState, path: readonly Plate[], seatId: string, cardId: string): string | null {
  const card = camp.hands.find((h) => h.seatId === seatId)?.cards.find((c) => c.id === cardId);
  if (card === undefined || !isSun(card.identity)) return null;
  const pressed = pressedCount(camp, path);
  if (pressed === path.length) return null;
  if (pressed === path.length - 1 && camp.currentTrick.plays.length === 0) return null;
  const left = nextPlates(path, pressed);
  const text = left === "" ? "Playing the Sun now fails the Temple: it must lead." : `Playing the Sun now fails the Temple: lead ${left} first.`;
  return text.length < 80 ? text : "Playing the Sun now fails the Temple: lead the plates first.";
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
  text: "Lead each plate's suit in order. The Sun is the last plate: play it earlier and the camp fails. Win the Sun to earn a skip.",
  full: {
    slots: (prev) => [...prev, { kind: "win-card", fixed: SUN }],
    rules: (ctx) => ({
      goals: (prev) => (camp, statuses) => [...prev(camp, statuses), platesGoal(camp, platePath(ctx, camp))],
      playWarning: (prev) => (camp, seatId, cardId) => prev(camp, seatId, cardId) ?? sunWarning(camp, platePath(ctx, camp), seatId, cardId),
    }),
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
