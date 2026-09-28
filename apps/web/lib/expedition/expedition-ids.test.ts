import { describe, expect, it } from "vitest";
import type { ExpeditionCardIdentityView, ExpeditionObjectiveView } from "@games/rules";
import {
  CANCEL_ID,
  CONFIRM_ID,
  LAST_TRICK_ID,
  PREDEAL_SKIP_ID,
  READY_ID,
  SUIT_GLYPH,
  WHISPER_ID,
  cardLabel,
  draftObjectId,
  gearObjectId,
  handObjectId,
  interactableObjectId,
  loadoutObjectId,
  objectiveObjectId,
  preDealUseObjectId,
  rankLabel,
  revealObjectId,
  seatObjectId,
  trickObjectId,
} from "./expedition-ids";

const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

function standard(
  suit: (typeof SUITS)[number],
  rank: (typeof RANKS)[number],
): { kind: "standard"; suit: (typeof SUITS)[number]; rank: (typeof RANKS)[number] } {
  return { kind: "standard", suit, rank };
}

describe("rankLabel", () => {
  it("2..10 render as digits", () => {
    for (const rank of [2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
      expect(rankLabel(rank)).toBe(String(rank));
    }
  });

  it("11 J, 12 Q, 13 K, 14 A", () => {
    expect(rankLabel(11)).toBe("J");
    expect(rankLabel(12)).toBe("Q");
    expect(rankLabel(13)).toBe("K");
    expect(rankLabel(14)).toBe("A");
  });
});

describe("cardLabel", () => {
  it("standard cards combine rank label and suit glyph", () => {
    expect(cardLabel(standard("hearts", 12))).toBe("Q♥");
    expect(cardLabel(standard("spades", 10))).toBe("10♠");
    expect(cardLabel(standard("diamonds", 13))).toBe("K♦");
    expect(cardLabel(standard("clubs", 14))).toBe("A♣");
  });

  it("jokers render as Sun / Moon", () => {
    expect(cardLabel({ kind: "joker", joker: "sun" })).toBe("Sun");
    expect(cardLabel({ kind: "joker", joker: "moon" })).toBe("Moon");
  });

  it("SUIT_GLYPH carries the expected glyphs", () => {
    expect(SUIT_GLYPH).toEqual({ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" });
  });
});

describe("hand/trick/reveal object ids", () => {
  it("build the expected prefixed ids", () => {
    const q = standard("hearts", 12);
    expect(handObjectId(q)).toBe("hand:Q♥");
    expect(trickObjectId(q)).toBe("trick:Q♥");
    expect(revealObjectId(q)).toBe("reveal:Q♥");
  });
});

describe("objectiveObjectId", () => {
  it("win-card objective uses the target's card label", () => {
    const o: ExpeditionObjectiveView = {
      id: "obj-1",
      kind: "win-card",
      target: standard("diamonds", 13),
      ownerSeatId: null,
      status: "pending",
    };
    expect(objectiveObjectId(o)).toBe("objective:K♦");
  });

  it("ordered objective uses the target's card label", () => {
    const o: ExpeditionObjectiveView = {
      id: "obj-2",
      kind: "ordered",
      target: standard("hearts", 12),
      order: "last",
      ownerSeatId: null,
      status: "pending",
    };
    expect(objectiveObjectId(o)).toBe("objective:Q♥");
  });

  it("no-tricks objective falls back to its own id", () => {
    const o: ExpeditionObjectiveView = { id: "o7", kind: "no-tricks", ownerSeatId: null, status: "pending" };
    expect(objectiveObjectId(o)).toBe("objective:o7");
  });

  it("exactly-n objective falls back to its own id", () => {
    const o: ExpeditionObjectiveView = { id: "o9", kind: "exactly-n", n: 2, ownerSeatId: null, status: "pending" };
    expect(objectiveObjectId(o)).toBe("objective:o9");
  });
});

describe("seat/gear/draft/loadout/predeal/interactable object ids", () => {
  it("build the expected prefixed ids", () => {
    expect(seatObjectId("s1")).toBe("seat:s1");
    expect(gearObjectId("pickpocket")).toBe("gear:pickpocket");
    expect(draftObjectId("peek")).toBe("draft:peek");
    expect(loadoutObjectId("peek")).toBe("loadout:peek");
    expect(preDealUseObjectId("jam")).toBe("predeal-use:jam");
    expect(interactableObjectId("campfire")).toBe("interactable:campfire");
  });
});

describe("fixed id constants", () => {
  it("match the spec's literal values", () => {
    expect(READY_ID).toBe("ready");
    expect(WHISPER_ID).toBe("whisper");
    expect(CONFIRM_ID).toBe("confirm");
    expect(CANCEL_ID).toBe("cancel");
    expect(PREDEAL_SKIP_ID).toBe("predeal-skip");
    expect(LAST_TRICK_ID).toBe("last-trick");
  });
});

describe("collision-freedom", () => {
  it("all 54 distinct identities produce 54 distinct hand ids", () => {
    const identities: ExpeditionCardIdentityView[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        identities.push(standard(suit, rank));
      }
    }
    identities.push({ kind: "joker", joker: "sun" });
    identities.push({ kind: "joker", joker: "moon" });

    expect(identities.length).toBe(54);
    const ids = identities.map(handObjectId);
    expect(new Set(ids).size).toBe(54);
  });
});
