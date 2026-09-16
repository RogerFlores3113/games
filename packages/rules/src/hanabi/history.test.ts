import { describe, expect, it } from "vitest";
import { appendHistory, type HistoryEntry } from "./history";

describe("history", () => {
  it("appendHistory returns a new array and leaves the input untouched", () => {
    const original: readonly HistoryEntry[] = [
      { turn: 1, type: "draw", seatId: "a", cardId: "card-1" },
    ];
    const snapshot = [...original];

    const entry: HistoryEntry = { turn: 2, type: "draw", seatId: "b", cardId: "card-2" };
    const next = appendHistory(original, entry);

    expect(next).not.toBe(original);
    expect(original).toEqual(snapshot);
    expect(original.length).toBe(1);
    expect(next.length).toBe(2);
    expect(next[1]).toEqual(entry);
  });

  it("a draw entry carries seatId and cardId and structurally has no suit or rank key", () => {
    const entry: HistoryEntry = { turn: 1, type: "draw", seatId: "a", cardId: "card-1" };

    expect("suit" in entry).toBe(false);
    expect("rank" in entry).toBe(false);
    expect(entry.seatId).toBe("a");
    expect(entry.cardId).toBe("card-1");
  });

  it("a play entry carries suit and rank because a played card is public the moment it is played", () => {
    const entry: HistoryEntry = {
      turn: 3,
      type: "play",
      seatId: "a",
      cardId: "card-1",
      suit: "red",
      rank: 1,
      success: true,
    };

    expect(entry.suit).toBe("red");
    expect(entry.rank).toBe(1);
    expect(entry.success).toBe(true);
  });

  it("a clue entry carries the clue and touched card ids and no card identities", () => {
    const entry: HistoryEntry = {
      turn: 4,
      type: "clue",
      seatId: "a",
      targetSeatId: "b",
      clue: { type: "color", value: "red" },
      touchedCardIds: ["card-1", "card-2"],
    };

    expect("suit" in entry).toBe(false);
    expect("rank" in entry).toBe(false);
    expect(entry.clue).toEqual({ type: "color", value: "red" });
    expect(entry.touchedCardIds).toEqual(["card-1", "card-2"]);
  });

  it("entries carry a monotonically increasing turn number starting at 1", () => {
    let history: readonly HistoryEntry[] = [];
    history = appendHistory(history, { turn: 1, type: "draw", seatId: "a", cardId: "card-1" });
    history = appendHistory(history, { turn: 2, type: "draw", seatId: "b", cardId: "card-2" });
    history = appendHistory(history, { turn: 3, type: "draw", seatId: "c", cardId: "card-3" });

    expect(history.map((e) => e.turn)).toEqual([1, 2, 3]);
  });
});
