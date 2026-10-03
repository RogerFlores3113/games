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
import { baseRunHooks } from "./run-rules";
import type { RunRules } from "./run-rules";
import type { AttemptState, RunState, SeatRun } from "./types";
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

function makeSeats(): readonly SeatRun[] {
  return SEAT_IDS.map((seatId) => ({ seatId, characterId: "plain-1", kit: [], draftOffer: null, ledger: [] }));
}

function makeRun(input: {
  camp: CampState | null;
  attempt?: AttemptState | null;
  seed?: string;
}): RunState {
  const attempt: AttemptState | null =
    input.attempt !== undefined
      ? input.attempt
      : {
          attemptNumber: 1,
          bossCancelled: false,
          effects: [],
          reveals: [],
          log: [],
          camp: input.camp,
        };

  return {
    seed: input.seed ?? "toolkit-seed",
    seatIds: [...SEAT_IDS],
    campNumber: 1,
    supplies: 10,
    seats: makeSeats(),
    bossTwists: { 3: null, 6: null },
    readySeatIds: [],
    attempt,
    history: [],
  };
}

describe("currentWindow", () => {
  it("is null at the fireside (no attempt)", () => {
    const run = makeRun({ camp: null, attempt: null });
    expect(currentWindow(run, rules)).toBeNull();
  });

  it("is pre-deal when the attempt exists but the camp has not been dealt", () => {
    const run = makeRun({ camp: null });
    expect(currentWindow(run, rules)).toBe("pre-deal");
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
  it("throws when there is no attempt in progress", () => {
    const run = makeRun({ camp: null, attempt: null });
    expect(() => applyToolkitOps(run, "p0", "some-gear", [])).toThrow();
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
    applyToolkitOps(run, "p0", "test-gear", ops);
    expect(run).toEqual(before);
  });

  it("move-card moves the card id from one hand to the end of the other", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const result = applyToolkitOps(run, "p0", "test-gear", [
      { op: "move-card", cardId: card.id, fromSeatId: "p0", toSeatId: "p1" },
    ]);
    const p0Hand = result.attempt!.camp!.hands.find((h) => h.seatId === "p0")!;
    const p1Hand = result.attempt!.camp!.hands.find((h) => h.seatId === "p1")!;
    expect(p0Hand.cards.some((c) => c.id === card.id)).toBe(false);
    expect(p1Hand.cards[p1Hand.cards.length - 1]!.id).toBe(card.id);
    expect(campCardIds(result.attempt!.camp!)).toEqual(campCardIds(camp));
  });

  it("move-card throws when the card is not in the from-seat's hand", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, "p0", "test-gear", [
        { op: "move-card", cardId: "not-a-real-card", fromSeatId: "p0", toSeatId: "p1" },
      ]),
    ).toThrow();
  });

  it("move-card throws when fromSeatId === toSeatId", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, "p0", "test-gear", [
        { op: "move-card", cardId: card.id, fromSeatId: "p0", toSeatId: "p0" },
      ]),
    ).toThrow();
  });

  it("requires a camp for move-card (throws during the pre-deal window)", () => {
    const run = makeRun({ camp: null });
    expect(() =>
      applyToolkitOps(run, "p0", "test-gear", [
        { op: "move-card", cardId: "whatever", fromSeatId: "p0", toSeatId: "p1" },
      ]),
    ).toThrow();
  });

  it("swap-cards exchanges two cards in place", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const cardA = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const cardB = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    const result = applyToolkitOps(run, "p0", "test-gear", [
      { op: "swap-cards", seatA: "p0", cardIdA: cardA.id, seatB: "p1", cardIdB: cardB.id },
    ]);
    const p0Hand = result.attempt!.camp!.hands.find((h) => h.seatId === "p0")!;
    const p1Hand = result.attempt!.camp!.hands.find((h) => h.seatId === "p1")!;
    expect(p0Hand.cards.some((c) => c.id === cardB.id)).toBe(true);
    expect(p1Hand.cards.some((c) => c.id === cardA.id)).toBe(true);
    expect(campCardIds(result.attempt!.camp!)).toEqual(campCardIds(camp));
  });

  it("swap-cards throws when a card is not in the named seat's hand", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const cardB = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, "p0", "test-gear", [
        { op: "swap-cards", seatA: "p0", cardIdA: "not-real", seatB: "p1", cardIdB: cardB.id },
      ]),
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
    const result = applyToolkitOps(run, "p0", "compass", [{ op: "replace-objective", objectiveId: objective.id }]);
    const updated = result.attempt!.camp!.objectives[0]!;
    expect(updated.id).toBe(objective.id);
    expect(updated.kind).toBe(objective.kind);
    expect((updated as { order: unknown }).order).toBe((objective as { order: unknown }).order);
    expect((updated as { target: unknown }).target).toEqual(nextCard);
    expect(result.attempt!.camp!.objectiveDeck).toEqual(camp.objectiveDeck.slice(1));
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
    const result = applyToolkitOps(run, "p0", "compass", [{ op: "replace-objective", objectiveId: objective.id }]);
    const updated = result.attempt!.camp!.objectives[0]!;
    expect(updated.id).toBe(objective.id);
    expect(updated.kind).toBe("win-card");
    expect((updated as { target: unknown }).target).toEqual(nextCard);
    expect(result.attempt!.camp!.objectiveDeck).toEqual(camp.objectiveDeck.slice(1));
  });

  it("replace-objective throws on an owned objective", () => {
    const camp = pickAllObjectives(
      createCamp({ seatIds: [...SEAT_IDS], seed: "replace-owned", objectiveSlots: [{ kind: "ordered", order: 1 }] }, rules),
    );
    const run = makeRun({ camp });
    const objective = camp.objectives[0]!;
    expect(() =>
      applyToolkitOps(run, "p0", "compass", [{ op: "replace-objective", objectiveId: objective.id }]),
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
      applyToolkitOps(run, "p0", "compass", [{ op: "replace-objective", objectiveId: objective.id }]),
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
      applyToolkitOps(run, "p0", "compass", [{ op: "replace-objective", objectiveId: objective.id }]),
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
      completedTricks: [{ index: 0, leaderSeatId: "p0", plays: [{ seatId: "p0", card: p0Card }], winnerSeatId: "p0" }],
    };
    const run = makeRun({ camp: rigged });
    const result = applyToolkitOps(run, "p0", "trail-map", [{ op: "swap-objectives", seatA: "p0", seatB: "p1" }]);
    const objectives = result.attempt!.camp!.objectives;
    expect(objectives.find((o) => o.id === doneObjective.id)!.ownerSeatId).toBe("p0"); // unchanged — done
    expect(objectives.find((o) => o.id === pendingObjective.id)!.ownerSeatId).toBe("p0"); // swapped — pending
  });

  it("remove-objective removes the objective (D-11)", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const objective = camp.objectives[0]!;
    const result = applyToolkitOps(run, "p0", "camouflage", [{ op: "remove-objective", objectiveId: objective.id }]);
    expect(result.attempt!.camp!.objectives.some((o) => o.id === objective.id)).toBe(false);
  });

  it("remove-objective throws for an unknown id", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, "p0", "camouflage", [{ op: "remove-objective", objectiveId: "no-such-id" }]),
    ).toThrow();
  });

  it("reveal appends a Reveal with the holder's seat and the source id as source", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    const result = applyToolkitOps(run, "p0", "scout", [{ op: "reveal", cardId: card.id, audience: ["p0"] }]);
    const reveal = result.attempt!.reveals[0]!;
    expect(reveal.cardId).toBe(card.id);
    expect(reveal.fromSeatId).toBe("p1");
    expect(reveal.audience).toEqual(["p0"]);
    expect(reveal.source).toBe("scout");
  });

  it("reveal throws for an empty audience", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, "p0", "whisper", [{ op: "reveal", cardId: card.id, audience: [] }]),
    ).toThrow();
  });

  it("reveal throws for an audience containing a non-seat", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, "p0", "whisper", [{ op: "reveal", cardId: card.id, audience: ["not-a-seat"] }]),
    ).toThrow();
  });

  it("reveal throws for a duplicated audience", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const card = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(() =>
      applyToolkitOps(run, "p0", "whisper", [{ op: "reveal", cardId: card.id, audience: ["p0", "p0"] }]),
    ).toThrow();
  });

  it("reveal throws for a card not in any hand", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, "p0", "whisper", [{ op: "reveal", cardId: "not-a-real-card", audience: ["p0"] }]),
    ).toThrow();
  });

  it("add-modifier appends an ActiveEffect stamped with the current trick index", () => {
    const camp = playOneTrick(pickAllObjectives(freshCamp()));
    const run = makeRun({ camp });
    const result = applyToolkitOps(run, "p0", "energy-tonic", [
      { op: "add-modifier", lasts: "trick", params: { cardId: "c9" }, audience: "owner" },
    ]);
    expect(result.attempt!.effects).toEqual([
      { sourceId: "energy-tonic", seatId: "p0", atTrick: 1, lasts: "trick", params: { cardId: "c9" }, audience: "owner" },
    ]);
  });

  it("set-next-leader sets the leader before trick 1 is allowed (D-09)", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const result = applyToolkitOps(run, "p1", "machete", [{ op: "set-next-leader", seatId: "p1" }]);
    expect(result.attempt!.camp!.currentTrick.leaderSeatId).toBe("p1");
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
      applyToolkitOps(run, "p1", "machete", [{ op: "set-next-leader", seatId: "p1" }]),
    ).toThrow();
  });

  it("set-next-leader throws when there is no camp", () => {
    const run = makeRun({ camp: null });
    expect(() => applyToolkitOps(run, "p1", "machete", [{ op: "set-next-leader", seatId: "p1" }])).toThrow();
  });

  it("cancel-boss-twist sets bossCancelled only before the deal (D-04)", () => {
    const run = makeRun({ camp: null });
    const result = applyToolkitOps(run, "p0", "poncho", [{ op: "cancel-boss-twist" }]);
    expect(result.attempt!.bossCancelled).toBe(true);
  });

  it("cancel-boss-twist throws once the camp is dealt", () => {
    const camp = freshCamp();
    const run = makeRun({ camp });
    expect(() => applyToolkitOps(run, "p0", "poncho", [{ op: "cancel-boss-twist" }])).toThrow();
  });

  it("log appends a LogEntry with the actor and source id", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    const result = applyToolkitOps(run, "p0", "some-gear", [
      { op: "log", event: "used-ability", subjectSeatIds: ["p1"], audience: "public" },
    ]);
    expect(result.attempt!.log).toEqual([
      { event: "used-ability", actorSeatId: "p0", subjectSeatIds: ["p1"], sourceId: "some-gear", audience: "public" },
    ]);
  });

  it("log throws for an audience array containing a non-seat", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(() =>
      applyToolkitOps(run, "p0", "some-gear", [
        { op: "log", event: "used-ability", subjectSeatIds: [], audience: ["not-a-seat"] },
      ]),
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
      ...base,
      supplies: 2,
      attempt: {
        ...base.attempt!,
        reveals: [
          { cardId: whispered.id, fromSeatId: "p0", audience: ["p1"], source: "whisper", targetSeatId: "p1" },
          { cardId: whispered.id, fromSeatId: "p0", audience: ["p2"], source: "spyglass" },
        ],
      },
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
    const result = applyToolkitOps({ ...run, attempt: { ...run.attempt!, camp: { ...failing, objectiveDeck: deck } } }, loser, "antidote", [
      { op: "replace-objective", objectiveId: "obj-failed" },
    ]);
    const after = result.attempt!.camp!;
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
        applyToolkitOps({ ...run, attempt: { ...run.attempt!, camp: c } }, loser, "antidote", [{ op: "replace-objective", objectiveId }]),
      ).toThrow(/replace-objective/);
    }
  });

  it("reassign-objective gives an owned objective to another seat", () => {
    const { run, camp, loser, winner } = afterOneTrick();
    const { camp: failing } = withFailedObjective(camp, loser);
    const result = applyToolkitOps({ ...run, attempt: { ...run.attempt!, camp: failing } }, loser, "rally", [
      { op: "reassign-objective", objectiveId: "obj-failed", toSeatId: winner },
    ]);
    const objective = result.attempt!.camp!.objectives[0]!;
    expect(objective.ownerSeatId).toBe(winner);
    expect(evaluateObjective(result.attempt!.camp!, objective)).toBe("done");
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
        applyToolkitOps({ ...run, attempt: { ...run.attempt!, camp: c } }, "p0", "detour", [{ op: "reassign-objective", objectiveId, toSeatId }]),
      ).toThrow(/reassign-objective/);
    }
  });

  it("reassign-trick changes a completed trick's winner and moves no card", () => {
    const { run, camp, winner, loser } = afterOneTrick();
    const result = applyToolkitOps(run, winner, "pack-mule", [{ op: "reassign-trick", trickIndex: 0, toSeatId: loser }]);
    const after = result.attempt!.camp!;
    expect(after.completedTricks[0]).toEqual({ ...camp.completedTricks[0]!, winnerSeatId: loser });
    expect(campCardIds(after)).toEqual(campCardIds(camp));
  });

  it("reassign-trick throws for a trick not yet completed or the current winner", () => {
    const { run, winner, loser } = afterOneTrick();
    expect(() => applyToolkitOps(run, winner, "pack-mule", [{ op: "reassign-trick", trickIndex: 1, toSeatId: loser }])).toThrow(/reassign-trick/);
    expect(() => applyToolkitOps(run, winner, "pack-mule", [{ op: "reassign-trick", trickIndex: 0, toSeatId: winner }])).toThrow(/reassign-trick/);
  });

  it("share-reveal copies the nth whisper's card and pinned holder to a new audience", () => {
    const { run } = afterOneTrick();
    const whisper = run.attempt!.reveals[0]!;
    const result = applyToolkitOps(run, "p0", "loud-call", [{ op: "share-reveal", whisperOrdinal: 0, audience: ["p1", "p2"] }]);
    expect(result.attempt!.reveals[2]).toEqual({ cardId: whisper.cardId, fromSeatId: "p0", audience: ["p1", "p2"], source: "loud-call" });
  });

  it("share-reveal counts whispers only and throws past the last one or for a bad audience", () => {
    const { run } = afterOneTrick();
    expect(() => applyToolkitOps(run, "p0", "loud-call", [{ op: "share-reveal", whisperOrdinal: 1, audience: ["p2"] }])).toThrow(/share-reveal/);
    expect(() => applyToolkitOps(run, "p0", "loud-call", [{ op: "share-reveal", whisperOrdinal: 0, audience: [] }])).toThrow(/share-reveal/);
    expect(() => applyToolkitOps(run, "p0", "loud-call", [{ op: "share-reveal", whisperOrdinal: 0, audience: ["p2", "p2"] }])).toThrow(/share-reveal/);
  });

  it("adjust-supplies changes the crew's supplies within [1, STARTING_SUPPLIES]", () => {
    const { run } = afterOneTrick();
    expect(applyToolkitOps(run, "p0", "field-kit", [{ op: "adjust-supplies", delta: 1 }]).supplies).toBe(3);
    expect(applyToolkitOps(run, "p0", "triage", [{ op: "adjust-supplies", delta: -1 }]).supplies).toBe(1);
  });

  it("adjust-supplies throws when the result would spend the last supply or pass the start", () => {
    const { run } = afterOneTrick();
    expect(() => applyToolkitOps(run, "p0", "triage", [{ op: "adjust-supplies", delta: -2 }])).toThrow(/adjust-supplies/);
    expect(() => applyToolkitOps(run, "p0", "field-kit", [{ op: "adjust-supplies", delta: 2 }])).toThrow(/adjust-supplies/);
    expect(() => applyToolkitOps(run, "p0", "field-kit", [{ op: "adjust-supplies", delta: 0.5 }])).toThrow(/adjust-supplies/);
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
          after = applyToolkitOps(run, "p0", "batch", ops);
        } catch (error) {
          expect((error as Error).message).toMatch(/^toolkit: /);
          expect((error as Error).message).not.toMatch(/conservation/);
          expect(run).toEqual(before);
          return;
        }
        expect(campCardIds(after.attempt!.camp!)).toEqual(campCardIds(camp));
        expect(after.supplies).toBeGreaterThanOrEqual(1);
        expect(after.supplies).toBeLessThanOrEqual(3);
        expect(run).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });
});
