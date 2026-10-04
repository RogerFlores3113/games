// Tests for the Phase 10 toolkit (Plan 04). Fixtures are built inline: a
// 3-seat RunState whose attempt.camp is createCamp(...), with objectives
// picked via currentActorSeatId + applyCampAction (never a hand-rolled copy
// of the pick-order rule — mirrors test-support.ts's own discipline).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyCampAction } from "../actions";
import { cardLabel } from "../deck";
import { evaluateObjective } from "../objectives";
import { campPhase, createCamp, currentActorSeatId } from "../camp";
import { baseRules } from "../rules";
import type { CampState, WinCardObjective } from "../state";
import { resolvedPlay } from "../test-support";
import { attemptOf, withAttempt } from "./attempt";
import { campIndex } from "./plan";
import { CATALOG } from "./catalog";
import { campSpecAt } from "./route";
import { baseRunHooks } from "./run-rules";
import type { RunRules } from "./run-rules";
import type { Origin, RunState, SeatRun } from "./types";
import { applyToolkitOps, campCardIds, type ToolkitOp } from "./toolkit";
import { currentWindow } from "./windows";

const SEAT_IDS = ["p0", "p1", "p2"] as const;

const rules: RunRules = { ...baseRules, ...baseRunHooks };

function freshCamp(seed = "toolkit-seed"): CampState {
  return createCamp(
    { seatIds: [...SEAT_IDS], seed, objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }] },
    rules,
  );
}

/** Picks every face-up objective via the real currentActorSeatId +
 * applyCampAction path, landing the camp in "playing" phase. */
function pickAllObjectives(camp: CampState): CampState {
  let state = camp;
  while (campPhase(state, rules) === "objective-pick") {
    const actor = currentActorSeatId(state, rules)!;
    const objective = state.objectives.find((o) => o.ownerSeatId === null)!;
    const result = applyCampAction(state, actor, { type: "pick-objective", objectiveId: objective.id }, rules);
    if (!result.ok) throw new Error(`test setup: pick-objective failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

/** Plays exactly one full trick (seatIds.length plays) via the real legal-
 * plays path, so play order/follow-suit is never hand-rolled. */
function playOneTrick(camp: CampState): CampState {
  let state = camp;
  for (let i = 0; i < state.seatIds.length; i++) {
    const actor = currentActorSeatId(state, rules)!;
    const legal = rules.legalPlays(state, actor);
    const card = legal[0]!;
    const result = applyCampAction(state, actor, { type: "play-card", cardId: card.id }, rules);
    if (!result.ok) throw new Error(`test setup: play-card failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

/** A seat acting through `sourceId` (its key is the id). */
function by(seatId: string, sourceId: string): Origin {
  return { kind: "seat", seatId, sourceKey: sourceId, sourceId };
}

function makeSeats(): readonly SeatRun[] {
  return SEAT_IDS.map((seatId) => ({ seatId, characterId: "plain-1", upgradeId: null, items: [], equipped: [], offers: [], ledger: [] }));
}

/** A run in camp 1 whose attempt holds `camp`; at the loadout, with no
 * attempt, when camp is null. */
function makeRun(input: { camp: CampState | null; seed?: string }): RunState {
  const seed = input.seed ?? "toolkit-seed";
  const spec = campSpecAt(seed, "standard", campIndex(1), CATALOG);
  const stage: RunState["stage"] =
    input.camp === null
      ? { tag: "loadout", camp: spec, stock: null, ready: {} }
      : { tag: "camp", camp: spec, attempt: { attemptNumber: 1, effects: [], reveals: [], log: [], camp: input.camp } };

  return { seed, seatIds: [...SEAT_IDS], seats: makeSeats(), purse: 0, supplies: 3, plan: { length: "standard", bosses: [] }, history: [], lastVote: null, itemSerial: 0, stage };
}

describe("currentWindow", () => {
  it("is the loadout window at the loadout (no attempt)", () => {
    const run = makeRun({ camp: null });
    expect(currentWindow(run, rules)).toBe("loadout");
  });

  it("is objective-pick for a freshly dealt camp", () => {
    const camp = freshCamp();
    const run = makeRun({ camp });
    expect(currentWindow(run, rules)).toBe("objective-pick");
  });

  it("is between-tricks once every objective is picked and no card has been played", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(currentWindow(run, rules)).toBe("between-tricks");
  });

  it("closes between-tricks and opens in-trick the instant the trick's leader plays (D-13, no grace period)", () => {
    let camp = pickAllObjectives(freshCamp());
    const actor = currentActorSeatId(camp, rules)!;
    const card = rules.legalPlays(camp, actor)[0]!;
    const result = applyCampAction(camp, actor, { type: "play-card", cardId: card.id }, rules);
    if (!result.ok) throw new Error("test setup failed");
    camp = result.state;
    const run = makeRun({ camp });
    expect(currentWindow(run, rules)).toBe("in-trick");
  });

  it("returns to between-tricks once the trick completes", () => {
    const camp = playOneTrick(pickAllObjectives(freshCamp()));
    const run = makeRun({ camp });
    expect(camp.currentTrick.plays).toHaveLength(0);
    expect(currentWindow(run, rules)).toBe("between-tricks");
  });
});

describe("campCardIds", () => {
  it("lists every card across hands, completed tricks and the current trick, sorted", () => {
    const camp = playOneTrick(pickAllObjectives(freshCamp()));
    const ids = campCardIds(camp);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("applyToolkitOps", () => {
  it("throws for an op on the attempt when there is no attempt in progress, and applies a run op", () => {
    const run = makeRun({ camp: null });
    expect(() => applyToolkitOps(run, by("p0", "some-gear"), [{ op: "remove-objective", objectiveId: "x" }], rules, CATALOG)).toThrow(
      "toolkit: remove-objective: needs a dealt camp, but the run is at loadout",
    );
    expect(applyToolkitOps(run, by("p0", "some-gear"), [{ op: "adjust-coins", delta: 3 }], rules, CATALOG).purse).toBe(run.purse + 3);
  });

  it("never mutates the input RunState across a multi-op list", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const before = structuredClone(run);
    const p0Card = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const ops: ToolkitOp[] = [
      { op: "move-card", cardId: p0Card.id, fromSeatId: "p0", toSeatId: "p1" },
      { op: "add-modifier", lasts: "attempt", params: {}, audience: "public" },
      { op: "log", event: "test-event", subjectSeatIds: ["p0"], audience: "public" },
    ];
    applyToolkitOps(run, by("p0", "test-gear"), ops, rules, CATALOG);
    expect(run).toEqual(before);
  });

  it("move-card moves the card id from one hand to the end of the other", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const result = applyToolkitOps(run, by("p0", "test-gear"), [
      { op: "move-card", cardId: card.id, fromSeatId: "p0", toSeatId: "p1" },
    ], rules, CATALOG);
    const p0Hand = attemptOf(result)!.camp.hands.find((h) => h.seatId === "p0")!;
    const p1Hand = attemptOf(result)!.camp.hands.find((h) => h.seatId === "p1")!;
    expect(p0Hand.cards.some((c) => c.id === card.id)).toBe(false);
    expect(p1Hand.cards[p1Hand.cards.length - 1]!.id).toBe(card.id);
    expect(campCardIds(attemptOf(result)!.camp)).toEqual(campCardIds(camp));
  });

  it("move-card throws when the card is not in the from-seat's hand", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, by("p0", "test-gear"), [
        { op: "move-card", cardId: "not-a-real-card", fromSeatId: "p0", toSeatId: "p1" },
      ], rules, CATALOG),
    ).toThrow();
  });

  it("move-card throws when fromSeatId === toSeatId", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "test-gear"), [
        { op: "move-card", cardId: card.id, fromSeatId: "p0", toSeatId: "p0" },
      ], rules, CATALOG),
    ).toThrow();
  });

  it("swap-cards exchanges two cards in place", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const cardA = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const cardB = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    const result = applyToolkitOps(run, by("p0", "test-gear"), [
      { op: "swap-cards", seatA: "p0", cardIdA: cardA.id, seatB: "p1", cardIdB: cardB.id },
    ], rules, CATALOG);
    const p0Hand = attemptOf(result)!.camp.hands.find((h) => h.seatId === "p0")!;
    const p1Hand = attemptOf(result)!.camp.hands.find((h) => h.seatId === "p1")!;
    expect(p0Hand.cards.some((c) => c.id === cardB.id)).toBe(true);
    expect(p1Hand.cards.some((c) => c.id === cardA.id)).toBe(true);
    expect(campCardIds(attemptOf(result)!.camp)).toEqual(campCardIds(camp));
  });

  it("swap-cards throws when a card is not in the named seat's hand", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const cardB = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "test-gear"), [
        { op: "swap-cards", seatA: "p0", cardIdA: "not-real", seatB: "p1", cardIdB: cardB.id },
      ], rules, CATALOG),
    ).toThrow();
  });

  it("replace-objective keeps id/kind/order and pulls the next objective-deck card", () => {
    const camp = createCamp(
      {
        seatIds: [...SEAT_IDS],
        seed: "replace-seed",
        objectiveSlots: [{ kind: "ordered", order: 1 }],
      },
      rules,
    );
    const run = makeRun({ camp });
    const objective = camp.objectives[0]!;
    const nextCard = camp.objectiveDeck[0]!;
    const result = applyToolkitOps(run, by("p0", "compass"), [{ op: "replace-objective", objectiveId: objective.id }], rules, CATALOG);
    const updated = attemptOf(result)!.camp.objectives[0]!;
    expect(updated.id).toBe(objective.id);
    expect(updated.kind).toBe(objective.kind);
    expect((updated as { order: unknown }).order).toBe((objective as { order: unknown }).order);
    expect((updated as { target: unknown }).target).toEqual(nextCard);
    expect(attemptOf(result)!.camp.objectiveDeck).toEqual(camp.objectiveDeck.slice(1));
  });

  it("replace-objective on a win-card objective keeps id/kind and pulls the next objective-deck card (CR-01)", () => {
    const camp = createCamp(
      {
        seatIds: [...SEAT_IDS],
        seed: "replace-win-card-seed",
        objectiveSlots: [{ kind: "win-card" }],
      },
      rules,
    );
    const run = makeRun({ camp });
    const objective = camp.objectives[0]!;
    const nextCard = camp.objectiveDeck[0]!;
    const result = applyToolkitOps(run, by("p0", "compass"), [{ op: "replace-objective", objectiveId: objective.id }], rules, CATALOG);
    const updated = attemptOf(result)!.camp.objectives[0]!;
    expect(updated.id).toBe(objective.id);
    expect(updated.kind).toBe("win-card");
    expect((updated as { target: unknown }).target).toEqual(nextCard);
    expect(attemptOf(result)!.camp.objectiveDeck).toEqual(camp.objectiveDeck.slice(1));
  });

  it("replace-objective throws on an owned objective", () => {
    const camp = pickAllObjectives(
      createCamp({ seatIds: [...SEAT_IDS], seed: "replace-owned", objectiveSlots: [{ kind: "ordered", order: 1 }] }, rules),
    );
    const run = makeRun({ camp });
    const objective = camp.objectives[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "compass"), [{ op: "replace-objective", objectiveId: objective.id }], rules, CATALOG),
    ).toThrow();
  });

  it("replace-objective throws on a cardless objective", () => {
    const camp = createCamp(
      { seatIds: [...SEAT_IDS], seed: "replace-cardless", objectiveSlots: [{ kind: "no-tricks" }] },
      rules,
    );
    const run = makeRun({ camp });
    const objective = camp.objectives[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "compass"), [{ op: "replace-objective", objectiveId: objective.id }], rules, CATALOG),
    ).toThrow();
  });

  it("replace-objective throws when the objective deck is empty", () => {
    const camp = createCamp(
      { seatIds: [...SEAT_IDS], seed: "replace-empty-deck", objectiveSlots: [{ kind: "ordered", order: 1 }] },
      rules,
    );
    const emptied: CampState = { ...camp, objectiveDeck: [] };
    const run = makeRun({ camp: emptied });
    const objective = emptied.objectives[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "compass"), [{ op: "replace-objective", objectiveId: objective.id }], rules, CATALOG),
    ).toThrow();
  });

  it("swap-objectives(p0, p1) only moves pending objectives, not an already-done one (D-10)", () => {
    const camp = createCamp(
      { seatIds: [...SEAT_IDS], seed: "swap-seed", objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }] },
      rules,
    );
    const [objA, objB] = camp.objectives as [WinCardObjective, WinCardObjective];
    const p0Card = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const doneObjective: WinCardObjective = { ...objA, ownerSeatId: "p0", target: p0Card.identity as never };
    const pendingObjective: WinCardObjective = { ...objB, ownerSeatId: "p1" };
    // Craft a completed trick that resolves doneObjective for p0, so
    // evaluateObjective reports it "done" rather than "pending".
    const rigged: CampState = {
      ...camp,
      hands: camp.hands.map((h) => (h.seatId === "p0" ? { ...h, cards: h.cards.filter((c) => c.id !== p0Card.id) } : h)),
      objectives: [doneObjective, pendingObjective],
      completedTricks: [{ index: 0, leaderSeatId: "p0", plays: [resolvedPlay("p0", p0Card)], winnerSeatId: "p0" }],
    };
    const run = makeRun({ camp: rigged });
    const result = applyToolkitOps(run, by("p0", "trail-map"), [{ op: "swap-objectives", seatA: "p0", seatB: "p1" }], rules, CATALOG);
    const objectives = attemptOf(result)!.camp.objectives;
    expect(objectives.find((o) => o.id === doneObjective.id)!.ownerSeatId).toBe("p0"); // unchanged — done
    expect(objectives.find((o) => o.id === pendingObjective.id)!.ownerSeatId).toBe("p0"); // swapped — pending
  });

  it("remove-objective removes the objective (D-11)", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const objective = camp.objectives[0]!;
    const result = applyToolkitOps(run, by("p0", "camouflage"), [{ op: "remove-objective", objectiveId: objective.id }], rules, CATALOG);
    expect(attemptOf(result)!.camp.objectives.some((o) => o.id === objective.id)).toBe(false);
  });

  it("remove-objective throws for an unknown id", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, by("p0", "camouflage"), [{ op: "remove-objective", objectiveId: "no-such-id" }], rules, CATALOG),
    ).toThrow();
  });

  it("reveal appends a Reveal with the holder's seat and the source id as source", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    const result = applyToolkitOps(run, by("p0", "explorer"), [{ op: "reveal", cardId: card.id, audience: ["p0"] }], rules, CATALOG);
    const reveal = attemptOf(result)!.reveals[0]!;
    expect(reveal.cardId).toBe(card.id);
    expect(reveal.fromSeatId).toBe("p1");
    expect(reveal.audience).toEqual(["p0"]);
    expect(reveal.source).toBe("explorer");
  });

  it("reveal throws for an empty audience", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "whisper"), [{ op: "reveal", cardId: card.id, audience: [] }], rules, CATALOG),
    ).toThrow();
  });

  it("reveal throws for an audience containing a non-seat", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "whisper"), [{ op: "reveal", cardId: card.id, audience: ["not-a-seat"] }], rules, CATALOG),
    ).toThrow();
  });

  it("reveal throws for a duplicated audience", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, by("p0", "whisper"), [{ op: "reveal", cardId: card.id, audience: ["p0", "p0"] }], rules, CATALOG),
    ).toThrow();
  });

  it("reveal throws for a card not in any hand", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, by("p0", "whisper"), [{ op: "reveal", cardId: "not-a-real-card", audience: ["p0"] }], rules, CATALOG),
    ).toThrow();
  });

  it("add-modifier appends an ActiveEffect stamped with the current trick index", () => {
    const camp = playOneTrick(pickAllObjectives(freshCamp()));
    const run = makeRun({ camp });
    const result = applyToolkitOps(run, by("p0", "energy-tonic"), [
      { op: "add-modifier", lasts: "trick", params: { cardId: "c9" }, audience: "owner" },
    ], rules, CATALOG);
    expect(attemptOf(result)!.effects).toEqual([
      { origin: { kind: "seat", seatId: "p0", sourceKey: "energy-tonic", sourceId: "energy-tonic" }, atTrick: 1, lasts: "trick", deferIfFatal: false, params: { cardId: "c9" }, audience: "owner" },
    ]);
  });

  it("set-next-leader sets the leader before trick 1 is allowed (D-09)", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const result = applyToolkitOps(run, by("p1", "machete"), [{ op: "set-next-leader", seatId: "p1" }], rules, CATALOG);
    expect(attemptOf(result)!.camp.currentTrick.leaderSeatId).toBe("p1");
  });

  it("set-next-leader throws once the current trick has plays", () => {
    let camp = pickAllObjectives(freshCamp());
    const actor = currentActorSeatId(camp, rules)!;
    const card = rules.legalPlays(camp, actor)[0]!;
    const played = applyCampAction(camp, actor, { type: "play-card", cardId: card.id }, rules);
    if (!played.ok) throw new Error("test setup failed");
    camp = played.state;
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, by("p1", "machete"), [{ op: "set-next-leader", seatId: "p1" }], rules, CATALOG),
    ).toThrow();
  });

  it("log appends a LogEntry with the actor and source id", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const result = applyToolkitOps(run, by("p0", "some-gear"), [
      { op: "log", event: "used-ability", subjectSeatIds: ["p1"], audience: "public" },
    ], rules, CATALOG);
    expect(attemptOf(result)!.log).toEqual([
      { event: "used-ability", actorSeatId: "p0", subjectSeatIds: ["p1"], sourceId: "some-gear", audience: "public" },
    ]);
  });

  it("log throws for an audience array containing a non-seat", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, by("p0", "some-gear"), [
        { op: "log", event: "used-ability", subjectSeatIds: [], audience: ["not-a-seat"] },
      ], rules, CATALOG),
    ).toThrow();
  });
});

describe("applyToolkitOps: rescue and sharing ops", () => {
  /** One trick played, plus p0's whisper of its first card to p1. */
  function afterOneTrick(): { run: RunState; camp: CampState; winner: string; loser: string } {
    const camp = playOneTrick(pickAllObjectives(freshCamp()));
    const winner = camp.completedTricks[0]!.winnerSeatId;
    const loser = SEAT_IDS.find((id) => id !== winner)!;
    const whispered = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const base = makeRun({ camp });
    const run: RunState = {
      ...withAttempt(base, {
        ...attemptOf(base)!,
        reveals: [
          { cardId: whispered.id, fromSeatId: "p0", audience: ["p1"], source: "whisper", targetSeatId: "p1" },
          { cardId: whispered.id, fromSeatId: "p0", audience: ["p2"], source: "spyglass" },
        ],
      }),
      supplies: 2,
    };
    return { run, camp, winner, loser };
  }

  /** The camp with its objectives replaced by one failed win-card owned by
   * `owner` (trick 0's card, won by someone else). */
  function withFailedObjective(camp: CampState, owner: string): { camp: CampState; failed: WinCardObjective } {
    const play = camp.completedTricks[0]!.plays.find((p) => p.card.identity.kind === "standard" && p.seatId !== owner)!;
    const failed: WinCardObjective = {
      id: "obj-failed",
      kind: "win-card",
      target: play.card.identity as WinCardObjective["target"],
      ownerSeatId: owner,
    };
    return { camp: { ...camp, objectives: [failed] }, failed };
  }

  it("replace-objective turns an owned failed objective into a win-card on a card still in a hand", () => {
    const { run, camp, loser } = afterOneTrick();
    const { camp: failing } = withFailedObjective(camp, loser);
    const inHand = new Set(failing.hands.flatMap((h) => h.cards.map((c) => cardLabel(c.identity))));
    const freshIndex = failing.objectiveDeck.findIndex((identity) => inHand.has(cardLabel(identity)));
    const deck = [{ kind: "standard", suit: "hearts", rank: 99 } as never, ...failing.objectiveDeck];
    const result = applyToolkitOps(withAttempt(run, { ...attemptOf(run)!, camp: { ...failing, objectiveDeck: deck } }), by(loser, "antidote"), [
      { op: "replace-objective", objectiveId: "obj-failed" },
    ], rules, CATALOG);
    const after = attemptOf(result)!.camp;
    expect(after.objectives).toEqual([
      { id: "obj-failed", kind: "win-card", target: failing.objectiveDeck[freshIndex], ownerSeatId: loser },
    ]);
    expect(after.objectiveDeck).toHaveLength(deck.length - 1);
    expect(after.objectiveDeck[0]).toEqual(deck[0]);
  });

  it("replace-objective throws on an owned objective that has not failed, or with no deck card in a hand", () => {
    const { run, camp, loser } = afterOneTrick();
    const { camp: failing } = withFailedObjective(camp, loser);
    const pending: CampState = { ...failing, objectives: [{ id: "obj-open", kind: "no-tricks", ownerSeatId: loser }] };
    const noFresh: CampState = { ...failing, objectiveDeck: [] };
    for (const c of [pending, noFresh]) {
      const objectiveId = c.objectives[0]!.id;
      expect(() =>
        applyToolkitOps(withAttempt(run, { ...attemptOf(run)!, camp: c }), by(loser, "antidote"), [{ op: "replace-objective", objectiveId }], rules, CATALOG),
      ).toThrow(/replace-objective/);
    }
  });

  it("reassign-objective gives an owned objective to another seat", () => {
    const { run, camp, loser, winner } = afterOneTrick();
    const { camp: failing } = withFailedObjective(camp, loser);
    const result = applyToolkitOps(withAttempt(run, { ...attemptOf(run)!, camp: failing }), by(loser, "rally"), [
      { op: "reassign-objective", objectiveId: "obj-failed", toSeatId: winner },
    ], rules, CATALOG);
    const objective = attemptOf(result)!.camp.objectives[0]!;
    expect(objective.ownerSeatId).toBe(winner);
    expect(evaluateObjective(attemptOf(result)!.camp, objective)).toBe("done");
  });

  it("reassign-objective throws for an unowned objective, an unknown seat, or the current owner", () => {
    const { run, camp, loser } = afterOneTrick();
    const { camp: failing } = withFailedObjective(camp, loser);
    const unowned: CampState = { ...failing, objectives: [{ id: "obj-free", kind: "no-tricks", ownerSeatId: null }] };
    const cases: Array<[CampState, string, string]> = [
      [unowned, "obj-free", "p1"],
      [failing, "obj-failed", "not-a-seat"],
      [failing, "obj-failed", loser],
      [failing, "obj-missing", "p1"],
    ];
    for (const [c, objectiveId, toSeatId] of cases) {
      expect(() =>
        applyToolkitOps(withAttempt(run, { ...attemptOf(run)!, camp: c }), by("p0", "detour"), [{ op: "reassign-objective", objectiveId, toSeatId }], rules, CATALOG),
      ).toThrow(/reassign-objective/);
    }
  });

  it("reassign-trick changes a completed trick's winner and moves no card", () => {
    const { run, camp, winner, loser } = afterOneTrick();
    const result = applyToolkitOps(run, by(winner, "pack-mule"), [{ op: "reassign-trick", trickIndex: 0, toSeatId: loser }], rules, CATALOG);
    const after = attemptOf(result)!.camp;
    expect(after.completedTricks[0]).toEqual({ ...camp.completedTricks[0]!, winnerSeatId: loser });
    expect(campCardIds(after)).toEqual(campCardIds(camp));
  });

  it("reassign-trick throws for a trick not yet completed or the current winner", () => {
    const { run, winner, loser } = afterOneTrick();
    expect(() => applyToolkitOps(run, by(winner, "pack-mule"), [{ op: "reassign-trick", trickIndex: 1, toSeatId: loser }], rules, CATALOG)).toThrow(/reassign-trick/);
    expect(() => applyToolkitOps(run, by(winner, "pack-mule"), [{ op: "reassign-trick", trickIndex: 0, toSeatId: winner }], rules, CATALOG)).toThrow(/reassign-trick/);
  });

  it("share-reveal copies the nth whisper's card and pinned holder to a new audience", () => {
    const { run } = afterOneTrick();
    const whisper = attemptOf(run)!.reveals[0]!;
    const result = applyToolkitOps(run, by("p0", "loud-call"), [{ op: "share-reveal", whisperOrdinal: 0, audience: ["p1", "p2"] }], rules, CATALOG);
    expect(attemptOf(result)!.reveals[2]).toEqual({ cardId: whisper.cardId, fromSeatId: "p0", audience: ["p1", "p2"], source: "loud-call" });
  });

  it("share-reveal counts whispers only and throws past the last one or for a bad audience", () => {
    const { run } = afterOneTrick();
    expect(() => applyToolkitOps(run, by("p0", "loud-call"), [{ op: "share-reveal", whisperOrdinal: 1, audience: ["p2"] }], rules, CATALOG)).toThrow(/share-reveal/);
    expect(() => applyToolkitOps(run, by("p0", "loud-call"), [{ op: "share-reveal", whisperOrdinal: 0, audience: [] }], rules, CATALOG)).toThrow(/share-reveal/);
    expect(() => applyToolkitOps(run, by("p0", "loud-call"), [{ op: "share-reveal", whisperOrdinal: 0, audience: ["p2", "p2"] }], rules, CATALOG)).toThrow(/share-reveal/);
  });

  it("adjust-supplies changes the crew's supplies within [1, SUPPLIES_MAX]", () => {
    const { run } = afterOneTrick();
    expect(applyToolkitOps(run, by("p0", "field-kit"), [{ op: "adjust-supplies", delta: 1 }], rules, CATALOG).supplies).toBe(3);
    expect(applyToolkitOps(run, by("p0", "field-kit"), [{ op: "adjust-supplies", delta: 2 }], rules, CATALOG).supplies).toBe(4);
    expect(applyToolkitOps(run, by("p0", "triage"), [{ op: "adjust-supplies", delta: -1 }], rules, CATALOG).supplies).toBe(1);
  });

  it("adjust-supplies throws when the result would spend the last supply or pass the maximum", () => {
    const { run } = afterOneTrick();
    expect(() => applyToolkitOps(run, by("p0", "triage"), [{ op: "adjust-supplies", delta: -2 }], rules, CATALOG)).toThrow(/adjust-supplies/);
    expect(() => applyToolkitOps(run, by("p0", "field-kit"), [{ op: "adjust-supplies", delta: 3 }], rules, CATALOG)).toThrow(/adjust-supplies/);
    expect(() => applyToolkitOps(run, by("p0", "field-kit"), [{ op: "adjust-supplies", delta: 0.5 }], rules, CATALOG)).toThrow(/adjust-supplies/);
  });

  it("break-item removes an equipped instance from its owner's items and slots", () => {
    const { run } = afterOneTrick();
    const holding = { ...run, itemSerial: 2, seats: run.seats.map((s) => (s.seatId === "p1" ? { ...s, items: [{ uid: "it0", itemId: "bait" }, { uid: "it1", itemId: "parrot" }], equipped: ["it0", "it1"] } : s)) };
    const after = applyToolkitOps(holding, { kind: "mod", modId: "locusts", strength: "full" }, [{ op: "break-item", seatId: "p1", uid: "it0" }], rules, CATALOG);
    expect(after.seats[1]).toMatchObject({ items: [{ uid: "it1", itemId: "parrot" }], equipped: ["it1"] });
  });

  it("break-item throws for an instance in the backpack or not owned", () => {
    const { run } = afterOneTrick();
    const packed = { ...run, itemSerial: 1, seats: run.seats.map((s) => (s.seatId === "p1" ? { ...s, items: [{ uid: "it0", itemId: "bait" }], equipped: [] } : s)) };
    expect(() => applyToolkitOps(packed, by("p0", "x"), [{ op: "break-item", seatId: "p1", uid: "it0" }], rules, CATALOG)).toThrow(/break-item/);
    expect(() => applyToolkitOps(packed, by("p0", "x"), [{ op: "break-item", seatId: "p2", uid: "it0" }], rules, CATALOG)).toThrow(/break-item/);
  });

  it("discard-round takes one card from every hand to the discards and shortens the camp by a trick", () => {
    const { run, camp } = afterOneTrick();
    const cardIds = camp.hands.map((h) => h.cards[0]!.id);
    const after = attemptOf(applyToolkitOps(run, { kind: "mod", modId: "locusts", strength: "full" }, [{ op: "discard-round", cardIds }], rules, CATALOG))!.camp;
    expect(after.totalTricks).toBe(camp.totalTricks - 1);
    expect(after.discards.map((d) => [d.card.id, d.afterTrick])).toEqual(cardIds.map((id) => [id, 1]));
    expect(after.hands.map((h) => h.cards.length)).toEqual(camp.hands.map((h) => h.cards.length - 1));
    expect(campCardIds(after)).toEqual(campCardIds(camp));
  });

  it("discard-round throws unless it names exactly one card from every hand", () => {
    const { run, camp } = afterOneTrick();
    const [a, b] = camp.hands.map((h) => h.cards);
    const locusts = { kind: "mod", modId: "locusts", strength: "full" } as const;
    expect(() => applyToolkitOps(run, locusts, [{ op: "discard-round", cardIds: [a![0]!.id, b![0]!.id] }], rules, CATALOG)).toThrow(/discard-round/);
    expect(() => applyToolkitOps(run, locusts, [{ op: "discard-round", cardIds: [a![0]!.id, a![1]!.id, b![0]!.id] }], rules, CATALOG)).toThrow(/discard-round/);
  });

  it("a camp modifier's ops are logged and revealed under the mod, with no acting seat", () => {
    const { run, camp } = afterOneTrick();
    const cardId = camp.hands[0]!.cards[0]!.id;
    const storm = { kind: "mod", modId: "tornado", strength: "half" } as const;
    const after = attemptOf(applyToolkitOps(run, storm, [{ op: "reveal", cardId, audience: ["p1"] }, { op: "log", event: "blew", subjectSeatIds: [], audience: "public" }], rules, CATALOG))!;
    expect(after.reveals.at(-1)).toEqual({ cardId, fromSeatId: camp.hands[0]!.seatId, audience: ["p1"], source: "tornado" });
    expect(after.log.at(-1)).toEqual({ event: "blew", actorSeatId: null, subjectSeatIds: [], sourceId: "tornado", audience: "public" });
  });

  it("add-modifier stamps the origin and whether the effect waits when fatal", () => {
    const { run } = afterOneTrick();
    const storm = { kind: "mod", modId: "thunderstorm", strength: "full" } as const;
    const after = attemptOf(applyToolkitOps(run, storm, [{ op: "add-modifier", lasts: "trick", audience: "public", params: { strike: true }, deferIfFatal: true }], rules, CATALOG))!;
    expect(after.effects.at(-1)).toEqual({ origin: storm, atTrick: 1, lasts: "trick", deferIfFatal: true, params: { strike: true }, audience: "public" });
  });

  it("property: a random op batch either throws its own op's invariant or conserves every card and keeps supplies in range", () => {
    const { run, camp } = afterOneTrick();
    const handCards = camp.hands.flatMap((h) => h.cards.map((c) => ({ seatId: h.seatId, cardId: c.id })));
    const seat = fc.constantFrom<string>(...SEAT_IDS, "not-a-seat");
    const handCard = fc.constantFrom(...handCards);
    const objectiveId = fc.constantFrom(...camp.objectives.map((o) => o.id), "obj-missing");
    const audience = fc.subarray([...SEAT_IDS] as string[]);
    const op: fc.Arbitrary<ToolkitOp> = fc.oneof(
      fc.record({ a: handCard, to: seat }).map(({ a, to }) => ({ op: "move-card" as const, cardId: a.cardId, fromSeatId: a.seatId, toSeatId: to })),
      fc.record({ a: handCard, b: handCard }).map(({ a, b }) => ({ op: "swap-cards" as const, seatA: a.seatId, cardIdA: a.cardId, seatB: b.seatId, cardIdB: b.cardId })),
      objectiveId.map((id) => ({ op: "replace-objective" as const, objectiveId: id })),
      objectiveId.map((id) => ({ op: "remove-objective" as const, objectiveId: id })),
      fc.record({ id: objectiveId, to: seat }).map(({ id, to }) => ({ op: "reassign-objective" as const, objectiveId: id, toSeatId: to })),
      fc.record({ i: fc.integer({ min: -1, max: 2 }), to: seat }).map(({ i, to }) => ({ op: "reassign-trick" as const, trickIndex: i, toSeatId: to })),
      fc.record({ n: fc.integer({ min: 0, max: 2 }), who: audience }).map(({ n, who }) => ({ op: "share-reveal" as const, whisperOrdinal: n, audience: who })),
      fc.record({ a: handCard, who: audience }).map(({ a, who }) => ({ op: "reveal" as const, cardId: a.cardId, audience: who })),
      fc.integer({ min: -3, max: 3 }).map((delta) => ({ op: "adjust-supplies" as const, delta })),
      fc.record({ a: seat, b: seat }).map(({ a, b }) => ({ op: "swap-objectives" as const, seatA: a, seatB: b })),
      fc.constant<ToolkitOp>({ op: "add-modifier", lasts: "trick", params: {}, audience: "public" }),
    );

    fc.assert(
      fc.property(fc.array(op, { minLength: 1, maxLength: 6 }), (ops) => {
        const before = structuredClone(run);
        let after: RunState;
        try {
          after = applyToolkitOps(run, by("p0", "batch"), ops, rules, CATALOG);
        } catch (error) {
          expect((error as Error).message).toMatch(/^toolkit: /);
          expect((error as Error).message).not.toMatch(/conservation/);
          expect(run).toEqual(before);
          return;
        }
        expect(campCardIds(attemptOf(after)!.camp)).toEqual(campCardIds(camp));
        expect(after.supplies).toBeGreaterThanOrEqual(1);
        expect(after.supplies).toBeLessThanOrEqual(4);
        expect(run).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });
});
