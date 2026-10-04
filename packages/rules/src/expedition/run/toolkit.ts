// The toolkit (spec §6.3): the ONLY mutation surface for abilities. An
// ability's `apply` returns a list of ToolkitOp data; this file is the sole
// executor of that data, and every op preserves invariants BY CONSTRUCTION:
// card conservation, audience-scoped reveals, pending-only objective swaps
// (D-10), window-bound leader changes (D-09). A violation is a
// content-author defect and THROWS (POLICY A3), matching actions.ts's
// composed-hook throw policy.
//
// Ops fold over RunState: supplies are run-level, every other op changes
// only the attempt.

import { identitiesEqual } from "../deck";
import type { CoreRules } from "../rules";
import type { CampState, Objective } from "../state";
import { STARTING_SUPPLIES } from "./balance";
import type { EffectParams, SourceId } from "../content/source-def";
import type { ActiveEffect, AttemptState, LogEntry, Reveal, RunState } from "./types";

export type ToolkitOp<P extends EffectParams = EffectParams> =
  | { readonly op: "move-card"; readonly cardId: string; readonly fromSeatId: string; readonly toSeatId: string }
  | { readonly op: "swap-cards"; readonly seatA: string; readonly cardIdA: string; readonly seatB: string; readonly cardIdB: string }
  | { readonly op: "replace-objective"; readonly objectiveId: string } // unowned, or owned and failed
  | { readonly op: "reassign-objective"; readonly objectiveId: string; readonly toSeatId: string }
  | { readonly op: "reassign-trick"; readonly trickIndex: number; readonly toSeatId: string } // winner change; cards untouched
  | { readonly op: "share-reveal"; readonly whisperOrdinal: number; readonly audience: readonly string[] }
  | { readonly op: "adjust-supplies"; readonly delta: number }
  | { readonly op: "swap-objectives"; readonly seatA: string; readonly seatB: string }
  | { readonly op: "remove-objective"; readonly objectiveId: string }
  | { readonly op: "reveal"; readonly cardId: string; readonly audience: readonly string[] }
  | { readonly op: "add-modifier"; readonly lasts: "attempt" | "trick"; readonly params: P; readonly audience: "public" | "owner" }
  | { readonly op: "set-next-leader"; readonly seatId: string }
  | { readonly op: "log"; readonly event: string; readonly subjectSeatIds: readonly string[]; readonly audience: "public" | readonly string[] };

/** Every card id dealt this camp (hands, completed tricks, the in-progress
 * trick, discards), sorted. Every successful applyToolkitOps call must
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
  for (const discard of camp.discards) ids.push(discard.card.id);
  return ids.sort();
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
function applyOp(run: RunState, actorSeatId: string, sourceId: SourceId, op: ToolkitOp, rules: CoreRules): RunState {
  if (op.op === "adjust-supplies") {
    // The crew keeps at least one supply and never exceeds the start.
    const supplies = run.supplies + op.delta;
    if (!Number.isInteger(op.delta) || supplies < 1 || supplies > STARTING_SUPPLIES) {
      throw new Error(`toolkit: adjust-supplies: ${run.supplies} + ${op.delta} leaves [1, ${STARTING_SUPPLIES}]`);
    }
    return { ...run, supplies };
  }
  return { ...run, attempt: applyAttemptOp(run, run.attempt!, actorSeatId, sourceId, op, rules) };
}

function applyAttemptOp(
  run: RunState,
  attempt: AttemptState,
  actorSeatId: string,
  sourceId: SourceId,
  op: Exclude<ToolkitOp, { readonly op: "adjust-supplies" }>,
  rules: CoreRules,
): AttemptState {
  switch (op.op) {
    case "move-card": {
      const camp = attempt.camp;
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
      const camp = attempt.camp;
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
      const camp = attempt.camp;
      const objective = camp.objectives.find((o) => o.id === op.objectiveId);
      if (!objective) {
        throw new Error(`toolkit: replace-objective: unknown objective ${op.objectiveId}`);
      }
      if (objective.ownerSeatId !== null) {
        // An owned objective is replaceable only once failed: it becomes a
        // plain win-card for the same owner on a card still in some hand.
        if (rules.objectiveStatus(camp, objective) !== "failed") {
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
      // Must match camp.ts's card-bearing kinds and Redraw's canTarget
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
      const camp = attempt.camp;
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
      const camp = attempt.camp;
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
      const whisper = attempt.reveals.filter((r) => r.source === "whisper")[op.whisperOrdinal];
      if (!whisper) {
        throw new Error(`toolkit: share-reveal: no whisper ${op.whisperOrdinal}`);
      }
      assertAudience(run, op.audience, "share-reveal");
      const reveal: Reveal = { cardId: whisper.cardId, fromSeatId: whisper.fromSeatId, audience: op.audience, source: sourceId };
      return { ...attempt, reveals: [...attempt.reveals, reveal] };
    }

    case "swap-objectives": {
      // D-10: only PENDING objectives move; an already-done one stays put.
      const camp = attempt.camp;
      const objectives = camp.objectives.map((o) => {
        if (rules.objectiveStatus(camp, o) !== "pending") return o;
        if (o.ownerSeatId === op.seatA) return { ...o, ownerSeatId: op.seatB };
        if (o.ownerSeatId === op.seatB) return { ...o, ownerSeatId: op.seatA };
        return o;
      });
      return { ...attempt, camp: { ...camp, objectives } };
    }

    case "remove-objective": {
      // D-11: the objective leaves play entirely.
      const camp = attempt.camp;
      if (!camp.objectives.some((o) => o.id === op.objectiveId)) {
        throw new Error(`toolkit: remove-objective: unknown objective ${op.objectiveId}`);
      }
      const objectives = camp.objectives.filter((o) => o.id !== op.objectiveId);
      return { ...attempt, camp: { ...camp, objectives } };
    }

    case "reveal": {
      // T-10-12: the ONLY op that can expose a card to a non-holder; the
      // audience is the sole grant of visibility.
      const camp = attempt.camp;
      assertAudience(run, op.audience, "reveal");
      const holder = camp.hands.find((h) => h.cards.some((c) => c.id === op.cardId));
      if (!holder) {
        throw new Error(`toolkit: reveal: card ${op.cardId} not in any hand`);
      }
      const reveal: Reveal = { cardId: op.cardId, fromSeatId: holder.seatId, audience: op.audience, source: sourceId };
      return { ...attempt, reveals: [...attempt.reveals, reveal] };
    }

    case "add-modifier": {
      const atTrick = attempt.camp.currentTrick.index;
      const effect: ActiveEffect = { sourceId, seatId: actorSeatId, atTrick, lasts: op.lasts, params: op.params, audience: op.audience };
      return { ...attempt, effects: [...attempt.effects, effect] };
    }

    case "set-next-leader": {
      // D-09: allowed in any between-tricks window, including before trick
      // 1. The ability's window guarantees "between tricks"; this op itself
      // only guards against a trick already in progress.
      const camp = attempt.camp;
      if (camp.currentTrick.plays.length > 0) {
        throw new Error("toolkit: set-next-leader: trick already in progress");
      }
      return { ...attempt, camp: { ...camp, currentTrick: { ...camp.currentTrick, leaderSeatId: op.seatId } } };
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
        sourceId,
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

/** The sole executor of ability effects (spec §6.3). Folds `ops` over the
 * RunState in order, never mutating `run` or any of its nested objects, and
 * asserts card conservation once the fold completes (T-10-13): a broken op
 * is a content-author defect and THROWS (POLICY A3), never silently
 * corrupting state. `rules` are the camp's composed rules before the ops,
 * which the objective guards read. */
export function applyToolkitOps(run: RunState, actorSeatId: string, sourceId: SourceId, ops: readonly ToolkitOp[], rules: CoreRules): RunState {
  if (run.attempt === null) {
    throw new Error("toolkit: applyToolkitOps: no attempt in progress");
  }

  const beforeIds = campCardIds(run.attempt.camp);

  let next = run;
  for (const op of ops) {
    next = applyOp(next, actorSeatId, sourceId, op, rules);
  }

  const afterIds = campCardIds(next.attempt!.camp);
  if (afterIds.length !== beforeIds.length || afterIds.some((id, i) => id !== beforeIds[i])) {
    throw new Error("toolkit: card conservation violated");
  }
  if (new Set(afterIds).size !== afterIds.length) {
    throw new Error("toolkit: card conservation violated");
  }

  return next;
}
