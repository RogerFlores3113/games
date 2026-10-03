import { describe, expect, it } from "vitest";
import type { ExpeditionObjectiveView } from "@games/rules";
import { objectiveTooltip } from "./objective-tooltip";

const KD = { kind: "standard", suit: "diamonds", rank: 13 } as const;
const TD = { kind: "standard", suit: "diamonds", rank: 10 } as const;

function render(o: ExpeditionObjectiveView, holder: Parameters<typeof objectiveTooltip>[1]): string {
  const t = objectiveTooltip(o, holder);
  return `${t.title}: ${t.text} [${t.badges.join(", ")}]`;
}

describe("objectiveTooltip", () => {
  it("explains a win-card objective with its status", () => {
    const o = { id: "o1", kind: "win-card", target: KD, ownerSeatId: null, status: "pending" } as const;
    expect(render(o, { kind: "nobody" })).toBe("K♦: Win the trick containing K♦. [Still open]");
    expect(render({ ...o, status: "done" }, { kind: "nobody" })).toBe("K♦: Win the trick containing K♦. [Done]");
    expect(render({ ...o, status: "failed" }, { kind: "nobody" })).toBe("K♦: Win the trick containing K♦. [Failed]");
  });

  it("explains numbered and last ordered objectives", () => {
    const first = { id: "o2", kind: "ordered", target: KD, order: 1, ownerSeatId: "s1", status: "pending" } as const;
    expect(render(first, { kind: "seat", name: "Bianca" })).toBe("#1 K♦: Win K♦ before the other numbered objectives. [Still open]");
    const last = { id: "o3", kind: "ordered", target: TD, order: "last", ownerSeatId: "s1", status: "done" } as const;
    expect(render(last, { kind: "seat", name: "Bianca" })).toBe("Last 10♦: Win 10♦ in the final trick. [Done]");
  });

  it("names who must keep a trick-count objective", () => {
    const none = { id: "o4", kind: "no-tricks", ownerSeatId: "s1", status: "pending" } as const;
    expect(render(none, { kind: "seat", name: "Bianca" })).toBe("No tricks: Bianca must win no tricks. [Still open]");
    expect(render(none, { kind: "you" })).toBe("No tricks: You must win no tricks. [Still open]");
    expect(render({ ...none, ownerSeatId: null }, { kind: "nobody" })).toBe("No tricks: Whoever takes it must win no tricks. [Still open]");
    const two = { id: "o5", kind: "exactly-n", n: 2, ownerSeatId: "s2", status: "failed" } as const;
    expect(render(two, { kind: "seat", name: "Sam" })).toBe("Exactly 2: Sam must win exactly 2 tricks. [Failed]");
    expect(render({ ...two, n: 1 }, { kind: "seat", name: "Sam" })).toBe("Exactly 1: Sam must win exactly 1 trick. [Failed]");
  });
});
