// The toolkit (spec §6.3): the ONLY mutation surface for abilities. An
// ability's `apply` returns a list of ToolkitOp data; this file is the sole
// executor of that data, and every op preserves invariants BY CONSTRUCTION:
// card conservation, audience-scoped reveals, pending-only objective swaps
// (D-10), window-bound leader changes (D-09). A violation is a
// content-author defect and THROWS (POLICY A3), matching actions.ts's
// composed-hook throw policy.
//
// Ops fold over RunState. Supplies, coins, items, offers and routes are
// run-level and work in any stage; every other op changes the dealt attempt
// and throws outside a camp. An op's origin is a seat acting through a
// source, or a camp modifier reacting to the engine.

import { mintCardId, seedToRngState } from "../../shuffle";
import { identitiesEqual } from "../deck";
import type { CampState, Objective, StandardIdentity } from "../state";
import { SUPPLIES_MAX } from "./balance";
import { attemptOf, withAttempt } from "./attempt";
import type { EffectParams } from "../content/source-def";
import type { DraftOffer } from "./draft";
import { mintItems, roomFor } from "./items";
import { STREAMS, attemptSeed } from "./rng";
import { rerollOption, type RouteChoice } from "./route";
import type { RunRules } from "./run-rules";
import type { ActiveEffect, AttemptState, Catalog, LogEntry, Origin, Reveal, RunState, SeatRun } from "./types";

export type ToolkitOp<P extends EffectParams = EffectParams> =
  | { readonly op: "move-card"; readonly cardId: string; readonly fromSeatId: string; readonly toSeatId: string }
  | { readonly op: "swap-cards"; readonly seatA: string; readonly cardIdA: string; readonly seatB: string; readonly cardIdB: string }
  | { readonly op: "replace-objective"; readonly objectiveId: string } // unowned, or owned and failed
  | { readonly op: "reassign-objective"; readonly objectiveId: string; readonly toSeatId: string }
  | { readonly op: "reassign-trick"; readonly trickIndex: number; readonly toSeatId: string } // winner change; cards untouched
  | { readonly op: "share-reveal"; readonly whisperOrdinal: number; readonly audience: readonly string[] }
  | { readonly op: "adjust-supplies"; readonly delta: number }
  | { readonly op: "adjust-coins"; readonly delta: number }
  | { readonly op: "swap-objectives"; readonly seatA: string; readonly seatB: string }
  | { readonly op: "remove-objective"; readonly objectiveId: string }
  | { readonly op: "reveal"; readonly cardId: string; readonly audience: readonly string[] }
  | { readonly op: "add-modifier"; readonly lasts: "attempt" | "trick"; readonly params: P; readonly audience: "public" | "owner"; readonly deferIfFatal?: true }
  | { readonly op: "break-item"; readonly seatId: string; readonly uid: string } // an equipped instance leaves its owner
  | { readonly op: "discard-round"; readonly cardIds: readonly string[] } // one card from every hand; the camp loses a trick
  | { readonly op: "set-next-leader"; readonly seatId: string }
  | { readonly op: "grant-item"; readonly seatId: string; readonly itemId: string } // a new instance, equipped while a slot is free
  | { readonly op: "give-item"; readonly fromSeatId: string; readonly uid: string; readonly toSeatId: string } // keeps its uses
  | { readonly op: "drop-item"; readonly seatId: string; readonly uid: string } // an owned instance leaves, equipped or not
  | { readonly op: "swap-slots"; readonly seatId: string; readonly unequip: string | null; readonly equip: string | null }
  | { readonly op: "drop-offer"; readonly seatId: string } // the head offer
  | { readonly op: "add-offer"; readonly seatId: string; readonly offer: DraftOffer } // queued behind the others
  | { readonly op: "reroll-route"; readonly option: RouteChoice } // location, weather and event again, on the next reroll's streams
  | { readonly op: "add-objective"; readonly ownerSeatId: string | null } // a win-card from the objective deck
  | { readonly op: "retarget-objective"; readonly objectiveId: string; readonly target: StandardIdentity }
  | { readonly op: "void-trick"; readonly trickIndex: number } // the last completed trick becomes a hallucination
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

/** The id a reveal or log entry names: the source's def id or the mod id. */
function originId(origin: Origin): string {
  return origin.kind === "seat" ? origin.sourceId : origin.modId;
}

type RunOp = Extract<ToolkitOp, { readonly op: RunOpName }>;
const RUN_OPS = ["adjust-supplies", "adjust-coins", "break-item", "grant-item", "give-item", "drop-item", "swap-slots", "drop-offer", "add-offer", "reroll-route"] as const;
type RunOpName = (typeof RUN_OPS)[number];

function isRunOp(op: ToolkitOp): op is RunOp {
  return (RUN_OPS as readonly string[]).includes(op.op);
}

function seatNamed(run: RunState, seatId: string, opName: string): SeatRun {
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (seat === undefined) throw new Error(`toolkit: ${opName}: unknown seat ${seatId}`);
  return seat;
}

function withSeat(run: RunState, seatId: string, patch: (seat: SeatRun) => SeatRun): RunState {
  return { ...run, seats: run.seats.map((s) => (s.seatId === seatId ? patch(s) : s)) };
}

function withoutItem(seat: SeatRun, uid: string): SeatRun {
  return { ...seat, items: seat.items.filter((item) => item.uid !== uid), equipped: seat.equipped.filter((u) => u !== uid) };
}

/** An op that changes the run outside the attempt; these work in any stage. */
function applyRunOp(run: RunState, op: RunOp, rules: RunRules, catalog: Catalog): RunState {
  switch (op.op) {
    case "adjust-supplies": {
      // The crew keeps at least one supply and never exceeds the cap.
      const supplies = run.supplies + op.delta;
      if (!Number.isInteger(op.delta) || supplies < 1 || supplies > SUPPLIES_MAX) {
        throw new Error(`toolkit: adjust-supplies: ${run.supplies} + ${op.delta} leaves [1, ${SUPPLIES_MAX}]`);
      }
      return { ...run, supplies };
    }
    case "adjust-coins": {
      const purse = run.purse + op.delta;
      if (!Number.isInteger(op.delta) || purse < 0) {
        throw new Error(`toolkit: adjust-coins: ${run.purse} + ${op.delta} is below 0`);
      }
      return { ...run, purse };
    }
    case "break-item": {
      // Only an equipped instance breaks; the backpack is out of reach.
      if (!seatNamed(run, op.seatId, op.op).equipped.includes(op.uid)) {
        throw new Error(`toolkit: break-item: ${op.uid} is not equipped by ${op.seatId}`);
      }
      return withSeat(run, op.seatId, (seat) => withoutItem(seat, op.uid));
    }
    case "grant-item": {
      seatNamed(run, op.seatId, op.op);
      if (!Object.hasOwn(catalog.items, op.itemId)) throw new Error(`toolkit: grant-item: unknown item ${op.itemId}`);
      return mintItems(run, op.seatId, [op.itemId], catalog);
    }
    case "give-item": {
      // The instance keeps its uid, so the uses already spent go with it.
      const from = seatNamed(run, op.fromSeatId, op.op);
      const item = from.items.find((i) => i.uid === op.uid);
      const to = seatNamed(run, op.toSeatId, op.op);
      if (item === undefined || from.seatId === to.seatId) throw new Error(`toolkit: give-item: ${op.uid} is not ${op.fromSeatId}'s to give to ${op.toSeatId}`);
      if (roomFor(run, to.seatId, catalog) < 1) throw new Error(`toolkit: give-item: ${op.toSeatId} has no room for ${op.uid}`);
      const free = to.equipped.length < rules.itemSlots(run, to.seatId);
      const given = withSeat(run, from.seatId, (seat) => withoutItem(seat, op.uid));
      return withSeat(given, to.seatId, (seat) => ({ ...seat, items: [...seat.items, item], equipped: free ? [...seat.equipped, item.uid] : seat.equipped }));
    }
    case "drop-item": {
      if (!seatNamed(run, op.seatId, op.op).items.some((item) => item.uid === op.uid)) throw new Error(`toolkit: drop-item: ${op.seatId} does not own ${op.uid}`);
      return withSeat(run, op.seatId, (seat) => withoutItem(seat, op.uid));
    }
    case "swap-slots": {
      // An equipped instance goes to the backpack and a backpack one is
      // equipped; either side may be empty, and the slots still hold.
      const seat = seatNamed(run, op.seatId, op.op);
      const owns = (uid: string) => seat.items.some((item) => item.uid === uid);
      if (op.unequip !== null && !seat.equipped.includes(op.unequip)) throw new Error(`toolkit: swap-slots: ${op.unequip} is not equipped`);
      if (op.equip !== null && (!owns(op.equip) || seat.equipped.includes(op.equip))) throw new Error(`toolkit: swap-slots: ${op.equip} is not in the backpack`);
      if (op.unequip === null && op.equip === null) throw new Error("toolkit: swap-slots: nothing to swap");
      const equipped = [...seat.equipped.filter((uid) => uid !== op.unequip), ...(op.equip === null ? [] : [op.equip])];
      if (equipped.length > rules.itemSlots(run, seat.seatId)) throw new Error("toolkit: swap-slots: more items than slots");
      return withSeat(run, seat.seatId, (s) => ({ ...s, equipped }));
    }
    case "drop-offer": {
      if (seatNamed(run, op.seatId, op.op).offers.length === 0) throw new Error(`toolkit: drop-offer: ${op.seatId} has no offer`);
      return withSeat(run, op.seatId, (seat) => ({ ...seat, offers: seat.offers.slice(1) }));
    }
    case "add-offer": {
      seatNamed(run, op.seatId, op.op);
      for (const id of op.offer.bundles.flat()) if (!Object.hasOwn(catalog.items, id)) throw new Error(`toolkit: add-offer: unknown item ${id}`);
      return withSeat(run, op.seatId, (seat) => ({ ...seat, offers: [...seat.offers, op.offer] }));
    }
    case "reroll-route": {
      if (run.stage.tag !== "route") throw new Error(`toolkit: reroll-route: the run is at ${run.stage.tag}, not a route vote`);
      return rerollOption(run as RunState & { readonly stage: Extract<RunState["stage"], { tag: "route" }> }, op.option, catalog);
    }
  }
}

/** The camp's next objective id: minted like the deal's, on its own stream,
 * clear of every card and objective id in the camp. */
function addedObjectiveId(run: RunState, camp: CampState, attempt: AttemptState): string {
  const index = run.stage.tag === "camp" ? run.stage.camp.index : 0;
  const taken = new Set([...campCardIds(camp), ...camp.objectives.map((o) => o.id)]);
  const stream = STREAMS.addedObjective(index, attempt.attemptNumber, camp.objectives.length);
  return mintCardId(seedToRngState(attemptSeed(run.seed, index, attempt.attemptNumber), stream), taken).id;
}

function applyOp(run: RunState, origin: Origin, op: ToolkitOp, rules: RunRules, catalog: Catalog): RunState {
  if (isRunOp(op)) return applyRunOp(run, op, rules, catalog);
  const attempt = attemptOf(run);
  if (attempt === null) throw new Error(`toolkit: ${op.op}: needs a dealt camp, but the run is at ${run.stage.tag}`);
  return withAttempt(run, applyAttemptOp(run, attempt, origin, op, rules));
}

function applyAttemptOp(run: RunState, attempt: AttemptState, origin: Origin, op: Exclude<ToolkitOp, RunOp>, rules: RunRules): AttemptState {
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
      const reveal: Reveal = { cardId: whisper.cardId, fromSeatId: whisper.fromSeatId, audience: op.audience, source: originId(origin) };
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
      const reveal: Reveal = { cardId: op.cardId, fromSeatId: holder.seatId, audience: op.audience, source: originId(origin) };
      return { ...attempt, reveals: [...attempt.reveals, reveal] };
    }

    case "add-modifier": {
      const atTrick = attempt.camp.currentTrick.index;
      const effect: ActiveEffect = { origin, atTrick, lasts: op.lasts, deferIfFatal: op.deferIfFatal === true, params: op.params, audience: op.audience };
      return { ...attempt, effects: [...attempt.effects, effect] };
    }

    case "discard-round": {
      // Exactly one card from every hand leaves for the discards, so every
      // hand stays the same size and the camp is one trick shorter.
      const camp = attempt.camp;
      const taken = camp.hands.map((hand) => hand.cards.filter((card) => op.cardIds.includes(card.id)));
      if (op.cardIds.length !== camp.hands.length || taken.some((cards) => cards.length !== 1)) {
        throw new Error("toolkit: discard-round: needs exactly one card from every hand");
      }
      const afterTrick = camp.completedTricks.length;
      const hands = camp.hands.map((hand) => ({ seatId: hand.seatId, cards: hand.cards.filter((card) => !op.cardIds.includes(card.id)) }));
      const discards = [...camp.discards, ...taken.map((cards) => ({ card: cards[0]!, afterTrick }))];
      return { ...attempt, camp: { ...camp, hands, discards, totalTricks: camp.totalTricks - 1 } };
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

    case "add-objective": {
      const camp = attempt.camp;
      const target = camp.objectiveDeck[0];
      if (target === undefined) throw new Error("toolkit: add-objective: the objective deck is empty");
      if (op.ownerSeatId !== null && !run.seatIds.includes(op.ownerSeatId)) throw new Error(`toolkit: add-objective: unknown seat ${op.ownerSeatId}`);
      const objective: Objective = { id: addedObjectiveId(run, camp, attempt), kind: "win-card", target, ownerSeatId: op.ownerSeatId };
      return { ...attempt, camp: { ...camp, objectives: [...camp.objectives, objective], objectiveDeck: camp.objectiveDeck.slice(1) } };
    }

    case "retarget-objective": {
      // Only a pending card objective moves, and only onto a card dealt this camp.
      const camp = attempt.camp;
      const objective = camp.objectives.find((o) => o.id === op.objectiveId);
      if (objective === undefined || (objective.kind !== "win-card" && objective.kind !== "ordered")) {
        throw new Error(`toolkit: retarget-objective: ${op.objectiveId} is not a card objective`);
      }
      if (rules.objectiveStatus(camp, objective) !== "pending") throw new Error("toolkit: retarget-objective: the objective is not pending");
      if (camp.removedCards.some((identity) => identitiesEqual(identity, op.target))) throw new Error("toolkit: retarget-objective: the card is not in this camp");
      const objectives = camp.objectives.map((o) => (o.id === op.objectiveId ? { ...objective, target: op.target } : o));
      return { ...attempt, camp: { ...camp, objectives } };
    }

    case "void-trick": {
      // The last completed trick, between tricks: its cards go back to the
      // hands that played them and its leader leads again.
      const camp = attempt.camp;
      const trick = camp.completedTricks[camp.completedTricks.length - 1];
      if (trick === undefined || trick.index !== op.trickIndex) throw new Error(`toolkit: void-trick: ${op.trickIndex} is not the last completed trick`);
      if (camp.currentTrick.plays.length > 0) throw new Error("toolkit: void-trick: a trick is in progress");
      const hands = camp.hands.map((h) => ({ seatId: h.seatId, cards: [...h.cards, ...trick.plays.filter((p) => p.seatId === h.seatId).map((p) => p.card)] }));
      const plays = trick.plays.map((p) => ({ seatId: p.seatId, card: p.card }));
      return {
        ...attempt,
        camp: {
          ...camp,
          hands,
          completedTricks: camp.completedTricks.slice(0, -1),
          voidedTricks: [...camp.voidedTricks, { index: trick.index, leaderSeatId: trick.leaderSeatId, plays }],
          currentTrick: { ...camp.currentTrick, leaderSeatId: trick.leaderSeatId },
        },
      };
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
        actorSeatId: origin.kind === "seat" ? origin.seatId : null,
        subjectSeatIds: op.subjectSeatIds,
        sourceId: originId(origin),
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

/** The sole executor of ability and camp-modifier effects (spec §6.3).
 * Folds `ops` over the RunState in order, never mutating `run` or any of its
 * nested objects, and in a camp asserts card conservation once the fold
 * completes (T-10-13): a broken op is a content-author defect and THROWS
 * (POLICY A3), never silently corrupting state. `rules` are the composed
 * rules before the ops, which the objective and slot guards read. */
export function applyToolkitOps(run: RunState, origin: Origin, ops: readonly ToolkitOp[], rules: RunRules, catalog: Catalog): RunState {
  const attempt = attemptOf(run);
  const beforeIds = attempt === null ? [] : campCardIds(attempt.camp);

  let next = run;
  for (const op of ops) {
    next = applyOp(next, origin, op, rules, catalog);
  }

  if (attempt === null) return next;
  const afterIds = campCardIds(attemptOf(next)!.camp);
  if (afterIds.length !== beforeIds.length || afterIds.some((id, i) => id !== beforeIds[i])) {
    throw new Error("toolkit: card conservation violated");
  }
  if (new Set(afterIds).size !== afterIds.length) {
    throw new Error("toolkit: card conservation violated");
  }

  return next;
}
