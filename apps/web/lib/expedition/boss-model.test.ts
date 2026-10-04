import { describe, expect, it } from "vitest";
import type { ExpeditionModView, ExpeditionStatusPartView, ExpeditionView } from "@games/rules";
import { CAPTION_MAX_CHARS, RULE_MAX_CHARS, bossBlockReason, bossHappenings, buildBoss, latestGust, rightOf, type SeatNamer } from "./boss-model";

const NAMES: Record<string, string> = { s1: "Roger", s2: "Bianca", s3: "Maximilian" };
const seats: SeatNamer = { name: (id) => NAMES[id] ?? "?", isYou: (id) => id === "s1" };

const boss = (id: string, status: ExpeditionStatusPartView[] = []): ExpeditionModView => ({ id, kind: "animal", strength: "full", status });
const disaster = (id: string, status: ExpeditionStatusPartView[] = []): ExpeditionModView => ({ id, kind: "disaster", strength: "full", status });
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

describe("disaster bosses", () => {
  const read = (mod: ExpeditionModView) => {
    const model = buildBoss(campView([JUNGLE, mod]), seats)!;
    return { caption: model.caption, rule: model.rule, alert: model.alert };
  };

  it("counts the tornado down to its gust", () => {
    expect(read(disaster("tornado", [{ kind: "countdown", tricks: 3 }]))).toEqual({ caption: "Gust in 3", rule: "Tornado: in 3 tricks, each hand passes 3 cards right", alert: false });
    expect(read(disaster("tornado", [{ kind: "countdown", tricks: 1 }]))).toEqual({ caption: "Gust in 1", rule: "Tornado: after this trick, each hand passes 3 cards right", alert: true });
    expect(read(disaster("tornado"))).toEqual({ caption: "Calm", rule: "Tornado: no more gusts this camp", alert: false });
  });

  it("counts the earthquake down to its one quake", () => {
    expect(read(disaster("earthquake", [{ kind: "countdown", tricks: 2 }]))).toEqual({ caption: "Quake in 2", rule: "Earthquake: in 2 tricks, open objectives change hands", alert: false });
    expect(read(disaster("earthquake", [{ kind: "countdown", tricks: 1 }]))).toEqual({ caption: "Quake in 1", rule: "Earthquake: after this trick, open objectives change hands", alert: true });
    expect(read(disaster("earthquake"))).toEqual({ caption: "Settled", rule: "Earthquake: the ground has settled", alert: false });
  });

  it("says what the wildfire and the meteor take from every trick, and when a half body rests", () => {
    expect(read(disaster("wildfire"))).toEqual({ caption: "Burns lowest", rule: "Wildfire: the lowest card of this trick burns", alert: false });
    expect(read(disaster("wildfire", [{ kind: "alternating", activeNow: false }]))).toEqual({ caption: "Smouldering", rule: "The wildfire smoulders this trick", alert: false });
    expect(read(disaster("meteor"))).toEqual({ caption: "Vaporizes top", rule: "Meteor: the card that would win this trick is vaporized", alert: false });
    expect(read(disaster("meteor", [{ kind: "alternating", activeNow: false }]))).toEqual({ caption: "Passing by", rule: "The meteor passes this trick", alert: false });
  });

  it("says which suits the blood moon turns while it is up", () => {
    expect(read(disaster("blood-moon", [{ kind: "alternating", activeNow: true }]))).toEqual({ caption: "Moon rises", rule: "Blood Moon: ♠ count as ♦ and ♣ as ♥ this trick", alert: true });
    expect(read(disaster("blood-moon", [{ kind: "alternating", activeNow: false }]))).toEqual({ caption: "Moon sets", rule: "Blood Moon: cards count as printed this trick", alert: false });
  });

  it("names the locusts' next meal and marks its seat", () => {
    expect(buildBoss(campView([disaster("locusts", [{ kind: "swarm", seatId: "s2" }])]), seats)).toMatchObject({
      caption: "Eats Bianca's",
      rule: "Locusts: after this trick they eat an item of Bianca",
      alert: true,
      marks: { s2: { label: "next meal", alert: true } },
    });
    expect(read(disaster("locusts", [{ kind: "swarm", seatId: "s1" }]))).toEqual({ caption: "Eats yours", rule: "Locusts: after this trick they eat one of your items", alert: true });
    expect(read(disaster("locusts", [{ kind: "swarm", seatId: null }]))).toEqual({ caption: "Eats 1 per hand", rule: "Locusts: after this trick they eat a card from every hand", alert: true });
    expect(read(disaster("locusts", [{ kind: "alternating", activeNow: false }, { kind: "swarm", seatId: "s2" }]))).toEqual({ caption: "Resting", rule: "The locusts rest this trick", alert: false });
  });

  it("reads the monsoon's river", () => {
    expect(read(disaster("monsoon", [{ kind: "meter", left: 3, of: 12 }]))).toEqual({ caption: "River: 3 left", rule: "Monsoon: finish every objective in 3 tricks", alert: false });
    expect(read(disaster("monsoon", [{ kind: "meter", left: 1, of: 12 }]))).toEqual({ caption: "River: 1 left", rule: "Monsoon: every objective must be done this trick", alert: true });
    expect(read(disaster("monsoon", [{ kind: "meter", left: 0, of: 12 }]))).toEqual({ caption: "Flooded", rule: "Monsoon: the river has flooded", alert: true });
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
    disaster("tornado", [{ kind: "countdown", tricks: 12 }]),
    disaster("earthquake", [{ kind: "countdown", tricks: 12 }]),
    disaster("wildfire", [{ kind: "alternating", activeNow: false }]),
    disaster("meteor"),
    disaster("blood-moon", [{ kind: "alternating", activeNow: true }]),
    disaster("locusts", [{ kind: "swarm", seatId: "s3" }]),
    disaster("locusts", [{ kind: "swarm", seatId: null }]),
    disaster("monsoon", [{ kind: "meter", left: 12, of: 14 }]),
  ])("fit the boss zone's caption line and the ticker with the longest name: $id", (mod) => {
    const model = buildBoss(campView([mod]), seats)!;
    expect(Array.from(model.caption).length).toBeLessThanOrEqual(CAPTION_MAX_CHARS);
    expect(Array.from(model.rule).length).toBeLessThanOrEqual(RULE_MAX_CHARS);
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

const card = (id: string, suit: "spades" | "hearts" | "diamonds" | "clubs", rank: number) => ({ cardId: id, identity: { kind: "standard", suit, rank } });

/** A camp in play whose attempt holds `log`, `reveals` and `discards`. */
function happeningView(log: { event: string; subjectSeatIds?: string[] }[], reveals: ReturnType<typeof card>[] = [], discards: { card: { id: string; identity: unknown }; afterTrick: number }[] = []): ExpeditionView {
  return {
    yourSeatId: "s1",
    seats: [{ seatId: "s1" }, { seatId: "s2" }, { seatId: "s3" }],
    stage: {
      tag: "camp",
      camp: { index: 6 },
      mods: [],
      attempt: {
        attemptNumber: 2,
        log: log.map((l) => ({ actorSeatId: null, subjectSeatIds: [], sourceId: null, private: false, ...l })),
        reveals: reveals.map((r) => ({ ...r, fromSeatId: "s1", source: "tornado", toSeatId: null })),
        camp: { discards },
      },
    },
  } as unknown as ExpeditionView;
}

describe("happenings", () => {
  it("passes your cards to the seat on your right, the previous seat in turn order", () => {
    expect(rightOf(happeningView([]), "s1")).toBe("s3");
    expect(rightOf(happeningView([]), "s2")).toBe("s1");
  });

  it("takes the latest gust's cards from the tornado's reveals", () => {
    const view = happeningView(
      [{ event: "gust" }, { event: "whisper" }, { event: "gust" }],
      [card("a", "spades", 2), card("b", "hearts", 3), card("c", "clubs", 4), card("d", "spades", 7), card("e", "hearts", 3), card("f", "diamonds", 12)],
    );
    expect(latestGust(view)).toEqual({
      key: "6:2:2",
      cards: [{ cardId: "d", label: "7♠" }, { cardId: "e", label: "3♥" }, { cardId: "f", label: "Q♦" }],
      toSeatId: "s3",
    });
    expect(bossHappenings(view, seats)).toEqual([
      { key: "6:2:0", kind: "gust", text: "A gust passed 3 cards from every hand right", cards: [] },
      { key: "6:2:2", kind: "gust", text: "A gust sent your 7♠ 3♥ Q♦ to Maximilian", cards: ["7♠", "3♥", "Q♦"] },
    ]);
    expect(latestGust(happeningView([{ event: "gust" }, { event: "gust" }], [card("a", "spades", 2), card("b", "hearts", 3), card("c", "clubs", 4), card("d", "spades", 7)]))?.cards).toEqual([{ cardId: "d", label: "7♠" }]);
    expect(latestGust(happeningView([]))).toBeNull();
  });

  it("says what the locusts ate and shows the cards they took", () => {
    const eaten = [
      { card: { id: "x", identity: { kind: "standard", suit: "clubs", rank: 9 } }, afterTrick: 4 },
      { card: { id: "y", identity: { kind: "joker", joker: "moon" } }, afterTrick: 4 },
    ];
    const view = happeningView([{ event: "ate-item:rope-ladder", subjectSeatIds: ["s2"] }, { event: "ate-item:rope-ladder", subjectSeatIds: ["s1"] }, { event: "quake" }, { event: "ate-cards" }], [], eaten);
    expect(bossHappenings(view, seats).map(({ text, cards }) => ({ text, cards }))).toEqual([
      { text: "Locusts ate Bianca's Rope Ladder", cards: [] },
      { text: "Locusts ate your Rope Ladder", cards: [] },
      { text: "The earthquake shook the open objectives to new owners", cards: [] },
      { text: "Locusts ate a card from every hand", cards: ["9♣", "Moon"] },
    ]);
  });
});
