// Test-only run-level simulation helpers (Plan 10-07). Test-only support
// placed in src, like Phase 9's test-support.ts, so it is covered
// automatically by purity.test.ts's directory scan (no Node/Worker imports,
// no Math.random/Date.now, no Hanabi imports).
//
// CONSTRAINT (T-03-24, restated for the run layer, mirrors test-support.ts's
// own header): enumerateLegalRunActions builds CANDIDATE actions and filters
// them through applyRunAction ITSELF ONLY. It never re-derives a rule
// locally — no follow-suit comparison, no trick-winner logic, no capacity
// arithmetic duplicated outside of what setupRun/enumerateLegalRunActions
// need to build a CANDIDATE (the actual legality call is always the real
// dispatcher). If a rule in the real engine is wrong, this helper must
// reproduce that same wrongness, not silently correct it.
//
// setupRun is a deliberate TEST SEAM: it assigns owned===equipped===the
// caller's loadouts directly, bypassing every capacity/ownership check
// set-loadout would otherwise enforce. This is intentional — it lets
// content/contract/property tests start a fixture already equipped, without
// re-deriving a legal draft-then-loadout sequence for every test.

import { currentActorSeatId } from "../camp";
import { evaluateObjective } from "../objectives";
import { rulesFor } from "./compose";
import {
  capacityOf,
  createRun,
  loadoutSize,
  preDealPendingSeatIds,
  runPhase,
  runStatus,
} from "./lifecycle";
import { applyRunAction } from "./run-actions";
import { currentWindow } from "./toolkit";
import type { CampState } from "../state";
import type { TargetSpec } from "../gear/gear-def";
import type { Catalog, CampNumber, RunAction, RunState } from "./types";

/** Builds a fireside RunState with every seat's owned/equipped gear set
 * directly from `loadouts` (bypassing capacity/ownership checks by design —
 * see file header) and every draftOffer cleared to null, so a test can call
 * `ready` immediately without resolving a draft first. `campNumber`/
 * `supplies`/`bossTwists` default to createRun's fresh-camp-1 values, then
 * are overridden if provided. */
export function setupRun(opts: {
  seatIds: readonly string[];
  seed: string;
  catalog: Catalog;
  campNumber?: CampNumber;
  supplies?: number;
  loadouts?: Readonly<Record<string, readonly string[]>>;
  bossTwists?: { readonly 3: string | null; readonly 6: string | null };
}): RunState {
  const run = createRun({ seatIds: opts.seatIds, seed: opts.seed }, opts.catalog);
  const loadouts = opts.loadouts ?? {};

  const seats = run.seats.map((seat) => {
    const owned = [...(loadouts[seat.seatId] ?? [])];
    return { ...seat, ownedGearIds: owned, equippedGearIds: owned, draftOffer: null };
  });

  return {
    ...run,
    campNumber: opts.campNumber ?? run.campNumber,
    supplies: opts.supplies ?? run.supplies,
    bossTwists: opts.bossTwists ?? run.bossTwists,
    seats,
  };
}

/** Drives `run` forward through applyRunAction ONLY until `target` is
 * reached: readies every seat (throws if any seat's draft is still pending —
 * callers must resolve drafts first, or use setupRun which clears them),
 * then — for "pre-deal" — returns as soon as the attempt starts in the
 * pre-deal window (throws if the deal happened immediately because no seat
 * had pre-deal gear equipped); otherwise resolves every pending pre-deal
 * seat by skipping, and — for "between-tricks" — additionally has the
 * current actor pick their first unowned objective, repeatedly, until the
 * window opens. Throws on any rejected action or if the run ends first. */
export function advanceTo(
  run: RunState,
  target: "pre-deal" | "objective-pick" | "between-tricks",
  catalog: Catalog,
): RunState {
  let next = run;

  for (const seatId of next.seatIds) {
    if (runPhase(next) !== "fireside") break;
    const result = applyRunAction(next, seatId, { type: "ready" }, catalog);
    if (!result.ok) {
      throw new Error(`advanceTo: ready rejected for seat "${seatId}": ${result.error}`);
    }
    next = result.state;
  }

  if (target === "pre-deal") {
    if (runPhase(next) !== "pre-deal") {
      throw new Error("advanceTo: expected pre-deal, but the deal already happened (no seat had pre-deal gear)");
    }
    return next;
  }

  while (runPhase(next) === "pre-deal") {
    const pending = preDealPendingSeatIds(next, catalog);
    for (const seatId of pending) {
      const result = applyRunAction(next, seatId, { type: "skip-window" }, catalog);
      if (!result.ok) {
        throw new Error(`advanceTo: skip-window rejected for seat "${seatId}": ${result.error}`);
      }
      next = result.state;
    }
  }

  if (target === "objective-pick") {
    if (runPhase(next) !== "camp") {
      throw new Error(`advanceTo: expected camp phase for "objective-pick", got runPhase ${runPhase(next)}`);
    }
    return next;
  }

  // target === "between-tricks": pick the current actor's first unowned
  // objective, repeatedly, until the window opens.
  for (;;) {
    const rules = rulesFor(next, catalog);
    if (currentWindow(next, rules) === "between-tricks") return next;
    if (next.attempt === null || next.attempt.camp === null) {
      throw new Error("advanceTo: run left the camp before reaching between-tricks");
    }
    const camp = next.attempt.camp;
    const actorSeatId = currentActorSeatId(camp, rules);
    if (actorSeatId === null) {
      throw new Error("advanceTo: camp was decided before reaching between-tricks");
    }
    const firstUnowned = camp.objectives.find((o) => o.ownerSeatId === null);
    if (firstUnowned === undefined) {
      throw new Error("advanceTo: no unowned objective left, but the window is still not between-tricks");
    }
    const result = applyRunAction(
      next,
      actorSeatId,
      { type: "pick-objective", objectiveId: firstUnowned.id },
      catalog,
    );
    if (!result.ok) {
      throw new Error(`advanceTo: pick-objective rejected for seat "${actorSeatId}": ${result.error}`);
    }
    next = result.state;
  }
}

/** The cartesian product of `pools`, preserving pool order. `[]` in ->
 * `[[]]` out (one empty combination), matching a zero-target GearDef. */
function cartesian(pools: readonly (readonly string[])[]): string[][] {
  return pools.reduce<string[][]>(
    (acc, pool) => acc.flatMap((prefix) => pool.map((item) => [...prefix, item])),
    [[]],
  );
}

/** Per-TargetSpec candidate pools for `specs`, in declaration order: every
 * teammate (self excluded); the actor's first 3 own cards; every face-up
 * objective; the actor's own pending objectives. */
function targetOptionsFor(
  specs: readonly TargetSpec[],
  run: RunState,
  camp: CampState,
  selfSeatId: string,
): string[][] {
  return specs.map((spec) => {
    if (spec.kind === "teammate") {
      return run.seatIds.filter((id) => id !== selfSeatId);
    }
    if (spec.kind === "own-card") {
      const hand = camp.hands.find((h) => h.seatId === selfSeatId);
      return hand ? hand.cards.slice(0, 3).map((c) => c.id) : [];
    }
    if (spec.kind === "face-up-objective") {
      return camp.objectives.filter((o) => o.ownerSeatId === null).map((o) => o.id);
    }
    // own-objective
    return camp.objectives
      .filter((o) => o.ownerSeatId === selfSeatId && evaluateObjective(camp, o) === "pending")
      .map((o) => o.id);
  });
}

/** Every candidate action for every seat at `run`'s current phase, kept only
 * if `applyRunAction` itself accepts it (T-03-24 discipline: legality is
 * decided ONLY by the real transition, never re-derived here). */
export function enumerateLegalRunActions(
  run: RunState,
  catalog: Catalog,
): Array<{ seatId: string; action: RunAction }> {
  const phase = runPhase(run);
  const candidates: Array<{ seatId: string; action: RunAction }> = [];

  if (phase === "fireside") {
    for (const seat of run.seats) {
      if (seat.draftOffer !== null) {
        for (const gearId of seat.draftOffer) {
          candidates.push({ seatId: seat.seatId, action: { type: "pick-draft", gearId } });
        }
      }

      const loadoutCandidates: string[][] = [[...seat.equippedGearIds], []];
      const greedy: string[] = [];
      for (const gearId of seat.ownedGearIds) {
        const proposed = [...greedy, gearId];
        const candidateRun: RunState = {
          ...run,
          seats: run.seats.map((s) => (s.seatId === seat.seatId ? { ...s, equippedGearIds: proposed } : s)),
        };
        if (loadoutSize(proposed, catalog) <= capacityOf(candidateRun, seat.seatId, catalog)) {
          greedy.push(gearId);
        }
      }
      loadoutCandidates.push(greedy);

      for (const gearIds of loadoutCandidates) {
        candidates.push({ seatId: seat.seatId, action: { type: "set-loadout", gearIds } });
      }
      candidates.push({ seatId: seat.seatId, action: { type: "ready" } });
    }
  } else if (phase === "pre-deal") {
    for (const seat of run.seats) {
      candidates.push({ seatId: seat.seatId, action: { type: "skip-window" } });
      for (const gearId of seat.equippedGearIds) {
        const def = catalog.gear[gearId];
        if (def === undefined || def.window !== "pre-deal") continue;
        candidates.push({ seatId: seat.seatId, action: { type: "use-gear", gearId, targets: [] } });
      }
    }
  } else if (phase === "camp" && run.attempt !== null && run.attempt.camp !== null) {
    const camp = run.attempt.camp;
    const rules = rulesFor(run, catalog);
    const actorSeatId = currentActorSeatId(camp, rules);

    if (actorSeatId !== null) {
      for (const objective of camp.objectives) {
        if (objective.ownerSeatId === null) {
          candidates.push({ seatId: actorSeatId, action: { type: "pick-objective", objectiveId: objective.id } });
        }
      }
      const ownHand = camp.hands.find((h) => h.seatId === actorSeatId);
      if (ownHand !== undefined) {
        for (const card of ownHand.cards) {
          candidates.push({ seatId: actorSeatId, action: { type: "play-card", cardId: card.id } });
        }
      }
    }

    if (currentWindow(run, rules) === "between-tricks") {
      for (const seat of run.seats) {
        const ownHand = camp.hands.find((h) => h.seatId === seat.seatId);
        const ownCards = ownHand ? ownHand.cards.slice(0, 2) : [];
        for (const teammateId of run.seatIds) {
          if (teammateId === seat.seatId) continue;
          for (const card of ownCards) {
            candidates.push({
              seatId: seat.seatId,
              action: { type: "whisper", targetSeatId: teammateId, cardId: card.id },
            });
          }
        }

        for (const gearId of seat.equippedGearIds) {
          const def = catalog.gear[gearId];
          if (def === undefined) continue;
          const pools = targetOptionsFor(def.targets, run, camp, seat.seatId);
          for (const targets of cartesian(pools)) {
            candidates.push({ seatId: seat.seatId, action: { type: "use-gear", gearId, targets } });
          }
        }
      }
    }
  }

  return candidates.filter((candidate) => applyRunAction(run, candidate.seatId, candidate.action, catalog).ok);
}

/** Drives `initial` forward by repeatedly enumerating legal actions and
 * applying `legal[choices[step % choices.length] % legal.length]` through
 * the real applyRunAction, until no legal action remains or runStatus leaves
 * "in_progress". To guarantee fireside progress, a seat that already ran
 * set-loadout during the CURRENT fireside visit is excluded from
 * candidates until the phase leaves fireside (cleared on every re-entry).
 * Throws past `maxSteps`, and throws if an enumerated action is rejected —
 * the enumerator and the transition disagreeing is a bug in one of them. */
export function driveRun(
  initial: RunState,
  choices: readonly number[],
  catalog: Catalog,
  maxSteps = 20000,
): { states: RunState[]; log: Array<{ seatId: string; action: RunAction }> } {
  const states: RunState[] = [initial];
  const log: Array<{ seatId: string; action: RunAction }> = [];
  const firesideSetLoadoutDone = new Set<string>();

  let state = initial;
  let step = 0;

  for (;;) {
    if (runStatus(state) !== "in_progress") break;

    const phase = runPhase(state);
    if (phase !== "fireside") {
      firesideSetLoadoutDone.clear();
    }

    let legal = enumerateLegalRunActions(state, catalog);
    if (phase === "fireside") {
      legal = legal.filter(
        (candidate) => !(candidate.action.type === "set-loadout" && firesideSetLoadoutDone.has(candidate.seatId)),
      );
    }

    if (legal.length === 0) break;
    if (step >= maxSteps) {
      throw new Error("driveRun exceeded step bound");
    }

    const choice = choices.length === 0 ? 0 : choices[step % choices.length]!;
    const picked = legal[choice % legal.length]!;

    const result = applyRunAction(state, picked.seatId, picked.action, catalog);
    if (!result.ok) {
      throw new Error(
        `driveRun: enumerated action rejected by applyRunAction (${JSON.stringify(picked)}): ${result.error}`,
      );
    }

    if (phase === "fireside" && picked.action.type === "set-loadout") {
      firesideSetLoadoutDone.add(picked.seatId);
    }

    state = result.state;
    states.push(state);
    log.push(picked);
    step++;
  }

  return { states, log };
}

/** Re-applies every logged action in order through applyRunAction, throwing
 * on any rejection, returning every state including `initial`. A
 * determinism smoke test — the full RUN-07 property (identical replay of a
 * whole run from its seed and action log) is Plan 10-17's job. */
export function replayRun(
  initial: RunState,
  log: readonly { seatId: string; action: RunAction }[],
  catalog: Catalog,
): RunState[] {
  const states: RunState[] = [initial];
  let state = initial;

  for (const { seatId, action } of log) {
    const result = applyRunAction(state, seatId, action, catalog);
    if (!result.ok) {
      throw new Error(`replayRun: rejected action for seat "${seatId}" (${JSON.stringify(action)}): ${result.error}`);
    }
    state = result.state;
    states.push(state);
  }

  return states;
}
