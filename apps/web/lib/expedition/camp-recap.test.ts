import { describe, expect, it } from "vitest";
import type { ExpeditionCampRecapView, ExpeditionRecapObjectiveView } from "@games/rules";
import { clearLine, failureReason, finalTrickLine, lastCampStrip, lossLine, objectivesLine, stripRows, supplyCostLine, type NameOf } from "./camp-recap";

const NAMES: Record<string, string> = { s1: "You", s2: "Ana", s3: "Ben" };
const nameOf: NameOf = (id) => NAMES[id] ?? "?";

const club = (rank: 2 | 7 | 10 | 11) => ({ kind: "standard" as const, suit: "clubs" as const, rank });
const play = (seatId: string, rank: 2 | 7 | 10 | 11, extra: { burned?: boolean } = {}) => ({
  seatId,
  card: { id: `c-${seatId}-${rank}`, identity: club(rank) },
  effectiveRank: null,
  countsAs: null,
  burned: extra.burned ?? false,
});

function winCard(owner: string, status: "pending" | "done" | "failed", fate: ExpeditionRecapObjectiveView["fate"], failedAtTrick: number | null = null): ExpeditionRecapObjectiveView {
  return { objective: { id: `o-${owner}`, kind: "win-card", target: club(10), ownerSeatId: owner, status }, failedAtTrick, fate, ownerTricksWon: 1 };
}

function recap(overrides: Partial<ExpeditionCampRecapView> = {}): ExpeditionCampRecapView {
  return {
    camp: 2,
    attempt: 1,
    status: "failed",
    tricksPlayed: 5,
    totalTricks: 8,
    lastTrick: { index: 4, leaderSeatId: "s1", plays: [play("s1", 7), play("s2", 10), play("s3", 11)], winnerSeatId: "s3" },
    objectives: [
      winCard("s2", "failed", { kind: "won", bySeatId: "s3" }, 4),
      { objective: { id: "o2", kind: "no-tricks", ownerSeatId: "s1", status: "pending" }, failedAtTrick: null, fate: null, ownerTricksWon: 0 },
    ],
    failedGoalIds: [],
    coins: 0,
    supplyCost: [
      { origin: { kind: "base" }, amount: 1 },
      { origin: { kind: "seat", seatId: "s2", sourceId: "heavy-pack" }, amount: 1 },
    ],
    ...overrides,
  };
}

describe("why a camp was lost", () => {
  it("names the failed objective, its holder and who won its card", () => {
    expect(lossLine(recap(), nameOf)).toBe("Ana's 10♣ was won by Ben");
    expect(failureReason(winCard("s1", "failed", { kind: "won", bySeatId: "s2" }), nameOf)).toBe("Your 10♣ was won by Ana");
    expect(failureReason(winCard("s2", "failed", { kind: "won", bySeatId: "s1" }), nameOf)).toBe("Ana's 10♣ was won by you");
  });

  it("says a card was lost or never won", () => {
    expect(failureReason(winCard("s2", "failed", { kind: "lost" }), nameOf)).toBe("Ana's 10♣ was lost");
    expect(failureReason(winCard("s2", "failed", { kind: "open" }), nameOf)).toBe("Ana's 10♣ was never won");
  });

  it("an ordered card won by its holder was won out of order, or not last", () => {
    const ordered = (order: number | "last"): ExpeditionRecapObjectiveView => ({
      objective: { id: "o", kind: "ordered", target: club(10), order, ownerSeatId: "s2", status: "failed" },
      failedAtTrick: 2,
      fate: { kind: "won", bySeatId: "s2" },
      ownerTricksWon: 1,
    });
    expect(failureReason(ordered(2), nameOf)).toBe("Ana's 10♣ (second) was won out of order");
    expect(failureReason(ordered("last"), nameOf)).toBe("Ana's 10♣ (last) was not won last");
  });

  it("trick counts say what was won and what was needed", () => {
    const noTricks: ExpeditionRecapObjectiveView = { objective: { id: "o", kind: "no-tricks", ownerSeatId: "s3", status: "failed" }, failedAtTrick: 1, fate: null, ownerTricksWon: 1 };
    expect(failureReason(noTricks, nameOf)).toBe("Ben won a trick");
    const exactly: ExpeditionRecapObjectiveView = { objective: { id: "o", kind: "exactly-n", n: 2, ownerSeatId: "s1", status: "failed" }, failedAtTrick: 6, fate: null, ownerTricksWon: 3 };
    expect(failureReason(exactly, nameOf)).toBe("You won 3 tricks, needed exactly 2");
  });

  it("a hidden objective stays hidden", () => {
    const hidden: ExpeditionRecapObjectiveView = { objective: { id: "o", kind: "hidden", ownerSeatId: "s2", status: "failed" }, failedAtTrick: null, fate: null, ownerTricksWon: 0 };
    expect(failureReason(hidden, nameOf)).toBe("Ana's hidden objective failed");
  });

  it("a camp rule that failed is named, and more failures are counted", () => {
    expect(lossLine(recap({ objectives: [], failedGoalIds: ["hermit:s2"] }), nameOf)).toBe("Ana won a trick");
    expect(lossLine(recap({ objectives: [], failedGoalIds: ["temple"] }), nameOf)).toBe("The plates were not all pressed");
    expect(lossLine(recap({ failedGoalIds: ["camouflage:s1"] }), nameOf)).toBe("Ana's 10♣ was won by Ben, and 1 more");
    expect(lossLine(recap({ status: "cleared" }), nameOf)).toBeNull();
  });
});

describe("what it cost, and what a clear paid", () => {
  it("splits the supplies by source, and says nothing extra for the base cost alone", () => {
    expect(supplyCostLine(recap())).toBe("-1 failed camp, -1 Heavy Pack");
    expect(supplyCostLine(recap({ supplyCost: [{ origin: { kind: "base" }, amount: 1 }] }))).toBeNull();
    expect(supplyCostLine(recap({ status: "cleared", supplyCost: [] }))).toBeNull();
  });

  it("a clear counts the tricks it took", () => {
    expect(clearLine(recap({ status: "cleared", tricksPlayed: 5, totalTricks: 8 }))).toBe("In 5 of 8 tricks");
  });
});

describe("the trail's Last camp lines", () => {
  it("a loss: the camp, why, the cost, the final trick and every objective", () => {
    expect(lastCampStrip(recap(), nameOf)).toEqual({
      tone: "bad",
      lines: [
        "Last camp: Camp 2 lost. Ana's 10♣ was won by Ben. -1 failed camp, -1 Heavy Pack",
        "Final trick, won by Ben: You 7♣, Ana 10♣, Ben J♣",
        "Objectives: Ana's 10♣ failed in trick 5, Your no tricks open",
      ],
    });
  });

  it("a clear: the tricks it took and its coins, on a later try", () => {
    const cleared = recap({
      status: "cleared",
      attempt: 2,
      coins: 8,
      supplyCost: [],
      objectives: [winCard("s2", "done", { kind: "won", bySeatId: "s2" })],
    });
    expect(lastCampStrip(cleared, nameOf)!.lines[0]).toBe("Last camp: Camp 2, try 2 cleared in 5 of 8 tricks, +8 coins");
    expect(lastCampStrip(cleared, nameOf)!.tone).toBe("good");
    expect(objectivesLine(cleared, nameOf)).toBe("Objectives: Ana's 10♣ done");
  });

  it("burned cards are marked, and no final trick leaves its line out", () => {
    const burned = recap({ lastTrick: { index: 0, leaderSeatId: "s1", plays: [play("s1", 2, { burned: true }), play("s2", 7)], winnerSeatId: "s2" } });
    expect(finalTrickLine(burned, nameOf)).toBe("Final trick, won by Ana: You 2♣ burned, Ana 7♣");
    expect(lastCampStrip(recap({ lastTrick: null, tricksPlayed: 0 }), nameOf)!.lines).toHaveLength(2);
    expect(lastCampStrip(null, nameOf)).toBeNull();
  });

  it("cuts each row to the width and keeps to the rows there are", () => {
    const strip = { tone: "bad" as const, lines: ["a".repeat(12), "short", "third"] };
    expect(stripRows(strip, 10, 2)).toEqual(["aaaaaaaaa…", "short"]);
  });
});
