// The Phase 10 toolkit (Plan 04, spec §6.3): the ONLY mutation surface for
// gear. A GearDef's `apply` returns a list of ToolkitOp data (gear-def.ts);
// this file is the sole executor of that data, and every op preserves
// invariants BY CONSTRUCTION — card conservation, audience-scoped reveals,
// pending-only objective swaps (D-10), window-bound leader/boss changes
// (D-09/D-04). A violation is a content-author defect and THROWS (POLICY
// A3), matching actions.ts's composed-hook throw policy.
//
// D-13: the between-tricks window has NO grace period — it closes the
// moment the trick's leader plays (camp.currentTrick.plays.length > 0), and
// reopens only once the next trick starts fresh.
//
// A1: every gear draw goes through STREAMS.gear(campNumber, attemptNumber,
// useIndex, gearId, seatId, purpose), where useIndex = k =
// attempt.gearUses.length AT THE TIME OF USE — never a stored/carried PRNG
// state. Purposes must be distinct within a single `apply` call, or two
// draws in the same call would collide on the same stream name.
//
// OWN-HAND-ONLY TARGET RULE (T-10-11): an "own-card" target is resolved
// ONLY via legality.ts's findOwnCard(camp, self, id) — never by searching a
// teammate's hand. Probing a teammate's card id as an own-card target
// returns a plain reason string, the same as any other invalid target; it
// never reveals whether that id exists in someone else's hand.
//
// This file must never import from ./compose — callers pass the composed
// RunRules in, keeping this plan parallel with Plan 10-03.

import { campPhase } from "../camp";
import { findOwnCard } from "../legality";
import { evaluateObjective } from "../objectives";
import type { CampState } from "../state";
import type { GearContext, GearWindow, TargetSpec, ToolkitOp } from "../gear/gear-def";
import { STREAMS, seededIndex } from "./rng";
import type { RunRules } from "./run-rules";
import type { ActiveEffect, AttemptState, Catalog, LogEntry, Reveal, RunError, RunState } from "./types";

/** The open timing window, or null when no gear can be used right now
 * (mid-trick, fireside, or the camp has ended). Derived fresh from
 * RunState on every call — nothing cached. */
export function currentWindow(run: RunState, rules: RunRules): GearWindow | null {
  if (run.attempt === null) return null; // fireside
  const camp = run.attempt.camp;
  if (camp === null) return "pre-deal";

  const phase = campPhase(camp, rules);
  if (phase === "objective-pick") return "objective-pick";
  if (phase === "playing") {
    // D-13: the window closes the instant the leader plays.
    return camp.currentTrick.plays.length === 0 ? "between-tricks" : null;
  }
  return null; // "ended"
}

/** True whether the seat used OR skipped this gear already this camp. */
export function isGearSpent(attempt: AttemptState, seatId: string, gearId: string): boolean {
  return attempt.gearUses.some((use) => use.seatId === seatId && use.gearId === gearId);
}

/** Builds the GearContext handed to a GearDef's canUse/canTarget/apply.
 * Throws if there is no in-progress attempt (nothing to build a context
 * for). `camp` is null during the pre-deal window. */
export function buildGearContext(
  run: RunState,
  self: string,
  gearId: string,
  targets: readonly string[],
  rules: RunRules,
): GearContext {
  if (run.attempt === null) {
    throw new Error("toolkit: buildGearContext: no attempt in progress");
  }
  const attempt = run.attempt;
  const camp = attempt.camp;

  return {
    self,
    gearId,
    run,
    camp,
    rules,
    targets,
    handSize(seatId) {
      const hand = camp?.hands.find((h) => h.seatId === seatId);
      return hand ? hand.cards.length : 0;
    },
    ownHand() {
      const hand = camp?.hands.find((h) => h.seatId === self);
      return hand ? hand.cards : [];
    },
    // A1: k = attempt.gearUses.length at the time of the draw. Purposes
    // must be distinct within one `apply` call.
    randomCardIdFrom(seatId, purpose) {
      const hand = camp?.hands.find((h) => h.seatId === seatId);
      if (!hand || hand.cards.length === 0) return null;
      const stream = STREAMS.gear(run.campNumber, attempt.attemptNumber, attempt.gearUses.length, gearId, self, purpose);
      const index = seededIndex(run.seed, stream, hand.cards.length);
      return hand.cards[index]!.id;
    },
    randomIndex(n, purpose) {
      const stream = STREAMS.gear(run.campNumber, attempt.attemptNumber, attempt.gearUses.length, gearId, self, purpose);
      return seededIndex(run.seed, stream, n);
    },
  };
}

const WINDOW_PHRASES: Record<GearWindow, string> = {
  "pre-deal": "before the deal",
  "objective-pick": "while objectives are picked",
  "between-tricks": "between tricks",
  passive: "always",
};

/** GEAR-06: availability with a human-readable reason for every blocked
 * case. Check order: attempt -> equipped -> catalog lookup (throws if
 * missing — an equipped-but-uncataloged id is a content defect, POLICY A3)
 * -> spent -> passive -> window -> def.canUse. */
export function gearAvailability(
  run: RunState,
  seatId: string,
  gearId: string,
  catalog: Catalog,
  rules: RunRules,
): { ok: true } | { ok: false; error: RunError; reason: string } {
  if (run.attempt === null) {
    return { ok: false, error: "wrong_phase", reason: "No camp in progress" };
  }
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (!seat || !seat.equippedGearIds.includes(gearId)) {
    return { ok: false, error: "gear_not_equipped", reason: "Not equipped" };
  }
  const def = catalog.gear[gearId];
  if (!def) {
    throw new Error(`toolkit: gearAvailability: unknown gear id ${gearId}`);
  }
  if (isGearSpent(run.attempt, seatId, gearId)) {
    return { ok: false, error: "gear_already_used", reason: "Already used this camp" };
  }
  if (def.window === "passive") {
    return { ok: false, error: "wrong_window", reason: "Passive gear is always active" };
  }
  const window = currentWindow(run, rules);
  if (def.window !== window) {
    return { ok: false, error: "wrong_window", reason: `Can only be used ${WINDOW_PHRASES[def.window]}` };
  }
  const ctx = buildGearContext(run, seatId, gearId, [], rules);
  const canUse = def.canUse ? def.canUse(ctx) : true;
  if (canUse !== true) {
    return { ok: false, error: "gear_unavailable", reason: canUse };
  }
  return { ok: true };
}

/** Generic target-kind validation, shared by every gear. The own-card
 * lookup goes through findOwnCard ONLY (T-10-11) — never a search of other
 * hands. */
export function validateTargets(ctx: GearContext, specs: readonly TargetSpec[]): true | string {
  if (ctx.targets.length !== specs.length) {
    return `Expected ${specs.length} target(s), got ${ctx.targets.length}`;
  }

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const target = ctx.targets[i]!;

    if (spec.kind === "teammate") {
      if (target === ctx.self || !ctx.run.seatIds.includes(target)) {
        return "Target must be a teammate";
      }
    } else if (spec.kind === "own-card") {
      if (ctx.camp === null || findOwnCard(ctx.camp, ctx.self, target) === null) {
        return "Target must be a card in your own hand";
      }
    } else if (spec.kind === "face-up-objective") {
      const objective = ctx.camp?.objectives.find((o) => o.id === target);
      if (!objective || objective.ownerSeatId !== null) {
        return "Target must be a face-up objective";
      }
    } else {
      // own-objective
      const objective = ctx.camp?.objectives.find((o) => o.id === target);
      if (
        !objective ||
        ctx.camp === null ||
        objective.ownerSeatId !== ctx.self ||
        evaluateObjective(ctx.camp, objective) !== "pending"
      ) {
        return "Target must be one of your own pending objectives";
      }
    }
  }

  return true;
}

/** Every card id currently in play (hands, completed tricks, the
 * in-progress trick), sorted. Every successful applyToolkitOps call must
 * leave this list unchanged (T-10-13). */
export function campCardIds(camp: CampState): string[] {
  const ids: string[] = [];
  for (const hand of camp.hands) {
    for (const card of hand.cards) ids.push(card.id);
  }
  for (const trick of camp.completedTricks) {
    for (const play of trick.plays) ids.push(play.card.id);
  }
  for (const play of camp.currentTrick.plays) ids.push(play.card.id);
  return ids.sort();
}

function requireCamp(attempt: AttemptState, opName: string): CampState {
  if (attempt.camp === null) {
    throw new Error(`toolkit: ${opName}: no camp in progress`);
  }
  return attempt.camp;
}

function applyOp(run: RunState, attempt: AttemptState, actorSeatId: string, gearId: string, op: ToolkitOp): AttemptState {
  switch (op.op) {
    case "move-card": {
      const camp = requireCamp(attempt, "move-card");
      if (op.fromSeatId === op.toSeatId) {
        throw new Error("toolkit: move-card: fromSeatId === toSeatId");
      }
      const fromHand = camp.hands.find((h) => h.seatId === op.fromSeatId);
      const toHand = camp.hands.find((h) => h.seatId === op.toSeatId);
      if (!fromHand || !toHand) {
        throw new Error("toolkit: move-card: unknown seat");
      }
      const card = fromHand.cards.find((c) => c.id === op.cardId);
      if (!card) {
        throw new Error(`toolkit: move-card: card ${op.cardId} not in ${op.fromSeatId}'s hand`);
      }
      const hands = camp.hands.map((h) => {
        if (h.seatId === op.fromSeatId) {
          return { seatId: h.seatId, cards: h.cards.filter((c) => c.id !== op.cardId) };
        }
        if (h.seatId === op.toSeatId) {
          return { seatId: h.seatId, cards: [...h.cards, card] };
        }
        return h;
      });
      return { ...attempt, camp: { ...camp, hands } };
    }

    case "swap-cards": {
      const camp = requireCamp(attempt, "swap-cards");
      const handA = camp.hands.find((h) => h.seatId === op.seatA);
      const handB = camp.hands.find((h) => h.seatId === op.seatB);
      if (!handA || !handB) {
        throw new Error("toolkit: swap-cards: unknown seat");
      }
      const idxA = handA.cards.findIndex((c) => c.id === op.cardIdA);
      if (idxA === -1) {
        throw new Error(`toolkit: swap-cards: card ${op.cardIdA} not in ${op.seatA}'s hand`);
      }
      const idxB = handB.cards.findIndex((c) => c.id === op.cardIdB);
      if (idxB === -1) {
        throw new Error(`toolkit: swap-cards: card ${op.cardIdB} not in ${op.seatB}'s hand`);
      }
      const cardA = handA.cards[idxA]!;
      const cardB = handB.cards[idxB]!;
      const hands = camp.hands.map((h) => {
        if (h.seatId === op.seatA) {
          const cards = h.cards.slice();
          cards[idxA] = cardB;
          return { seatId: h.seatId, cards };
        }
        if (h.seatId === op.seatB) {
          const cards = h.cards.slice();
          cards[idxB] = cardA;
          return { seatId: h.seatId, cards };
        }
        return h;
      });
      return { ...attempt, camp: { ...camp, hands } };
    }

    case "replace-objective": {
      const camp = requireCamp(attempt, "replace-objective");
      const objective = camp.objectives.find((o) => o.id === op.objectiveId);
      if (!objective) {
        throw new Error(`toolkit: replace-objective: unknown objective ${op.objectiveId}`);
      }
      if (objective.ownerSeatId !== null) {
        throw new Error("toolkit: replace-objective: objective is already owned");
      }
      // Must match camp.ts's isCardBearingSlot and reroll.ts's canTarget
      // (CR-01): win-card and ordered are the only card-bearing kinds.
      if (objective.kind !== "ordered" && objective.kind !== "win-card") {
        throw new Error("toolkit: replace-objective: objective has no card to replace");
      }
      if (camp.objectiveDeck.length === 0) {
        throw new Error("toolkit: replace-objective: objective deck is empty");
      }
      const newTarget = camp.objectiveDeck[0]!;
      const objectives = camp.objectives.map((o) => (o.id === op.objectiveId ? { ...o, target: newTarget } : o));
      const objectiveDeck = camp.objectiveDeck.slice(1);
      return { ...attempt, camp: { ...camp, objectives, objectiveDeck } };
    }

    case "swap-objectives": {
      // D-10: only PENDING objectives move; an already-done one stays put.
      const camp = requireCamp(attempt, "swap-objectives");
      const objectives = camp.objectives.map((o) => {
        if (evaluateObjective(camp, o) !== "pending") return o;
        if (o.ownerSeatId === op.seatA) return { ...o, ownerSeatId: op.seatB };
        if (o.ownerSeatId === op.seatB) return { ...o, ownerSeatId: op.seatA };
        return o;
      });
      return { ...attempt, camp: { ...camp, objectives } };
    }

    case "remove-objective": {
      // D-11: the objective leaves play entirely.
      const camp = requireCamp(attempt, "remove-objective");
      if (!camp.objectives.some((o) => o.id === op.objectiveId)) {
        throw new Error(`toolkit: remove-objective: unknown objective ${op.objectiveId}`);
      }
      const objectives = camp.objectives.filter((o) => o.id !== op.objectiveId);
      return { ...attempt, camp: { ...camp, objectives } };
    }

    case "reveal": {
      // T-10-12: the ONLY op that can expose a card to a non-holder; the
      // audience is the sole grant of visibility.
      const camp = requireCamp(attempt, "reveal");
      if (op.audience.length === 0) {
        throw new Error("toolkit: reveal: audience must not be empty");
      }
      if (new Set(op.audience).size !== op.audience.length) {
        throw new Error("toolkit: reveal: audience contains duplicates");
      }
      for (const audienceSeatId of op.audience) {
        if (!run.seatIds.includes(audienceSeatId)) {
          throw new Error(`toolkit: reveal: audience contains unknown seat ${audienceSeatId}`);
        }
      }
      const holder = camp.hands.find((h) => h.cards.some((c) => c.id === op.cardId));
      if (!holder) {
        throw new Error(`toolkit: reveal: card ${op.cardId} not in any hand`);
      }
      const reveal: Reveal = { cardId: op.cardId, fromSeatId: holder.seatId, audience: op.audience, source: gearId };
      return { ...attempt, reveals: [...attempt.reveals, reveal] };
    }

    case "add-modifier": {
      const atTrick = attempt.camp ? attempt.camp.completedTricks.length : 0;
      const effect: ActiveEffect = { gearId, seatId: actorSeatId, atTrick };
      return { ...attempt, effects: [...attempt.effects, effect] };
    }

    case "set-next-leader": {
      // D-09: allowed in any between-tricks window, including before trick
      // 1 — the caller (gearAvailability's window check) is what
      // guarantees "between tricks"; this op itself only guards against a
      // trick already in progress.
      const camp = requireCamp(attempt, "set-next-leader");
      if (camp.currentTrick.plays.length > 0) {
        throw new Error("toolkit: set-next-leader: trick already in progress");
      }
      return { ...attempt, camp: { ...camp, currentTrick: { ...camp.currentTrick, leaderSeatId: op.seatId } } };
    }

    case "cancel-boss-twist": {
      // D-04: only before the deal.
      if (attempt.camp !== null) {
        throw new Error("toolkit: cancel-boss-twist: camp already dealt");
      }
      return { ...attempt, bossCancelled: true };
    }

    case "log": {
      if (Array.isArray(op.audience)) {
        for (const audienceSeatId of op.audience) {
          if (!run.seatIds.includes(audienceSeatId)) {
            throw new Error(`toolkit: log: audience contains unknown seat ${audienceSeatId}`);
          }
        }
      }
      const entry: LogEntry = {
        event: op.event,
        actorSeatId,
        subjectSeatIds: op.subjectSeatIds,
        gearId,
        audience: op.audience,
      };
      return { ...attempt, log: [...attempt.log, entry] };
    }

    default: {
      const exhaustive: never = op;
      throw new Error(`toolkit: unknown op ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The sole executor of gear effects (spec §6.3). Folds `ops` in order,
 * never mutating `run` or any of its nested objects, and asserts card
 * conservation once the fold completes (T-10-13): a broken gear op is a
 * content-author defect and THROWS (POLICY A3), never silently corrupting
 * state. */
export function applyToolkitOps(run: RunState, actorSeatId: string, gearId: string, ops: readonly ToolkitOp[]): RunState {
  if (run.attempt === null) {
    throw new Error("toolkit: applyToolkitOps: no attempt in progress");
  }

  const beforeCamp = run.attempt.camp;
  const beforeIds = beforeCamp ? campCardIds(beforeCamp) : null;

  let attempt = run.attempt;
  for (const op of ops) {
    attempt = applyOp(run, attempt, actorSeatId, gearId, op);
  }

  if (attempt.camp !== null) {
    const afterIds = campCardIds(attempt.camp);
    const expected = beforeIds ?? [];
    if (afterIds.length !== expected.length || afterIds.some((id, i) => id !== expected[i])) {
      throw new Error("toolkit: card conservation violated");
    }
    if (new Set(afterIds).size !== afterIds.length) {
      throw new Error("toolkit: card conservation violated");
    }
  }

  return { ...run, attempt };
}
