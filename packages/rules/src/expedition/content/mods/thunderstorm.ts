import { THUNDERSTORM } from "../../run/balance";
import type { ActiveEffect, RunState } from "../../run/types";
import type { CampState } from "../../state";
import { lowestSeat } from "../helpers";
import { defineMod, type ModCtx, type StatusPart } from "./mod-def";

const ID = "thunderstorm";

function strikesOf(run: RunState): readonly ActiveEffect[] {
  if (run.stage.tag !== "camp") return [];
  return run.stage.attempt.effects.filter((e) => e.origin.kind === "mod" && e.origin.modId === ID);
}

function maxStrikes(ctx: ModCtx): number {
  return THUNDERSTORM.maxStrikes + (ctx.exposed ? THUNDERSTORM.exposedStrikes : 0);
}

function chanceAt(trick: number): number {
  return Math.min(100, THUNDERSTORM.firstChance + THUNDERSTORM.perTrick * trick);
}

/** The trick the next roll is for, and whether that trick will be played:
 * trick 0 until every objective is picked, else the one after the trick in
 * play. A hallucination moves the index on without playing a trick, so what
 * is left is counted from the tricks played. */
function nextRoll(camp: CampState | null): { readonly trick: number; readonly played: boolean } {
  if (camp === null || camp.objectives.some((o) => o.ownerSeatId === null)) return { trick: 0, played: true };
  return { trick: camp.currentTrick.index + 1, played: camp.completedTricks.length + 1 < camp.totalTricks };
}

function status(ctx: ModCtx): readonly StatusPart[] {
  const { run, camp } = ctx;
  const strikes = strikesOf(run);
  const strikesLeft = Math.max(0, maxStrikes(ctx) - strikes.length);
  const next = nextRoll(camp);
  const rolls = strikesLeft > 0 && next.played;
  const parts: StatusPart[] = [{ kind: "chance", percent: rolls ? chanceAt(next.trick) : 0, strikesLeft }];
  if (camp !== null && strikes.some((s) => s.atTrick === camp.currentTrick.index)) parts.push({ kind: "strike" });
  return parts;
}

export const thunderstorm = defineMod({
  id: ID,
  kind: "weather",
  name: "Thunderstorm",
  weight: 3,
  text: "Watch the sky: lightning may strike before a trick, and then the lowest card wins it.",
  full: {
    on: {
      "trick-started": (ctx) => {
        const t = ctx.event.trickIndex;
        const strikes = strikesOf(ctx.run);
        if (strikes.length >= maxStrikes(ctx) || strikes.some((s) => s.atTrick === t)) return [];
        if (ctx.draw(100) >= chanceAt(t)) return [];
        return [{ op: "add-modifier", lasts: "trick", audience: "public", params: { strike: true }, deferIfFatal: true }];
      },
    },
    effect: () => ({ trickWinner: () => (plays) => lowestSeat(plays) }),
    status,
  },
});
