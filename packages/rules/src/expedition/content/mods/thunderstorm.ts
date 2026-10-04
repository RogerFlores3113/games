import { THUNDERSTORM } from "../../run/balance";
import type { ActiveEffect, RunState } from "../../run/types";
import type { CampState, TrickPlay } from "../../state";
import { rankOf } from "../../trick";
import { defineMod, type StatusPart } from "./mod-def";

const ID = "thunderstorm";

function strikesOf(run: RunState): readonly ActiveEffect[] {
  if (run.stage.tag !== "camp") return [];
  return run.stage.attempt.effects.filter((e) => e.origin.kind === "mod" && e.origin.modId === ID);
}

function chanceAt(trick: number): number {
  return Math.min(100, THUNDERSTORM.firstChance + THUNDERSTORM.perTrick * trick);
}

/** The lowest printed card wins; equal ranks go to the earliest play. */
function lowestSeat(plays: readonly TrickPlay[]): string {
  return plays.reduce((low, play) => (rankOf(play.card) < rankOf(low.card) ? play : low)).seatId;
}

/** The trick the next roll is for: trick 0 until every objective is
 * picked, else the one after the trick in play. */
function nextRoll(camp: CampState | null): number {
  if (camp === null || camp.objectives.some((o) => o.ownerSeatId === null)) return 0;
  return camp.currentTrick.index + 1;
}

function status(run: RunState, camp: CampState | null): readonly StatusPart[] {
  const strikes = strikesOf(run);
  const strikesLeft = Math.max(0, THUNDERSTORM.maxStrikes - strikes.length);
  const next = nextRoll(camp);
  const rolls = strikesLeft > 0 && (camp === null || next < camp.totalTricks);
  const parts: StatusPart[] = [{ kind: "chance", percent: rolls ? chanceAt(next) : 0, strikesLeft }];
  if (camp !== null && strikes.some((s) => s.atTrick === camp.currentTrick.index)) parts.push({ kind: "strike" });
  return parts;
}

export const thunderstorm = defineMod({
  id: ID,
  kind: "weather",
  name: "Thunderstorm",
  weight: 1,
  text: "Lightning may strike before a trick, and then the lowest card wins it.",
  full: {
    on: {
      "trick-started": (ctx) => {
        const t = ctx.event.trickIndex;
        const strikes = strikesOf(ctx.run);
        if (strikes.length >= THUNDERSTORM.maxStrikes || strikes.some((s) => s.atTrick === t)) return [];
        if (ctx.draw(100) >= chanceAt(t)) return [];
        return [{ op: "add-modifier", lasts: "trick", audience: "public", params: { strike: true }, deferIfFatal: true }];
      },
    },
    effect: () => ({ trickWinner: () => (plays) => lowestSeat(plays) }),
    status: (ctx) => status(ctx.run, ctx.camp),
  },
});
