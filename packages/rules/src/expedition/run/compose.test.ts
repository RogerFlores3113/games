// Tests for run/compose.ts (Plan 10-03: composeRules, ruleLayersFor,
// rulesFor).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { baseDeckFor, dealHands } from "../deck";
import { createCamp } from "../camp";
import { baseRules } from "../rules";
import { isTrump, trickWinner } from "../trick";
import { currentActorSeatId } from "../camp";
import { winnerExcluding } from "../content/helpers";
import { composeRules, ruleLayersFor, rulesFor } from "./compose";
import { attemptOf } from "./attempt";
import { campIndex } from "./plan";
import { CATALOG } from "./catalog";
import { campSpecAt } from "./route";
import { applyRunAction } from "./stages/registry";
import { advanceTo, setupRun, testCatalog } from "./run-test-support";
import type { RuleModifier } from "./run-rules";
import type { AttemptState, Catalog, RunState, SeatRun } from "./types";
import type { CampState, CardIdentity, ExpeditionCard, Hand, TrickPlay } from "../state";
import { ability, defineCharacter, defineItem, defineUpgrade, itemAbility } from "../content/source-def";

function seat(seatId: string, overrides: Partial<SeatRun> = {}): SeatRun {
  return { seatId, characterId: null, upgradeId: null, items: [], equipped: [], offers: [], ledger: [], ...overrides };
}

/** Equipped instances of `itemIds`, uids counting from `first`. */
function carrying(first: number, ...itemIds: string[]): Pick<SeatRun, "items" | "equipped"> {
  const items = itemIds.map((itemId, i) => ({ uid: `it${first + i}`, itemId }));
  return { items, equipped: items.map((item) => item.uid) };
}

/** A run at camp 2: in its attempt when `attempt` is given, else at its loadout. */
function makeRun(overrides: Partial<RunState> & { attempt?: AttemptState } = {}): RunState {
  const { attempt, ...rest } = overrides;
  const seatIds = rest.seatIds ?? ["p0", "p1", "p2"];
  const spec = campSpecAt("test-seed", "standard", campIndex(2), CATALOG);
  return {
    seed: "test-seed",
    seatIds,
    purse: 0,
    supplies: 3,
    seats: seatIds.map((id) => seat(id)),
    kicked: [],
    plan: { length: "standard", bosses: [] },
    history: [],
    lastVote: null,
    itemSerial: 0,
    stage: attempt === undefined ? { tag: "loadout", camp: spec, stock: null, ready: {} } : { tag: "camp", camp: spec, attempt },
    ...rest,
  };
}

function makeAttempt(overrides: Partial<AttemptState> = {}): AttemptState {
  return {
    attemptNumber: 1,
    effects: [],
    reveals: [],
    log: [],
    camp: createCamp({ seatIds: ["p0", "p1", "p2"], seed: "attempt-seed", objectiveSlots: [{ kind: "win-card" }] }, baseRules),
    ...overrides,
  };
}

function card(id: string, identity: CardIdentity): ExpeditionCard {
  return { id, identity };
}

const HEARTS_5: CardIdentity = { kind: "standard", suit: "hearts", rank: 5 };
const HEARTS_2: CardIdentity = { kind: "standard", suit: "hearts", rank: 2 };
const SPADES_3: CardIdentity = { kind: "standard", suit: "spades", rank: 3 };
const SPADES_7: CardIdentity = { kind: "standard", suit: "spades", rank: 7 };
const HEARTS_9: CardIdentity = { kind: "standard", suit: "hearts", rank: 9 };
const MOON: CardIdentity = { kind: "joker", joker: "moon" };

/** A layer that ADDS spades to whatever isTrump already recognizes (jokers
 * stay trump too), used for the WR-03-via-composition behavior test. */
const spadesAlsoTrump: RuleModifier = {
  isTrump: (prev) => (identity) => prev(identity) || (identity.kind === "standard" && identity.suit === "spades"),
};

function minimalCampStateFor(hands: readonly Hand[], currentTrickPlays: readonly TrickPlay[]): CampState {
  return {
    seatIds: hands.map((h) => h.seatId),
    playerCount: hands.length as 3 | 4 | 5,
    removedCards: [],
    totalTricks: 1,
    hands,
    expeditionLeaderSeatId: hands[0]!.seatId,
    objectives: [],
    objectiveDeck: [],
    discards: [], voidedTricks: [],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: hands[0]!.seatId, plays: currentTrickPlays },
  };
}

describe("composeRules([])", () => {
  it("trickWinner matches the base resolver", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: card("c0", HEARTS_5) },
      { seatId: "p1", card: card("c1", SPADES_3) },
      { seatId: "p2", card: card("c2", HEARTS_2) },
    ];
    const composed = composeRules([]);
    expect(composed.trickWinner(plays, HEARTS_5)).toBe(trickWinner(plays, HEARTS_5));
    expect(composed.trickWinner(plays, HEARTS_5)).toBe("p0");
  });

  it("legalPlays matches the base resolver", () => {
    const hands: Hand[] = [
      { seatId: "p0", cards: [card("c0", HEARTS_9), card("c1", MOON)] },
      { seatId: "p1", cards: [] },
    ];
    const currentTrickPlays: TrickPlay[] = [{ seatId: "p1", card: card("led", SPADES_7) }];
    const state = minimalCampStateFor(hands, currentTrickPlays);
    const composed = composeRules([]);
    expect(composed.legalPlays(state, "p0")).toEqual(baseRules.legalPlays(state, "p0"));
  });

  it("has base-value whisper/objective/failure hooks", () => {
    const run = makeRun();
    const composed = composeRules([]);
    expect(composed.whisperAllowed(run, "p0")).toBe(true);
    expect(composed.whispersPerCamp(run, "p0")).toBe(1);
    expect(composed.whisperAudience(run, "p0", "p1")).toEqual(["p1"]);
    expect(composed.failureCost(run)).toBe(1);
  });
});

describe("composeRules layer folding", () => {
  it("folds two whispersPerCamp layers in order (non-commutative)", () => {
    const doubler: RuleModifier = { whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) * 2 };
    const incrementer: RuleModifier = { whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) + 1 };
    const run = makeRun();

    const doublerThenIncrementer = composeRules([doubler, incrementer]);
    expect(doublerThenIncrementer.whispersPerCamp(run, "p0")).toBe(3); // (1*2)+1

    const incrementerThenDoubler = composeRules([incrementer, doubler]);
    expect(incrementerThenDoubler.whispersPerCamp(run, "p0")).toBe(4); // (1+1)*2
  });

  it("an isTrump-only layer changes the composed trickWinner (WR-03)", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: card("c0", HEARTS_5) },
      { seatId: "p1", card: card("c1", SPADES_3) },
      { seatId: "p2", card: card("c2", HEARTS_2) },
    ];
    expect(composeRules([]).trickWinner(plays, HEARTS_5)).toBe("p0");
    expect(composeRules([spadesAlsoTrump]).trickWinner(plays, HEARTS_5)).toBe("p1");
  });

  it("a rankOf layer changes the composed trickWinner, folded in layer order", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: card("c0", HEARTS_5) },
      { seatId: "p1", card: card("c1", HEARTS_9) },
      { seatId: "p2", card: card("c2", HEARTS_2) },
    ];
    const twoUpFive: RuleModifier = { rankOf: (prev) => (c) => (c.id === "c2" ? prev(c) + 5 : prev(c)) };
    const twoUpThree: RuleModifier = { rankOf: (prev) => (c) => (c.id === "c2" ? prev(c) + 3 : prev(c)) };
    expect(composeRules([]).trickWinner(plays, HEARTS_5)).toBe("p1");
    expect(composeRules([twoUpFive]).trickWinner(plays, HEARTS_5)).toBe("p1"); // 7 < 9
    expect(composeRules([twoUpFive, twoUpThree]).trickWinner(plays, HEARTS_5)).toBe("p2"); // 10 > 9
  });

  it("an identityOf layer folds first: the composed trickWinner, rankOf and legalPlays read what a card counts as", () => {
    const sevenAsHeart: RuleModifier = {
      identityOf: (prev) => (c) => (c.id === "s7" ? { kind: "standard", suit: "hearts", rank: 7 } : prev(c)),
    };
    const plays: TrickPlay[] = [
      { seatId: "p0", card: card("c0", HEARTS_5) },
      { seatId: "p1", card: card("s7", SPADES_7) },
    ];
    expect(composeRules([]).trickWinner(plays, HEARTS_5)).toBe("p0");
    expect(composeRules([sevenAsHeart]).trickWinner(plays, HEARTS_5)).toBe("p1");

    const hands: Hand[] = [{ seatId: "p0", cards: [card("s7", SPADES_7), card("c9", HEARTS_9)] }];
    const state = minimalCampStateFor(hands, [{ seatId: "p9", card: card("led", HEARTS_2) }]);
    expect(composeRules([sevenAsHeart]).legalPlays(state, "p0").map((c) => c.id)).toEqual(["s7", "c9"]);
    expect(composeRules([]).legalPlays(state, "p0").map((c) => c.id)).toEqual(["c9"]);
  });

  it("an isTrump-only layer changes the composed legalPlays (WR-03)", () => {
    const hands: Hand[] = [{ seatId: "p0", cards: [card("c0", HEARTS_9), card("c1", MOON)] }];
    const currentTrickPlays: TrickPlay[] = [{ seatId: "p9", card: card("led", SPADES_7) }];
    const state = minimalCampStateFor(hands, currentTrickPlays);

    const defaultLegal = composeRules([]).legalPlays(state, "p0");
    expect(defaultLegal.map((c) => c.id).sort()).toEqual(["c0", "c1"]); // void of spades, whole hand legal

    const trumpLegal = composeRules([spadesAlsoTrump]).legalPlays(state, "p0");
    expect(trumpLegal.map((c) => c.id)).toEqual(["c1"]); // led is now trump; must play the joker
  });
});

describe("rulesFor / ruleLayersFor", () => {
  const passiveItem = defineItem({
    id: "whisper-plus-2",
    name: "Whisper+2",
    rarity: "common",
    price: 2,
    text: "",
    passive: {
      modifier: (owner) => ({
        whispersPerCamp: (prev) => (run, seatId) => (seatId === owner.seatId ? prev(run, seatId) + 2 : prev(run, seatId)),
      }),
    },
  });
  const effectItem = defineItem({
    id: "effect-item",
    name: "Effect+1",
    rarity: "common",
    price: 2,
    uses: { kind: "per-camp" },
    text: "",
    active: itemAbility({
      window: "between-tricks",
      targets: [],
      apply: () => [],
      effect: () => ({ whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) + 1 }),
    }),
  });
  const catalog = testCatalog({ items: { "whisper-plus-2": passiveItem, "effect-item": effectItem } });
  const effect = { origin: { kind: "seat", seatId: "p0", sourceKey: "effect-item", sourceId: "effect-item" }, atTrick: 0, lasts: "attempt", deferIfFatal: false, params: {}, audience: "public" } as const;

  it("applies an equipped item's passive only for its owner", () => {
    const run = makeRun({
      seats: [seat("p0"), seat("p1", carrying(0, "whisper-plus-2")), seat("p2")],
      attempt: makeAttempt(),
    });
    const rules = rulesFor(run, catalog);
    expect(rules.whispersPerCamp(run, "p1")).toBe(3);
    expect(rules.whispersPerCamp(run, "p0")).toBe(1);
  });

  it("applies a character's passive, and tunes it by the owner's upgrades", () => {
    const tuned = defineCharacter({
      id: "tuned",
      name: "Tuned",
      theme: "t",
      power: "p",
      text: "",
      passive: {
        modifier: (owner) => ({
          whispersPerCamp: (prev) => (run, seatId) => (seatId === owner.seatId ? (owner.hasUpgrade("tuned.a") ? 4 : 2) : prev(run, seatId)),
        }),
      },
      upgrades: [defineUpgrade({ id: "tuned.a", name: "A", text: "" }), defineUpgrade({ id: "tuned.b", name: "B", text: "" })],
    });
    const tunedCatalog = testCatalog({ characters: { tuned } });
    const plain = makeRun({ seats: [seat("p0", { characterId: "tuned" }), seat("p1"), seat("p2")], attempt: makeAttempt() });
    const upgraded = makeRun({ seats: [seat("p0", { characterId: "tuned", upgradeId: "tuned.a" }), seat("p1"), seat("p2")], attempt: makeAttempt() });
    expect(rulesFor(plain, tunedCatalog).whispersPerCamp(plain, "p0")).toBe(2);
    expect(rulesFor(upgraded, tunedCatalog).whispersPerCamp(upgraded, "p0")).toBe(4);
    expect(rulesFor(upgraded, tunedCatalog).whispersPerCamp(upgraded, "p1")).toBe(1);
  });

  it("applies an attempt effect through its source's active.effect", () => {
    const run = makeRun({ attempt: makeAttempt({ effects: [effect] }) });
    expect(rulesFor(run, catalog).whispersPerCamp(run, "p0")).toBe(2);
  });

  it("recomputes on every call, with no cache (T-10-08)", () => {
    const withoutEffect = makeRun({ attempt: makeAttempt({ effects: [] }) });
    const withEffect = makeRun({ attempt: makeAttempt({ effects: [effect] }) });
    expect(rulesFor(withoutEffect, catalog).whispersPerCamp(withoutEffect, "p0")).toBe(1);
    expect(rulesFor(withEffect, catalog).whispersPerCamp(withEffect, "p0")).toBe(2);
  });

  it("throws naming an equipped item id missing from the catalogue (POLICY A3)", () => {
    const run = makeRun({ seats: [seat("p0", carrying(0, "ghost-source")), seat("p1"), seat("p2")] });
    expect(() => ruleLayersFor(run, catalog)).toThrow(/ghost-source/);
  });

  it("throws naming a character id missing from the catalogue (POLICY A3)", () => {
    const run = makeRun({ seats: [seat("p0", { characterId: "ghost-character" }), seat("p1"), seat("p2")] });
    expect(() => ruleLayersFor(run, catalog)).toThrow(/ghost-character/);
  });

  it("throws when an effect's source has no active.effect", () => {
    const passiveOnly = { ...effect, origin: { ...effect.origin, sourceId: "whisper-plus-2" } };
    const run = makeRun({ attempt: makeAttempt({ effects: [passiveOnly] }) });
    expect(() => ruleLayersFor(run, catalog)).toThrow(/whisper-plus-2.*no active\.effect/);
  });

  it("throws when an effect's source has an active ability but no effect function", () => {
    const noEffect = defineItem({
      id: "no-effect",
      name: "No effect",
      rarity: "common",
      price: 2,
      uses: { kind: "per-camp" },
      text: "",
      active: itemAbility({ window: "between-tricks", targets: [], apply: () => [] }),
    });
    const bare = testCatalog({ items: { "no-effect": noEffect } });
    const run = makeRun({ attempt: makeAttempt({ effects: [{ ...effect, origin: { ...effect.origin, sourceId: "no-effect" } }] }) });
    expect(() => ruleLayersFor(run, bare)).toThrow(/no-effect.*no active\.effect/);
  });
});

describe("layer order", () => {
  // Each layer appends its label to whisperAudience, so the answer lists the
  // layers in the order they were folded, after the base's [target].
  const tag = (label: string) => ({
    whisperAudience: (prev: (run: RunState, seatId: string, targetSeatId: string) => readonly string[]) => (run: RunState, seatId: string, targetSeatId: string) =>
      [...prev(run, seatId, targetSeatId), label],
  });
  const passive = (label: string) => ({ modifier: () => tag(label) });
  const char0 = defineCharacter({
    id: "char-0",
    name: "C0",
    theme: "t",
    power: "p",
    text: "",
    passive: passive("char-0"),
    upgrades: [defineUpgrade({ id: "char-0.a", name: "A", text: "", passive: passive("char-0.a") }), defineUpgrade({ id: "char-0.b", name: "B", text: "" })],
  });
  const char1 = defineCharacter({
    id: "char-1",
    name: "C1",
    theme: "t",
    power: "p",
    text: "",
    passive: passive("char-1"),
    upgrades: [defineUpgrade({ id: "char-1.a", name: "A", text: "" }), defineUpgrade({ id: "char-1.b", name: "B", text: "" })],
  });
  const itemA = defineItem({ id: "item-a", name: "A", rarity: "common", price: 2, text: "", passive: passive("item-a") });
  const itemB = defineItem({ id: "item-b", name: "B", rarity: "common", price: 2, text: "", passive: passive("item-b") });
  const fx = defineItem({
    id: "fx",
    name: "Fx",
    rarity: "common",
    price: 2,
    uses: { kind: "per-camp" },
    text: "",
    active: itemAbility({ window: "between-tricks", targets: [], apply: () => [], effect: () => tag("effect") }),
  });
  const catalog = testCatalog({ characters: { "char-0": char0, "char-1": char1 }, items: { "item-a": itemA, "item-b": itemB, fx } });

  const run = makeRun({
    seats: [
      seat("p0", { characterId: "char-0", upgradeId: "char-0.a", ...carrying(0, "item-b", "item-a") }),
      seat("p1", { characterId: "char-1", ...carrying(2, "item-a") }),
      seat("p2"),
    ],
    attempt: makeAttempt({
      effects: [
        { origin: { kind: "seat", seatId: "p2", sourceKey: "fx", sourceId: "fx" }, atTrick: 0, lasts: "attempt", deferIfFatal: false, params: {}, audience: "public" },
        { origin: { kind: "seat", seatId: "p1", sourceKey: "fx", sourceId: "fx" }, atTrick: 0, lasts: "attempt", deferIfFatal: false, params: {}, audience: "public" },
      ],
    }),
  });

  it("folds passives in seat order and [character, upgrade, ...equipped] order, then effects", () => {
    expect(rulesFor(run, catalog).whisperAudience(run, "p0", "p9")).toEqual([
      "p9",
      "char-0",
      "char-0.a",
      "item-b",
      "item-a",
      "char-1",
      "item-a",
      "effect",
      "effect",
    ]);
  });
});

describe("composeRules([]) end-to-end against a createCamp fixture", () => {
  it("createCamp accepts composeRules([]) as a CoreRules", () => {
    const rules = composeRules([]);
    const camp = createCamp({ seatIds: ["p0", "p1", "p2"], seed: "fixture-seed", objectiveSlots: [{ kind: "win-card" }] }, rules);
    expect(camp.seatIds).toEqual(["p0", "p1", "p2"]);
  });
});

describe("trick-scoped effects", () => {
  function sitOutItem(id: string, lasts: "attempt" | "trick") {
    return defineItem({
      id,
      name: id,
      rarity: "common",
      price: 2,
      uses: { kind: "per-camp" },
      text: "",
      active: itemAbility({
        window: "between-tricks",
        targets: [],
        apply: () => [{ op: "add-modifier", lasts, params: {}, audience: "public" }],
        effect: (effect) => ({
          trickWinner: (prev) => (plays, led) => winnerExcluding(prev, plays, led, (play) => play.seatId === effect.origin.seatId),
        }),
      }),
    });
  }
  const catalog = testCatalog({ items: { "sit-out-trick": sitOutItem("sit-out-trick", "trick"), "sit-out-camp": sitOutItem("sit-out-camp", "attempt") } });
  const probe: TrickPlay[] = [
    { seatId: "p0", card: card("x0", { kind: "standard", suit: "hearts", rank: 14 }) },
    { seatId: "p1", card: card("x1", HEARTS_2) },
    { seatId: "p2", card: card("x2", HEARTS_5) },
  ];

  function useThenPlayOneTrick(sourceId: string): { afterUse: RunState; afterTrick: RunState } {
    const start = advanceTo(
      setupRun({ seatIds: ["p0", "p1", "p2"], seed: "trick-scope", catalog, items: { p0: [sourceId] } }),
      "between-tricks",
      catalog,
    );
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceKey: "it0", targets: [] }, catalog);
    if (!used.ok) throw new Error(used.error);
    let run = used.state;
    for (let i = 0; i < 3; i++) {
      const rules = rulesFor(run, catalog);
      const camp = attemptOf(run)!.camp;
      const actor = currentActorSeatId(camp, rules)!;
      const played = applyRunAction(run, actor, { type: "play-card", cardId: rules.legalPlays(camp, actor)[0]!.id }, catalog);
      if (!played.ok) throw new Error(played.error);
      run = played.state;
    }
    return { afterUse: used.state, afterTrick: run };
  }

  it("a trick-scoped effect bends exactly one trick", () => {
    const { afterUse, afterTrick } = useThenPlayOneTrick("sit-out-trick");
    expect(rulesFor(afterUse, catalog).trickWinner(probe, probe[0]!.card.identity)).toBe("p2");
    expect(attemptOf(afterTrick)!.camp.completedTricks[0]!.winnerSeatId).not.toBe("p0");
    expect(attemptOf(afterTrick)!.camp.completedTricks).toHaveLength(1);
    expect(rulesFor(afterTrick, catalog).trickWinner(probe, probe[0]!.card.identity)).toBe("p0");
  });

  it("an attempt-scoped effect keeps bending after that trick", () => {
    const { afterTrick } = useThenPlayOneTrick("sit-out-camp");
    expect(rulesFor(afterTrick, catalog).trickWinner(probe, probe[0]!.card.identity)).toBe("p2");
  });
});

describe("property: winnerExcluding", () => {
  it("winnerExcluding always returns a seat that played", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(3, 4, 5),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat(), { minLength: 5, maxLength: 5 }),
        fc.nat(),
        fc.boolean(),
        (playerCount, seed, cardPicks, excludedPick, spadesTrump) => {
          const seatIds = Array.from({ length: playerCount }, (_, i) => `seat-${i}`);
          const { hands } = dealHands({ seatIds, seed, deck: baseDeckFor(playerCount as 3 | 4 | 5) });
          const plays: TrickPlay[] = hands.map((hand, i) => ({
            seatId: hand.seatId,
            card: hand.cards[cardPicks[i]! % hand.cards.length]!,
          }));
          const excludedSeatId = plays[excludedPick % plays.length]!.seatId;
          const prev = composeRules(spadesTrump ? [spadesAlsoTrump] : []).trickWinner;

          const winner = winnerExcluding(prev, plays, plays[0]!.card.identity, (play) => play.seatId === excludedSeatId);

          expect(seatIds).toContain(winner);
          expect(winner).not.toBe(excludedSeatId);
        },
      ),
      { numRuns: 200 },
    );
  });
});
