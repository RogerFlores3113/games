import { describe, expect, it } from "vitest";
import type { ExpeditionModView, ExpeditionStatusPartView, ExpeditionView } from "@games/rules";
import { CAPTION_MAX_CHARS, bossBlockReason, buildBoss, type SeatNamer } from "./boss-model";

const NAMES: Record<string, string> = { s1: "Roger", s2: "Bianca", s3: "Maximilian" };
const seats: SeatNamer = { name: (id) => NAMES[id] ?? "?", isYou: (id) => id === "s1" };

const boss = (id: string, status: ExpeditionStatusPartView[] = []): ExpeditionModView => ({ id, kind: "animal", strength: "full", status });
const JUNGLE: ExpeditionModView = { id: "jungle", kind: "location", strength: "full", status: [] };

function campView(mods: ExpeditionModView[], plays = 0): ExpeditionView {
  return {
    yourSeatId: "s1",
    stage: {
      tag: "camp",
      mods,
      attempt: { camp: { currentTrick: { index: 2, leaderSeatId: "s1", plays: Array.from({ length: plays }, () => ({})) } } },
    },
  } as unknown as ExpeditionView;
}

describe("buildBoss", () => {
  it("is null for a plain camp", () => {
    expect(buildBoss(campView([JUNGLE]), seats)).toBeNull();
  });

  it("points the crocodile at the seat it watches and marks that seat", () => {
    expect(buildBoss(campView([JUNGLE, boss("crocodile", [{ kind: "facing", seatId: "s2" }])]), seats)).toEqual({
      id: "crocodile",
      objectId: "boss:crocodile",
      name: "Crocodile",
      caption: "Watching Bianca",
      rule: "Crocodile: if Bianca wins this trick, the camp is lost",
      facingSeatId: "s2",
      alert: true,
      marks: { s2: { label: "watched", alert: true } },
    });
    expect(buildBoss(campView([boss("crocodile", [{ kind: "facing", seatId: "s1" }])]), seats)?.rule).toBe("Crocodile: if you win this trick, the camp is lost");
  });

  it("says the tiger pounces on a streak of two, shortening long names", () => {
    expect(buildBoss(campView([boss("tiger", [{ kind: "streak", seatId: "s3", count: 2 }])]), seats)).toMatchObject({
      caption: "Pounce: Maxim.",
      rule: "Tiger: Maximilian won 2 in a row and leads a random card",
      alert: true,
      marks: { s3: { label: "streak 2", alert: true } },
    });
    expect(buildBoss(campView([boss("tiger", [{ kind: "streak", seatId: "s2", count: 1 }])]), seats)).toMatchObject({
      caption: "Bianca: 1 win",
      alert: false,
      marks: { s2: { label: "streak 1", alert: false } },
    });
  });

  it("marks every bitten seat and says how long the first bite lasts", () => {
    const model = buildBoss(campView([boss("snake", [{ kind: "bitten", seatId: "s1", tricksLeft: 2 }, { kind: "bitten", seatId: "s2", tricksLeft: 1 }])]), seats);
    expect(model).toMatchObject({ caption: "Bit you", rule: "Snake: objectives you win this trick or next fail" });
    expect(model?.marks).toEqual({ s1: { label: "bitten 2", alert: true }, s2: { label: "bitten 1", alert: true } });
    expect(buildBoss(campView([boss("snake")]), seats)?.rule).toBe("Snake: whoever whispers is bitten for two tricks");
  });

  it("names the dammed suit, and the rats' and capybara's standing rules", () => {
    expect(buildBoss(campView([boss("beaver", [{ kind: "dam", suit: "hearts" }])]), seats)).toMatchObject({ caption: "Dam: ♥ hearts", rule: "Beaver dams ♥: play another suit if you can" });
    expect(buildBoss(campView([boss("rats")]), seats)).toMatchObject({ caption: "-1 item slot", rule: "Rats: everyone has one fewer item slot this camp", marks: {} });
    expect(buildBoss(campView([boss("capybara")]), seats)).toMatchObject({ caption: "+2 objectives", rule: "Capybara: two extra objectives this camp" });
  });
});

describe("captions", () => {
  it.each([
    boss("crocodile", [{ kind: "facing", seatId: "s3" }]),
    boss("tiger", [{ kind: "streak", seatId: "s3", count: 3 }]),
    boss("tiger", [{ kind: "streak", seatId: "s3", count: 1 }]),
    boss("snake", [{ kind: "bitten", seatId: "s3", tricksLeft: 2 }]),
    boss("beaver", [{ kind: "dam", suit: "diamonds" }]),
    boss("rats"),
    boss("capybara"),
  ])("fit the boss zone's caption line with the longest name: $id", (mod) => {
    expect(Array.from(buildBoss(campView([mod]), seats)!.caption).length).toBeLessThanOrEqual(CAPTION_MAX_CHARS);
  });
});

describe("bossBlockReason", () => {
  it("blames the beaver for a dammed card and the tiger for a forced lead", () => {
    const dam = campView([boss("beaver", [{ kind: "dam", suit: "spades" }])]);
    expect(bossBlockReason(dam, { kind: "standard", suit: "spades" }, 5)).toBe("The beaver dams ♠");
    expect(bossBlockReason(dam, { kind: "standard", suit: "hearts" }, 5)).toBeNull();
    const pounce = campView([boss("tiger", [{ kind: "streak", seatId: "s1", count: 2 }])]);
    expect(bossBlockReason(pounce, { kind: "standard", suit: "hearts" }, 1)).toBe("The tiger picked your lead");
    expect(bossBlockReason(campView([boss("tiger", [{ kind: "streak", seatId: "s1", count: 2 }])], 1), { kind: "standard", suit: "hearts" }, 1)).toBeNull();
  });
});
