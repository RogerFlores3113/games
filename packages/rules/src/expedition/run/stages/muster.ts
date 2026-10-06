import { RUN_LENGTHS } from "../balance";
import { takenCharacters } from "../crew";
import { openLegAfter } from "../lifecycle";
import { react } from "../react";
import { campIndex, drawPlan } from "../plan";
import { STREAMS } from "../rng";
import type { RunLength } from "../types";
import { tally } from "../vote";
import { err, everySeat, ok, type StageDef } from "./stage-def";

const LENGTHS = Object.keys(RUN_LENGTHS) as RunLength[];

/** Every seat picks a character (public, unique) and votes a length, both
 * changeable until the seat locks in. The last lock-in resolves the vote,
 * draws the plan, opens the draft before camp 1 and lets the seats' sources
 * react to run-started. */
export const muster: StageDef<"muster"> = {
  on: {
    "pick-character": (run, seatId, action, catalog) => {
      if (Object.hasOwn(run.stage.locked, seatId)) return err("locked");
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      if (!Object.hasOwn(catalog.characters, action.characterId)) return err("unknown_character");
      if (seat.characterId === action.characterId) return ok(run);
      if (takenCharacters(run).has(action.characterId)) return err("character_taken");
      return ok({ ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, characterId: action.characterId } : s)) });
    },
    vote: (run, seatId, action) => {
      if (Object.hasOwn(run.stage.locked, seatId)) return err("locked");
      if (action.choice !== null && !(LENGTHS as readonly string[]).includes(action.choice)) return err("not_a_choice");
      return ok({ ...run, stage: { ...run.stage, ballots: { ...run.stage.ballots, [seatId]: action.choice as RunLength | null } } });
    },
    "lock-in": (run, seatId) => {
      if (Object.hasOwn(run.stage.locked, seatId)) return err("locked");
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      if (seat.characterId === null || !Object.hasOwn(run.stage.ballots, seatId)) return err("incomplete_choices");
      return ok({ ...run, stage: { ...run.stage, locked: { ...run.stage.locked, [seatId]: true } } });
    },
  },
  advance(run, catalog) {
    if (!everySeat(run, run.stage.locked)) return run;
    const result = tally(run.seed, STREAMS.lengthVote(), LENGTHS, run.seatIds, run.stage.ballots)!;
    const opened = openLegAfter({ ...run, plan: drawPlan(run.seed, result.winner, catalog), lastVote: { topic: "length", result } }, campIndex(1), null, catalog);
    return react(opened, [{ type: "run-started" }], catalog);
  },
};
