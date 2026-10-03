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
// OWN-HAND-ONLY TARGET RULE (T-10-11): an "own-card" target resolves only
// among the actor's own hand choices (run/targets.ts). Probing a teammate's
// card id returns the same plain reason as any other invalid target; it
// never reveals whether that id exists in someone else's hand.
//
// This file must never import from ./compose — callers pass the composed
// RunRules in, keeping this plan parallel with Plan 10-03.

import { campPhase } from "../camp";
import { identitiesEqual } from "../deck";
import { evaluateObjective } from "../objectives";
import type { CampState, Objective } from "../state";
import { STARTING_SUPPLIES } from "./balance";
import type { GearContext, GearWindow, TargetKind as GearTargetKind, TargetSpec, ToolkitOp } from "../gear/gear-def";
import { STREAMS, seededIndex } from "./rng";
import { resolveTargets, type TargetSpec as RegistrySpec } from "./targets";
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

/** Each gear target kind as a registry spec, plus the prefix that turns a
 * gear's bare id into that kind's choice id. Lives until gear is replaced. */
const GEAR_TARGET_SPECS: Readonly<Record<GearTargetKind, { readonly spec: RegistrySpec; readonly prefix: string }>> = {
  teammate: { spec: { kind: "player", who: "teammate" }, prefix: "seat:" },
  "own-card": { spec: { kind: "card", where: "my-hand" }, prefix: "card:" },
  "face-up-objective": { spec: { kind: "objective", whose: "unclaimed" }, prefix: "objective:" },
  "own-objective": { spec: { kind: "objective", whose: "mine" }, prefix: "objective:" },
};

/** Generic target-kind validation, shared by every gear, through the
 * target-kind registry: a target is legal only if it is among the seat's
 * choices, so an own-card target never matches a teammate's card (T-10-11). */
export function validateTargets(ctx: GearContext, specs: readonly TargetSpec[]): true | string {
  const mapped = specs.map((spec) => GEAR_TARGET_SPECS[spec.kind]);
  const ids = ctx.targets.length === specs.length ? ctx.targets.map((target, i) => `${mapped[i]!.prefix}${target}`) : ctx.targets;
  const scope = { run: ctx.run, seatId: ctx.self, camp: ctx.camp, rules: ctx.rules };
  const resolved = resolveTargets(scope, mapped.map((m) => m.spec), ids);
  return resolved.ok ? true : resolved.reason;
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

/** A reveal's audience: non-empty, no duplicates, every seat known. */
function assertAudience(run: RunState, audience: readonly string[], opName: string): void {
  if (audience.length === 0) {
    throw new Error(`toolkit: ${opName}: audience must not be empty`);
  }
  if (new Set(audience).size !== audience.length) {
    throw new Error(`toolkit: ${opName}: audience contains duplicates`);
  }
  for (const audienceSeatId of audience) {
    if (!run.seatIds.includes(audienceSeatId)) {
      throw new Error(`toolkit: ${opName}: audience contains unknown seat ${audienceSeatId}`);
    }
  }
}

/** Supplies are run-level; every other op changes only the attempt. */
function applyOp(run: RunState, actorSeatId: string, gearId: string, op: ToolkitOp): RunState {
  if (op.op === "adjust-supplies") {
    // The crew keeps at least one supply and never exceeds the start.
    const supplies = run.supplies + op.delta;
    if (!Number.isInteger(op.delta) || supplies < 1 || supplies > STARTING_SUPPLIES) {
      throw new Error(`toolkit: adjust-supplies: ${run.supplies} + ${op.delta} leaves [1, ${STARTING_SUPPLIES}]`);
    }
    return { ...run, supplies };
  }
  return { ...run, attempt: applyAttemptOp(run, run.attempt!, actorSeatId, gearId, op) };
}

function applyAttemptOp(
  run: RunState,
  attempt: AttemptState,
  actorSeatId: string,
  gearId: string,
  op: Exclude<ToolkitOp, { readonly op: "adjust-supplies" }>,
): AttemptState {
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
      if (op.seatA === op.seatB) {
        throw new Error("toolkit: swap-cards: seatA === seatB");
      }
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
        // An owned objective is replaceable only once failed: it becomes a
        // plain win-card for the same owner on a card still in some hand.
        if (evaluateObjective(camp, objective) !== "failed") {
          throw new Error("toolkit: replace-objective: an owned objective must have failed");
        }
        const deckIndex = camp.objectiveDeck.findIndex((identity) =>
          camp.hands.some((h) => h.cards.some((c) => identitiesEqual(c.identity, identity))),
        );
        if (deckIndex === -1) {
          throw new Error("toolkit: replace-objective: no objective-deck card is still in a hand");
        }
        const fresh: Objective = { id: objective.id, kind: "win-card", target: camp.objectiveDeck[deckIndex]!, ownerSeatId: objective.ownerSeatId };
        const objectives = camp.objectives.map((o) => (o.id === op.objectiveId ? fresh : o));
        const objectiveDeck = camp.objectiveDeck.filter((_, i) => i !== deckIndex);
        return { ...attempt, camp: { ...camp, objectives, objectiveDeck } };
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

    case "reassign-objective": {
      // An owner change. The objective must already be owned: taking an
      // unowned one is a pick, which only the Core performs.
      const camp = requireCamp(attempt, "reassign-objective");
      const objective = camp.objectives.find((o) => o.id === op.objectiveId);
      if (!objective) {
        throw new Error(`toolkit: reassign-objective: unknown objective ${op.objectiveId}`);
      }
      if (objective.ownerSeatId === null) {
        throw new Error("toolkit: reassign-objective: objective is unowned");
      }
      if (!run.seatIds.includes(op.toSeatId) || objective.ownerSeatId === op.toSeatId) {
        throw new Error(`toolkit: reassign-objective: ${op.toSeatId} is not another seat`);
      }
      const objectives = camp.objectives.map((o) => (o.id === op.objectiveId ? { ...o, ownerSeatId: op.toSeatId } : o));
      return { ...attempt, camp: { ...camp, objectives } };
    }

    case "reassign-trick": {
      // A completed trick's winner changes; its cards stay where they are.
      const camp = requireCamp(attempt, "reassign-trick");
      const trick = camp.completedTricks.find((t) => t.index === op.trickIndex);
      if (!trick) {
        throw new Error(`toolkit: reassign-trick: no completed trick ${op.trickIndex}`);
      }
      if (!run.seatIds.includes(op.toSeatId) || trick.winnerSeatId === op.toSeatId) {
        throw new Error(`toolkit: reassign-trick: ${op.toSeatId} is not another seat`);
      }
      const completedTricks = camp.completedTricks.map((t) => (t.index === op.trickIndex ? { ...t, winnerSeatId: op.toSeatId } : t));
      return { ...attempt, camp: { ...camp, completedTricks } };
    }

    case "share-reveal": {
      // Copies a whisper's identity and its pinned holder (WR-03) to a new
      // audience. The ordinal counts whispers only, as the public log does.
      requireCamp(attempt, "share-reveal");
      const whisper = attempt.reveals.filter((r) => r.source === "whisper")[op.whisperOrdinal];
      if (!whisper) {
        throw new Error(`toolkit: share-reveal: no whisper ${op.whisperOrdinal}`);
      }
      assertAudience(run, op.audience, "share-reveal");
      const reveal: Reveal = { cardId: whisper.cardId, fromSeatId: whisper.fromSeatId, audience: op.audience, source: gearId };
      return { ...attempt, reveals: [...attempt.reveals, reveal] };
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
      assertAudience(run, op.audience, "reveal");
      const holder = camp.hands.find((h) => h.cards.some((c) => c.id === op.cardId));
      if (!holder) {
        throw new Error(`toolkit: reveal: card ${op.cardId} not in any hand`);
      }
      const reveal: Reveal = { cardId: op.cardId, fromSeatId: holder.seatId, audience: op.audience, source: gearId };
      return { ...attempt, reveals: [...attempt.reveals, reveal] };
    }

    case "add-modifier": {
      const atTrick = attempt.camp ? attempt.camp.currentTrick.index : 0;
      const effect: ActiveEffect = { gearId, seatId: actorSeatId, atTrick, lasts: op.lasts, params: op.params, audience: op.audience };
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

/** The sole executor of gear effects (spec §6.3). Folds `ops` over the
 * RunState in order, never mutating `run` or any of its nested objects, and
 * asserts card conservation once the fold completes (T-10-13): a broken op
 * is a content-author defect and THROWS (POLICY A3), never silently
 * corrupting state. */
export function applyToolkitOps(run: RunState, actorSeatId: string, gearId: string, ops: readonly ToolkitOp[]): RunState {
  if (run.attempt === null) {
    throw new Error("toolkit: applyToolkitOps: no attempt in progress");
  }

  const beforeCamp = run.attempt.camp;
  const beforeIds = beforeCamp ? campCardIds(beforeCamp) : null;

  let next = run;
  for (const op of ops) {
    next = applyOp(next, actorSeatId, gearId, op);
  }

  const afterCamp = next.attempt!.camp;
  if (afterCamp !== null) {
    const afterIds = campCardIds(afterCamp);
    const expected = beforeIds ?? [];
    if (afterIds.length !== expected.length || afterIds.some((id, i) => id !== expected[i])) {
      throw new Error("toolkit: card conservation violated");
    }
    if (new Set(afterIds).size !== afterIds.length) {
      throw new Error("toolkit: card conservation violated");
    }
  }

  return next;
}
