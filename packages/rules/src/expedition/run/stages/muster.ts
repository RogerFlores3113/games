import { RUN_LENGTHS } from "../balance";
import { openLoadout } from "../lifecycle";
import { react } from "../react";
import { drawPlan } from "../plan";
import { STREAMS } from "../rng";
import { firstCampSpec } from "../route";
import type { RunLength } from "../types";
import { tally } from "../vote";
import { err, everySeat, ok, type StageDef } from "./stage-def";

const LENGTHS = Object.keys(RUN_LENGTHS) as RunLength[];

/** Every seat picks a character (public, final, unique) and votes a length
 * (changeable until the vote resolves). The last missing input resolves the
 * vote, draws the plan, opens camp 1's loadout and lets the seats' sources
 * react to run-started. */
export const muster: StageDef<"muster"> = {
  on: {
    "pick-character": (run, seatId, action, catalog) => {
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      if (seat.characterId !== null) return err("wrong_phase");
      if (!Object.hasOwn(catalog.characters, action.characterId)) return err("unknown_character");
      if (run.seats.some((s) => s.characterId === action.characterId)) return err("character_taken");
      return ok({ ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, characterId: action.characterId } : s)) });
    },
    vote: (run, seatId, action) => {
      if (action.choice !== null && !(LENGTHS as readonly string[]).includes(action.choice)) return err("not_a_choice");
      return ok({ ...run, stage: { ...run.stage, ballots: { ...run.stage.ballots, [seatId]: action.choice as RunLength | null } } });
    },
  },
  advance(run, catalog) {
    if (run.seats.some((seat) => seat.characterId === null) || !everySeat(run, run.stage.ballots)) return run;
    const result = tally(run.seed, STREAMS.lengthVote(), LENGTHS, run.seatIds, run.stage.ballots)!;
    const opened = openLoadout({ ...run, plan: drawPlan(run.seed, result.winner, catalog), lastVote: { topic: "length", result } }, firstCampSpec(result.winner), catalog);
    return react(opened, [{ type: "run-started" }], catalog);
  },
};
