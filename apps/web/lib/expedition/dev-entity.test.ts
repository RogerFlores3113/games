import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import { devEntityAt } from "./dev-entity";

const view = {
  stage: {
    tag: "camp",
    attempt: {
      camp: {
        objectives: [
          { id: "o1", kind: "win-card", target: { kind: "standard", suit: "diamonds", rank: 13 }, ownerSeatId: null, status: "pending" },
          { id: "o2", kind: "no-tricks", ownerSeatId: "s1", status: "pending" },
        ],
      },
    },
  },
} as unknown as ExpeditionView;

describe("devEntityAt", () => {
  it("names the objective under the pointer by its id", () => {
    expect(devEntityAt(["objective:K♦"], view)).toEqual({ kind: "objective", id: "o1" });
    expect(devEntityAt(["objective:o2"], view)).toEqual({ kind: "objective", id: "o2" });
  });

  it("names a boss sprite or a modifier chip by its modifier id", () => {
    expect(devEntityAt(["boss:tornado"], view)).toEqual({ kind: "mod", id: "tornado" });
    expect(devEntityAt(["mod:thunderstorm"], view)).toEqual({ kind: "mod", id: "thunderstorm" });
    expect(devEntityAt(["mod:blood-moon"], view)).toEqual({ kind: "mod", id: "blood-moon" });
  });

  it("skips what it cannot name for the innermost thing it can", () => {
    expect(devEntityAt(["hand:2♠", "board", "objective:K♦"], view)).toEqual({ kind: "objective", id: "o1" });
    expect(devEntityAt(["hand:2♠", "board"], view)).toBeNull();
    expect(devEntityAt(["objective:Q♣"], view)).toBeNull();
  });
});
