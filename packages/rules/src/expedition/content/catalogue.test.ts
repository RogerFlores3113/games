// One behavior test per catalogue source, driven through the real engine:
// useAbility / applyRunAction for the action, rulesFor and the per-seat view
// for what it did. Camps are hand-built (hands, objectives, tricks) on top of
// a dealt run, so every expected value is a literal read off the fixture.

import { describe, expect, it } from "vitest";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkCampOutcome } from "../camp";
import { evaluateObjective } from "../objectives";
import type { CampState, CompletedTrick, ExpeditionCard, Objective, StandardIdentity, StandardRank, Suit } from "../state";
import { trickWinner } from "../trick";
import { useAbility } from "../run/abilities";
import { CATALOG } from "../run/catalog";
import { activeBossId, rulesFor } from "../run/compose";
import { runPhase } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { campCardIds } from "../run/toolkit";
import type { CampNumber, RunAction, RunState } from "../run/types";
import { poolBalance, remaining } from "../run/usage";
import { currentWindow } from "../run/windows";

const SEATS = ["p0", "p1", "p2"] as const;
const FILLERS = ["scout", "guide", "botanist", "medic", "cartographer"];
const MONSOON = { 3: "radio-silence", 6: null } as const;

const std = (id: string, suit: Suit, rank: StandardRank): ExpeditionCard => ({ id, identity: { kind: "standard", suit, rank } });
const ident = (suit: Suit, rank: StandardRank): StandardIdentity => ({ kind: "standard", suit, rank });

/** A win-card objective no fixture card ever settles, so a camp stays in play. */
const PENDING: Objective = { id: "pending", kind: "win-card", target: ident("clubs", 2), ownerSeatId: "p2" };

function winCard(id: string, target: StandardIdentity, ownerSeatId: string | null): Objective {
  return { id, kind: "win-card", target, ownerSeatId };
}

function trick(index: number, leaderSeatId: string, plays: readonly (readonly [string, ExpeditionCard])[]): CompletedTrick {
  const played = plays.map(([seatId, card]) => ({ seatId, card }));
  return { index, leaderSeatId, plays: played, winnerSeatId: trickWinner(played) };
}

const X14 = std("x", "spades", 14);
const Y12 = std("y", "spades", 12);
const Z4 = std("z", "spades", 4);
/** Won by p0 with the spades 14. */
const WON_BY_P0 = trick(0, "p0", [["p0", X14], ["p1", Y12], ["p2", Z4]]);
/** Won by p1 with the spades 12. */
const WON_BY_P1 = trick(0, "p0", [["p0", std("x", "spades", 9)], ["p1", Y12], ["p2", Z4]]);

type Spec = {
  character?: string;
  kit?: readonly string[];
  campNumber?: CampNumber;
  supplies?: number;
  hands?: Partial<Record<(typeof SEATS)[number], ExpeditionCard[]>>;
  objectives?: Objective[];
  tricks?: CompletedTrick[];
  deck?: StandardIdentity[];
  totalTricks?: number;
  leader?: string;
};

function crew(spec: Spec): RunState {
  const character = spec.character ?? "scout";
  const [p1, p2] = FILLERS.filter((id) => id !== character);
  return setupRun({
    seatIds: SEATS,
    seed: "catalogue",
    catalog: CATALOG,
    ...(spec.campNumber === undefined ? {} : { campNumber: spec.campNumber }),
    ...(spec.supplies === undefined ? {} : { supplies: spec.supplies }),
    bossTwists: MONSOON,
    characters: { p0: character, p1: p1!, p2: p2! },
    kits: { p0: spec.kit ?? [] },
  });
}

/** A run between tricks whose camp is exactly the spec's. */
function table(spec: Spec = {}): RunState {
  const run = advanceTo(crew(spec), "between-tricks", CATALOG);
  const camp = run.attempt!.camp!;
  const hands = {
    p0: [std("a", "spades", 9)],
    p1: [std("b", "spades", 6)],
    p2: [std("c", "spades", 4)],
    ...spec.hands,
  };
  const tricks = spec.tricks ?? [];
  const built: CampState = {
    ...camp,
    hands: SEATS.map((seatId) => ({ seatId, cards: hands[seatId] })),
    objectives: spec.objectives ?? [PENDING],
    objectiveDeck: spec.deck ?? [],
    completedTricks: tricks,
    totalTricks: spec.totalTricks ?? 3,
    currentTrick: { index: tricks.length, leaderSeatId: spec.leader ?? tricks.at(-1)?.winnerSeatId ?? "p0", plays: [] },
  };
  return { ...run, attempt: { ...run.attempt!, camp: built } };
}

/** A failed win-card objective owned by p1 whose card p0 won, with one
 * objective-deck identity (spades 7) still in p2's hand. */
function failedTable(spec: Spec = {}): RunState {
  return table({
    ...spec,
    hands: { p2: [std("d", "spades", 7)] },
    objectives: [winCard("o1", ident("spades", 14), "p1")],
    tricks: [WON_BY_P0],
    deck: [ident("spades", 7)],
  });
}

function act(run: RunState, seatId: string, action: RunAction): RunState {
  const result = applyRunAction(run, seatId, action, CATALOG);
  if (!result.ok) throw new Error(`${seatId} ${JSON.stringify(action)} refused: ${result.error}`);
  return result.state;
}

const use = (run: RunState, seatId: string, sourceId: string, targets: readonly string[]) => act(run, seatId, { type: "use-ability", sourceId, targets });
/** Without the dispatcher's settle, so a rescued camp stays inspectable. */
const rescue = (run: RunState, seatId: string, sourceId: string, targets: readonly string[]) => {
  const result = useAbility(run, seatId, sourceId, targets, CATALOG);
  if (!result.ok) throw new Error(`${seatId} ${sourceId} refused: ${result.error}`);
  return result.state;
};
const play = (run: RunState, seatId: string, cardId: string) => act(run, seatId, { type: "play-card", cardId });
const whisper = (run: RunState, from: string, to: string, cardId: string) => act(run, from, { type: "whisper", targetSeatId: to, cardId });
const refusal = (run: RunState, seatId: string, sourceId: string, targets: readonly string[]) => {
  const result = useAbility(run, seatId, sourceId, targets, CATALOG);
  return result.ok ? "ok" : result.error;
};

const camp = (run: RunState): CampState => run.attempt!.camp!;
const handIds = (run: RunState, seatId: string) => camp(run).hands.find((h) => h.seatId === seatId)!.cards.map((c) => c.id);
const rules = (run: RunState) => rulesFor(run, CATALOG);
const whisperAllowance = (run: RunState) => SEATS.map((seatId) => rules(run).whispersPerCamp(run, seatId));
const objectiveOf = (run: RunState, id: string) => camp(run).objectives.find((o) => o.id === id)!;
const revealsFor = (run: RunState, seatId: string) => toExpeditionPlayerView(run, seatId, CATALOG).attempt!.reveals;
const balance = (run: RunState, seatId = "p0") => poolBalance(run.seats.find((s) => s.seatId === seatId)!, CATALOG);

function readyAll(run: RunState): RunState {
  return SEATS.reduce((state, seatId) => (runPhase(state) === "fireside" ? act(state, seatId, { type: "ready" }) : state), run);
}

/** A camp one trick from clearing: p0 wins with the spades 14 and owns that objective. */
function clearableTable(spec: Spec): RunState {
  return table({
    ...spec,
    hands: { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] },
    objectives: [winCard("o1", ident("spades", 14), "p0")],
    totalTricks: 1,
    leader: "p0",
  });
}

const playOut = (run: RunState) => play(play(play(run, "p0", "a"), "p1", "b"), "p2", "c");

describe("Scout", () => {
  const hands = {
    p1: [std("b1", "hearts", 5), std("b2", "hearts", 6), std("b3", "hearts", 7)],
  };

  it("Spyglass reveals exactly one card of the target's hand to the user only", () => {
    const run = use(table({ character: "scout", hands }), "p0", "scout", ["hand:p1"]);
    const [reveal, ...rest] = run.attempt!.reveals;
    expect(rest).toEqual([]);
    expect(reveal).toMatchObject({ fromSeatId: "p1", audience: ["p0"], source: "scout" });
    expect(["b1", "b2", "b3"]).toContain(reveal!.cardId);
    expect(revealsFor(run, "p0")).toEqual([
      expect.objectContaining({ cardId: reveal!.cardId, identity: hands.p1.find((c) => c.id === reveal!.cardId)!.identity }),
    ]);
    expect(revealsFor(run, "p1")).toEqual([]);
    expect(revealsFor(run, "p2")).toEqual([]);
  });

  it("Keen Eye makes Spyglass reveal two distinct cards", () => {
    const run = use(table({ character: "scout", kit: ["scout.keen-eye"], hands }), "p0", "scout", ["hand:p1"]);
    const ids = run.attempt!.reveals.map((r) => r.cardId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => ["b1", "b2", "b3"].includes(id))).toBe(true);
    expect(revealsFor(run, "p2")).toEqual([]);
  });

  it("Eavesdrop shows the user the card of a whisper between two teammates", () => {
    const start = table({ character: "scout", kit: ["scout.eavesdrop"], hands: { p1: [Y12] } });
    const whispered = whisper(start, "p1", "p2", "y");
    expect(revealsFor(whispered, "p0")).toEqual([]);
    const run = use(whispered, "p0", "scout.eavesdrop", ["whisper:0"]);
    expect(revealsFor(run, "p0")).toEqual([
      { cardId: "y", fromSeatId: "p1", source: "scout.eavesdrop", identity: Y12.identity, toSeatId: null },
    ]);
  });
});

describe("Guide", () => {
  it("Machete makes the chosen seat lead the next trick, once per camp", () => {
    const start = table({ character: "guide", leader: "p0" });
    const run = use(start, "p0", "guide", ["seat:p2"]);
    expect(camp(run).currentTrick.leaderSeatId).toBe("p2");
    expect(refusal(run, "p0", "guide", ["seat:p1"])).toBe("ability_spent");
  });

  it("Pathfinder lets Machete work twice per camp and the third use is spent", () => {
    const start = table({ character: "guide", kit: ["guide.pathfinder"], leader: "p0" });
    const once = use(start, "p0", "guide", ["seat:p2"]);
    const twice = use(once, "p0", "guide", ["seat:p1"]);
    expect(camp(twice).currentTrick.leaderSeatId).toBe("p1");
    expect(remaining(twice, "p0", "guide", CATALOG)).toEqual({ kind: "uses", left: 0, of: 2 });
    expect(refusal(twice, "p0", "guide", ["seat:p2"])).toBe("ability_spent");
  });

  it("Howler Call makes the lowest led-suit card win that trick only", () => {
    const hands = {
      p0: [std("a4", "spades", 4), std("a3", "spades", 3)],
      p1: [std("b12", "spades", 12), std("b13", "spades", 13)],
      p2: [std("c9", "spades", 9), std("c6", "spades", 6)],
    };
    const start = table({ character: "guide", kit: ["guide.howler-call"], hands, leader: "p2" });
    const led = play(start, "p2", "c9");
    const called = use(led, "p0", "guide.howler-call", ["board"]);
    const first = play(play(called, "p0", "a4"), "p1", "b12");
    expect(camp(first).completedTricks[0]!.winnerSeatId).toBe("p0");
    const second = play(play(play(first, "p0", "a3"), "p1", "b13"), "p2", "c6");
    expect(camp(second).completedTricks[1]!.winnerSeatId).toBe("p1");
  });
});

describe("Botanist", () => {
  it("Herb Tonic changes the card's rank in rankOf and spends a herb", () => {
    const hands = { p0: [std("a5", "spades", 5), std("k8", "hearts", 8)], p1: [std("b6", "spades", 6)], p2: [std("c4", "spades", 4)] };
    const start = table({ character: "botanist", hands, leader: "p0" });
    expect(balance(start)).toBe(2);
    const run = use(start, "p0", "botanist", ["value:a5:6"]);
    expect(rules(run).rankOf(hands.p0[0]!)).toBe(6);
    expect(rules(run).rankOf(hands.p0[1]!)).toBe(8);
    expect(balance(run)).toBe(1);
    const played = play(play(play(run, "p0", "a5"), "p1", "b6"), "p2", "c4");
    expect(camp(played).completedTricks[0]!.winnerSeatId).toBe("p0");
  });

  it("Greenhouse regains 2 herbs instead of 1 on a cleared camp, capped at 3", () => {
    const spent = (kit: readonly string[]) => {
      const start = use(clearableTable({ character: "botanist", kit }), "p0", "botanist", ["value:a:13"]);
      return balance(playOut(start));
    };
    expect(spent([])).toBe(2);
    expect(spent(["botanist.greenhouse"])).toBe(3);
    expect(balance(playOut(clearableTable({ character: "botanist", kit: ["botanist.greenhouse"] })))).toBe(3);
  });

  it("Antidote turns a failed objective into a pending win-card for the same owner", () => {
    const start = failedTable({ character: "botanist", kit: ["botanist.antidote"] });
    expect(currentWindow(start, rules(start))).toBe("rescue");
    const run = use(start, "p0", "botanist.antidote", ["objective:o1"]);
    expect(objectiveOf(run, "o1")).toEqual({ id: "o1", kind: "win-card", target: ident("spades", 7), ownerSeatId: "p1" });
    expect(evaluateObjective(camp(run), objectiveOf(run, "o1"))).toBe("pending");
    expect(camp(run).objectiveDeck).toEqual([]);
    expect(balance(run)).toBe(0);
    expect(run.attempt).not.toBeNull();
  });
});

describe("Medic", () => {
  it("Triage removes a failed objective and spends 1 supply, refused at 1 supply", () => {
    const run = rescue(failedTable({ character: "medic", supplies: 3 }), "p0", "medic", ["objective:o1"]);
    expect(camp(run).objectives).toEqual([]);
    expect(run.supplies).toBe(2);
    expect(refusal(failedTable({ character: "medic", supplies: 1 }), "p0", "medic", ["objective:o1"])).toBe("cannot_afford");
  });

  it("Rally reassigns a failed win-card objective to its card's winner so it becomes done", () => {
    const start = failedTable({ character: "medic", kit: ["medic.rally"] });
    expect(evaluateObjective(camp(start), objectiveOf(start, "o1"))).toBe("failed");
    const run = rescue(start, "p0", "medic.rally", ["objective:o1"]);
    expect(objectiveOf(run, "o1").ownerSeatId).toBe("p0");
    expect(evaluateObjective(camp(run), objectiveOf(run, "o1"))).toBe("done");
  });

  it("Field Kit restores a supply and is refused at full supplies", () => {
    const run = use(table({ character: "medic", kit: ["medic.field-kit"], supplies: 2 }), "p0", "medic.field-kit", ["supplies"]);
    expect(run.supplies).toBe(3);
    expect(refusal(table({ character: "medic", kit: ["medic.field-kit"], supplies: 3 }), "p0", "medic.field-kit", ["supplies"])).toBe(
      "ability_unavailable",
    );
  });
});

describe("Signaller", () => {
  it("Talking Drum allows two whispers and the third is refused", () => {
    const start = table({ character: "signaller" });
    expect(whisperAllowance(start)).toEqual([2, 1, 1]);
    const twice = whisper(whisper(start, "p0", "p1", "a"), "p0", "p2", "a");
    const third = applyRunAction(twice, "p0", { type: "whisper", targetSeatId: "p1", cardId: "a" }, CATALOG);
    expect(third).toEqual({ ok: false, error: "no_whispers_left" });
  });

  it("Loud Call shows a sent whisper to every seat", () => {
    const whispered = whisper(table({ character: "signaller", kit: ["signaller.loud-call"] }), "p0", "p1", "a");
    expect(revealsFor(whispered, "p2")).toEqual([]);
    const run = use(whispered, "p0", "signaller.loud-call", ["whisper:0"]);
    expect(revealsFor(run, "p2")).toEqual([
      { cardId: "a", fromSeatId: "p0", source: "signaller.loud-call", identity: ident("spades", 9), toSeatId: null },
    ]);
  });

  it("Call and Response gives the whispered-to teammate one more whisper", () => {
    const start = table({ character: "signaller", kit: ["signaller.call-and-response"] });
    expect(whisperAllowance(start)).toEqual([2, 1, 1]);
    const run = whisper(start, "p0", "p1", "a");
    expect(whisperAllowance(run)).toEqual([2, 2, 1]);
    const heard = whisper(whisper(run, "p1", "p2", "b"), "p1", "p0", "b");
    expect(heard.attempt!.log.filter((e) => e.event === "whisper" && e.actorSeatId === "p1")).toHaveLength(2);
  });
});

describe("Cartographer", () => {
  it("Redraw replaces an unclaimed card objective's target with the deck's next card", () => {
    const start = advanceTo(crew({ character: "cartographer", campNumber: 2 }), "objective-pick", CATALOG);
    const before = camp(start);
    const open = before.objectives.find((o) => o.ownerSeatId === null && o.kind === "win-card")!;
    const run = use(start, "p0", "cartographer", [`objective:${open.id}`]);
    const after = camp(run);
    expect(objectiveOf(run, open.id)).toEqual({ ...open, target: before.objectiveDeck[0] });
    expect(after.objectiveDeck).toEqual(before.objectiveDeck.slice(1));
  });

  it("Detour gives your open objective to a teammate", () => {
    const objectives = [winCard("mine", ident("hearts", 5), "p0"), PENDING];
    const run = use(table({ character: "cartographer", kit: ["cartographer.detour"], objectives }), "p0", "cartographer.detour", [
      "objective:mine",
      "seat:p2",
    ]);
    expect(objectiveOf(run, "mine").ownerSeatId).toBe("p2");
  });

  it("Landmark gives a completed objective's owner one more whisper", () => {
    const objectives = [winCard("done", ident("spades", 12), "p1"), PENDING];
    const start = table({ character: "cartographer", kit: ["cartographer.landmark"], objectives, tricks: [WON_BY_P1] });
    expect(evaluateObjective(camp(start), objectiveOf(start, "done"))).toBe("done");
    expect(whisperAllowance(start)).toEqual([1, 1, 1]);
    const run = use(start, "p0", "cartographer.landmark", ["objective:done"]);
    expect(whisperAllowance(run)).toEqual([1, 2, 1]);
  });
});

describe("items", () => {
  it("Trained Monkey swaps cards and conserves them", () => {
    const hands = { p0: [std("a1", "hearts", 5), std("a2", "hearts", 6)], p1: [std("b1", "diamonds", 9)] };
    const start = table({ kit: ["trained-monkey"], hands });
    const run = use(start, "p0", "trained-monkey", ["card:a1", "hand:p1"]);
    expect(handIds(run, "p0")).toEqual(["b1", "a2"]);
    expect(handIds(run, "p1")).toEqual(["a1"]);
    expect(campCardIds(camp(run))).toEqual(campCardIds(camp(start)));
  });

  it("Pack Mule moves a won trick's winner and is refused for a trick that settles a card objective", () => {
    const run = use(table({ kit: ["pack-mule"], tricks: [WON_BY_P0] }), "p0", "pack-mule", ["trick:0", "seat:p1"]);
    expect(camp(run).completedTricks[0]!.winnerSeatId).toBe("p1");
    const settling = table({ kit: ["pack-mule"], tricks: [WON_BY_P0], objectives: [winCard("o1", ident("spades", 14), "p0"), PENDING] });
    expect(refusal(settling, "p0", "pack-mule", ["trick:0", "seat:p1"])).toBe("invalid_target");
  });

  it("Parrot shares a received whisper with one teammate", () => {
    const whispered = whisper(table({ kit: ["parrot"], hands: { p1: [Y12] } }), "p1", "p0", "y");
    const run = use(whispered, "p0", "parrot", ["whisper:0", "seat:p2"]);
    expect(revealsFor(run, "p2")).toEqual([{ cardId: "y", fromSeatId: "p1", source: "parrot", identity: Y12.identity, toSeatId: null }]);
    expect(refusal(whispered, "p0", "parrot", ["whisper:0", "seat:p1"])).toBe("invalid_target");
  });

  it("Trail Map swaps pending objectives and leaves a done one", () => {
    const objectives = [
      winCard("done", ident("spades", 14), "p0"),
      winCard("mine", ident("hearts", 5), "p0"),
      winCard("theirs", ident("hearts", 6), "p1"),
    ];
    const run = use(table({ kit: ["trail-map"], objectives, tricks: [WON_BY_P0] }), "p0", "trail-map", ["seat:p1"]);
    expect(camp(run).objectives.map((o) => [o.id, o.ownerSeatId])).toEqual([
      ["done", "p0"],
      ["mine", "p1"],
      ["theirs", "p0"],
    ]);
  });

  it("Rain Poncho cancels the boss twist and blocks whispers, and is pending only at a boss camp", () => {
    const boss = readyAll(crew({ kit: ["rain-poncho"], campNumber: 3 }));
    expect(runPhase(boss)).toBe("pre-deal");
    expect(activeBossId(boss)).toBe("radio-silence");
    const run = use(boss, "p0", "rain-poncho", []);
    expect(activeBossId(run)).toBeNull();
    expect(run.attempt!.bossCancelled).toBe(true);
    expect(SEATS.map((seatId) => rules(run).whisperAllowed(run, seatId))).toEqual([false, false, false]);
    expect(runPhase(readyAll(crew({ kit: ["rain-poncho"], campNumber: 1 })))).toBe("camp");
  });

  it("Smoke Signal gives everyone one more whisper and spends a supply", () => {
    const start = table({ kit: ["smoke-signal"], supplies: 3 });
    expect(whisperAllowance(start)).toEqual([1, 1, 1]);
    const run = use(start, "p0", "smoke-signal", []);
    expect(whisperAllowance(run)).toEqual([2, 2, 2]);
    expect(run.supplies).toBe(2);
  });

  it("Whetstone shifts a card by up to two and leaves the kit", () => {
    const hands = { p0: [std("a5", "spades", 5)] };
    const start = table({ kit: ["whetstone"], hands });
    expect(refusal(start, "p0", "whetstone", ["value:a5:8"])).toBe("invalid_target");
    const run = use(start, "p0", "whetstone", ["value:a5:7"]);
    expect(rules(run).rankOf(hands.p0[0]!)).toBe(7);
    expect(run.seats[0]!.kit).toEqual([]);
  });

  it("Puffball makes its user lose the next trick only", () => {
    const hands = {
      p0: [std("a14", "spades", 14), std("a13", "spades", 13)],
      p1: [std("b3", "spades", 3), std("b2", "spades", 2)],
      p2: [std("c4", "spades", 4), std("c5", "spades", 5)],
    };
    const start = use(table({ kit: ["puffball"], hands, leader: "p0" }), "p0", "puffball", ["seat:p0"]);
    const first = play(play(play(start, "p0", "a14"), "p1", "b3"), "p2", "c4");
    expect(camp(first).completedTricks[0]!.winnerSeatId).toBe("p2");
    const second = play(play(play(first, "p2", "c5"), "p0", "a13"), "p1", "b2");
    expect(camp(second).completedTricks[1]!.winnerSeatId).toBe("p0");
  });

  it("Puffballs that exclude every seat leave the trick to the base rules", () => {
    const hands = {
      p0: [std("a14", "spades", 14)],
      p1: [std("b3", "spades", 3)],
      p2: [std("c4", "spades", 4)],
    };
    const start = table({ hands, leader: "p0" });
    const stocked: RunState = { ...start, seats: start.seats.map((seat) => ({ ...seat, kit: ["puffball"] })) };
    const puffed = SEATS.reduce<RunState>((run, seatId) => use(run, seatId, "puffball", [`seat:${seatId}`]), stocked);
    const done = play(play(play(puffed, "p0", "a14"), "p1", "b3"), "p2", "c4");
    expect(camp(done).completedTricks[0]!.winnerSeatId).toBe("p0");
  });

  it("Bait makes a table card lose this trick only", () => {
    const hands = {
      p0: [std("a9", "spades", 9), std("a8", "spades", 8)],
      p1: [std("b6", "spades", 6), std("b7", "spades", 7)],
      p2: [std("c14", "spades", 14), std("c3", "spades", 3)],
    };
    const led = play(table({ kit: ["bait"], hands, leader: "p2" }), "p2", "c14");
    const baited = use(led, "p0", "bait", ["card:c14"]);
    const plays = [
      { seatId: "p2", card: hands.p2[0]! },
      { seatId: "p0", card: hands.p0[0]! },
    ];
    expect(rules(baited).trickWinner(plays)).toBe("p0");
    const next = play(play(baited, "p0", "a9"), "p1", "b6");
    expect(camp(next).completedTricks[0]!.winnerSeatId).toBe("p0");
    expect(rules(next).trickWinner(plays)).toBe("p2");
  });

  it("Camouflage removes the objective and later fails the camp via a fired check, with no rescue", () => {
    const objectives = [winCard("mine", ident("hearts", 5), "p0"), PENDING];
    const hands = { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] };
    const hidden = use(table({ kit: ["camouflage"], objectives, hands, leader: "p0", supplies: 3 }), "p0", "camouflage", ["objective:mine"]);
    expect(camp(hidden).objectives.map((o) => o.id)).toEqual(["pending"]);
    expect(campOutcome(hidden)).toEqual({ status: "in_progress" });

    const exposed = { ...hidden, attempt: { ...hidden.attempt!, camp: { ...camp(hidden), completedTricks: [WON_BY_P0] } } };
    expect(campOutcome(exposed)).toEqual({ status: "failed", failedObjectiveIds: [], firedFailureCheckIds: ["camouflage-broke-cover"] });
    expect(currentWindow(exposed, rules(exposed))).not.toBe("rescue");

    const failed = playOut(hidden);
    expect(failed.attempt).toBeNull();
    expect(failed.history.at(-1)).toMatchObject({ campNumber: 1, status: "failed", suppliesSpent: 1 });
    expect(failed.supplies).toBe(2);
  });

  it("Rope Ladder removes a failed objective and leaves the kit", () => {
    const run = rescue(failedTable({ kit: ["rope-ladder"] }), "p0", "rope-ladder", ["objective:o1"]);
    expect(camp(run).objectives).toEqual([]);
    expect(run.seats[0]!.kit).toEqual([]);
  });

  it("Heavy Pack adds a whisper and 1 to a failed camp's supply cost", () => {
    const failing = (kit: readonly string[]) => {
      const start = table({
        kit,
        supplies: 3,
        hands: { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] },
        objectives: [winCard("o1", ident("spades", 14), "p1")],
        totalTricks: 1,
        leader: "p0",
      });
      return { start, end: playOut(start) };
    };
    const packed = failing(["heavy-pack"]);
    expect(whisperAllowance(packed.start)).toEqual([2, 1, 1]);
    expect(packed.end.supplies).toBe(1);
    expect(failing([]).end.supplies).toBe(2);
  });

  it("Mosquito Net lets its owner whisper under Monsoon but not under Rain Poncho", () => {
    const monsoon = table({ kit: ["mosquito-net"], campNumber: 3 });
    expect(activeBossId(monsoon)).toBe("radio-silence");
    expect(applyRunAction(monsoon, "p1", { type: "whisper", targetSeatId: "p0", cardId: "b" }, CATALOG)).toEqual({
      ok: false,
      error: "whisper_blocked",
    });
    expect(applyRunAction(monsoon, "p0", { type: "whisper", targetSeatId: "p1", cardId: "a" }, CATALOG).ok).toBe(true);

    const poncho = use(readyAll(crew({ kit: ["rain-poncho", "mosquito-net"], campNumber: 3 })), "p0", "rain-poncho", []);
    expect(rules(poncho).whisperAllowed(poncho, "p0")).toBe(false);
  });
});

function campOutcome(run: RunState) {
  return checkCampOutcome(camp(run), rules(run));
}
