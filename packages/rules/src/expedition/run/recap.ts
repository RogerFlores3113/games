// The recap of an ended attempt: what the table needs to see after a camp
// clears or fails, kept on RunState.lastAttempt until the next one ends.
// Built once, when the camp settles, from what was public at the end of
// play: the final trick (face up once it completed), each objective with
// its holder and final status, the camp rules that failed, the coins paid
// and the supply cost split by where it came from. No hand is kept.

import { checkCampOutcome } from "../camp";
import { countTricksWon, targetFate } from "../objectives";
import type { CampState, Objective } from "../state";
import { labeledRuleLayersFor, rulesFor } from "./compose";
import { baseRunHooks, type RunRules } from "./run-rules";
import type { AttemptRecap, Catalog, ObjectiveRecap, RunAt, RunState, SupplyCostPart } from "./types";

const originKey = (origin: SupplyCostPart["origin"]): string =>
  origin.kind === "base" ? "base" : origin.kind === "mod" ? `mod:${origin.modId}` : `seat:${origin.seatId}:${origin.sourceId}`;

/** rules.failureCost split by layer: the base cost, then what each layer
 * that maps failureCost added (or took away), folded in ruleLayersFor's
 * order, so the parts always sum to the composed cost. Parts of the same
 * origin (two Heavy Packs on one seat) are summed; a part that adds nothing
 * is left out. */
export function supplyCostParts(run: RunState, catalog: Catalog): SupplyCostPart[] {
  let cost: RunRules["failureCost"] = baseRunHooks.failureCost;
  const parts: SupplyCostPart[] = [{ origin: { kind: "base" }, amount: cost(run) }];
  for (const { origin, layer } of labeledRuleLayersFor(run, catalog)) {
    const mapper = layer.failureCost;
    if (mapper === undefined) continue;
    const next = mapper(cost);
    const amount = next(run) - cost(run);
    cost = next;
    if (amount === 0) continue;
    // The dev sandbox's loaded dice never touch the cost; count them as base if they ever do.
    const part: SupplyCostPart = { origin: origin.kind === "loaded" ? { kind: "base" } : origin, amount };
    const same = parts.findIndex((p) => originKey(p.origin) === originKey(part.origin));
    if (same === -1) parts.push(part);
    else parts[same] = { origin: parts[same]!.origin, amount: parts[same]!.amount + amount };
  }
  return parts.filter((p) => p.amount !== 0);
}

/** The camp as it stood after `tricks` completed tricks and the discards
 * made through `discardsThrough` completed tricks. */
function prefixOf(camp: CampState, tricks: number, discardsThrough: number): CampState {
  return { ...camp, completedTricks: camp.completedTricks.slice(0, tricks), discards: camp.discards.filter((d) => d.afterTrick <= discardsThrough) };
}

/** The index of the trick whose completion failed `objective`, replaying
 * the camp's timeline (every objective's failure is absorbing, so the first
 * failing moment is the cause). Null when it failed before any trick, or
 * right after a trick by a discard, or not at all. */
function failedAtTrick(camp: CampState, objective: Objective, rules: RunRules): number | null {
  const failedAt = (tricks: number, discardsThrough: number): boolean => rules.objectiveStatus(prefixOf(camp, tricks, discardsThrough), objective) === "failed";
  if (failedAt(0, 0)) return null;
  for (let k = 1; k <= camp.completedTricks.length; k++) {
    if (failedAt(k, k - 1)) return camp.completedTricks[k - 1]!.index;
    if (failedAt(k, k)) return null;
  }
  return null;
}

function objectiveRecap(run: RunState, camp: CampState, objective: Objective, rules: RunRules): ObjectiveRecap {
  const status = rules.objectiveStatus(camp, objective);
  // Fail closed: kept from anyone in the crew at the end, kept from everyone.
  const hidden = run.seatIds.some((seatId) => rules.hides(run, seatId, { kind: "objective", objectiveId: objective.id }));
  const owner = objective.ownerSeatId;
  let fate: ObjectiveRecap["fate"] = null;
  if (!hidden && (objective.kind === "win-card" || objective.kind === "ordered")) {
    const found = targetFate(camp, objective.target);
    fate = found.kind === "won" ? { kind: "won", bySeatId: found.trick.winnerSeatId } : { kind: found.kind };
  }
  return {
    objective,
    hidden,
    status,
    failedAtTrick: status === "failed" ? failedAtTrick(camp, objective, rules) : null,
    fate,
    ownerTricksWon: owner === null ? null : countTricksWon(camp, owner),
  };
}

/** The recap of the attempt `run` is settling. `supplyCost` is empty for a
 * clear. */
export function recapOf(run: RunAt<"camp">, status: "cleared" | "failed", coins: number, supplyCost: readonly SupplyCostPart[], catalog: Catalog): AttemptRecap {
  const rules = rulesFor(run, catalog);
  const camp = run.stage.attempt.camp;
  const outcome = checkCampOutcome(camp, rules);
  return {
    camp: run.stage.camp.index,
    attempt: run.stage.attempt.attemptNumber,
    status,
    tricksPlayed: camp.completedTricks.length,
    totalTricks: camp.totalTricks,
    lastTrick: camp.completedTricks.at(-1) ?? null,
    objectives: camp.objectives.map((objective) => objectiveRecap(run, camp, objective, rules)),
    failedGoalIds: outcome.status === "failed" ? Array.from(outcome.failedGoalIds) : [],
    coins,
    supplyCost: Array.from(supplyCost),
  };
}
