// Tests for toExpeditionPlayerView (Phase 11, Plan 01, COMM-03). Fixtures
// drive whole runs through the real applyRunAction/setupRun/advanceTo
// harness (run-test-support.ts) — never a hand-rolled copy of any
// legality/dealing/reveal rule. Seeds in this file are 32-char lowercase hex
// strings so a seed-substring assertion cannot false-positive against a
// short/word-shaped seed.

import { describe, expect, it } from "vitest";
import { currentActorSeatId } from "../camp";
import { evaluateObjective } from "../objectives";
import { rulesFor } from "../run/compose";
import { draftOfferFor } from "../run/draft";
import { attemptOf, withAttempt } from "../run/attempt";
import { createRun } from "../run/lifecycle";
import { campIndex } from "../run/plan";
import { applyRunAction } from "../run/stages/registry";
import { defineItem, itemAbility } from "../content/source-def";
import { advanceTo, enumerateLegalRunActions, setupRun, testCatalog } from "../run/run-test-support";
import { CATALOG } from "../run/catalog";
import type { RunState } from "../run/types";
import type { CampState } from "../state";
import { toExpeditionPlayerView } from "./view";
import type { ExpeditionAttemptView, ExpeditionView } from "./view-types";

function attemptViewOf(view: ExpeditionView): ExpeditionAttemptView {
  if (view.stage.tag !== "camp") throw new Error(`expected the camp stage, got ${view.stage.tag}`);
  return view.stage.attempt;
}

const SEATS = ["p0", "p1", "p2"] as const;

describe("toExpeditionPlayerView", () => {
  it("muster: no seat has a character or a ballot, there is no plan yet, and the seed is absent from the JSON", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const run = createRun({ seatIds: [...SEATS], seed });

    const view = toExpeditionPlayerView(run, "p0", CATALOG);

    expect(view.stage).toEqual({ tag: "muster", ballots: [] });
    expect(view.runStatus).toBe("in_progress");
    expect([view.length, view.campCount, view.plan, view.lastVote]).toEqual([null, null, [], null]);
    expect(view.seats).toEqual(
      SEATS.map((seatId) => ({ seatId, characterId: null, upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] })),
    );
    expect(view.yourAbilities).toEqual([]);
    expect(JSON.stringify(view).includes(seed)).toBe(false);
  });

  it("draft: the viewer's head offer only, pendingSeatIds names the seats still to pick, seed absent from JSON", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const base = setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG, camp: 2, characters: { p0: "explorer" } });
    const offer = draftOfferFor(seed, campIndex(2), base.seats[0]!, 0, CATALOG);
    const queued = draftOfferFor(seed, campIndex(2), base.seats[0]!, 1, CATALOG);
    const run: RunState = {
      ...base,
      seats: base.seats.map((s) => (s.seatId === "p0" ? { ...s, offers: [offer, queued] } : s)),
      stage: { tag: "draft", cleared: campIndex(2), payout: 6 },
    };

    const own = toExpeditionPlayerView(run, "p0", CATALOG);
    const other = toExpeditionPlayerView(run, "p1", CATALOG);

    expect(own.stage).toEqual({ tag: "draft", cleared: 2, payout: 6, yourOffer: { kind: "standard", bundles: offer.bundles.map((b) => [...b]) }, pendingSeatIds: ["p0"] });
    expect(other.stage).toEqual({ tag: "draft", cleared: 2, payout: 6, yourOffer: null, pendingSeatIds: ["p0"] });
    expect(JSON.stringify(own).includes(seed)).toBe(false);
    expect(JSON.stringify(own).includes(JSON.stringify(queued.bundles))).toBe(false);
    for (const seat of other.seats) expect(Object.keys(seat).sort()).toEqual(["characterId", "items", "seatId", "upgradeId", "usage"]);
  });

  it("loadout: previews the camp, lists the seats that readied, and closes the shop before a plain camp", () => {
    const run = setupRun({ seatIds: [...SEATS], seed: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", catalog: CATALOG, camp: 2 });
    const readied = applyRunAction(run, "p1", { type: "ready" }, CATALOG);
    if (!readied.ok) throw new Error(readied.error);

    const view = toExpeditionPlayerView(readied.state, "p0", CATALOG);

    expect(view.stage).toMatchObject({ tag: "loadout", yourSlots: 2, shop: null, readySeatIds: ["p1"], camp: { index: 2, shop: false } });
    expect([view.length, view.campCount, view.purse, view.supplies]).toEqual(["standard", 6, 0, { count: 3, max: 4 }]);
    expect(view.plan).toEqual([{ at: 3, tier: "animal", bossId: null }, { at: 6, tier: "temple", bossId: "temple" }]);
  });

  it("loadout and camp: the camp's modifier stack in fold order with each layer's public status, and the preview's pairing", () => {
    const base = setupRun({ seatIds: [...SEATS], seed: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", catalog: CATALOG, camp: 2 });
    if (base.stage.tag !== "loadout") throw new Error("expected a loadout");
    const stormy: RunState = { ...base, stage: { ...base.stage, camp: { ...base.stage.camp, location: "clifftop", weather: "thunderstorm" } } };

    const loadout = toExpeditionPlayerView(stormy, "p0", CATALOG).stage;
    expect(loadout).toMatchObject({
      tag: "loadout",
      camp: { location: "clifftop", weather: "thunderstorm", pairing: null },
      mods: [
        { id: "clifftop", kind: "location", strength: "full", status: [] },
        { id: "thunderstorm", kind: "weather", strength: "full", status: [{ kind: "chance", percent: 20, strikesLeft: 2 }] },
      ],
    });
    const dealt = toExpeditionPlayerView(advanceTo(stormy, "objective-pick", CATALOG), "spectator", CATALOG).stage;
    expect(dealt).toMatchObject({ tag: "camp", mods: [{ id: "clifftop" }, { id: "thunderstorm", status: [{ kind: "chance", percent: 20, strikesLeft: 2 }] }] });

    const paired = testCatalog({ characters: CATALOG.characters, items: CATALOG.items, pairings: [{ location: "clifftop", weathers: ["thunderstorm"], result: { cancels: ["clifftop"], adds: "fair" } }] });
    const pairedView = toExpeditionPlayerView(stormy, "p0", paired).stage;
    expect(pairedView).toMatchObject({ camp: { pairing: "fair" }, mods: [{ id: "thunderstorm" }, { id: "fair" }] });
  });

  it("loadout before a boss camp: the shared stock, and only the viewer's own character's upgrades while it has none", () => {
    const run = setupRun({ seatIds: [...SEATS], seed: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", catalog: CATALOG, camp: 3, characters: { p0: "explorer", p1: "leader" }, upgrades: { p1: "leader.delegate" } });
    const stock = run.stage.tag === "loadout" ? run.stage.stock! : [];
    const own = toExpeditionPlayerView(run, "p0", CATALOG);

    expect(own.stage).toMatchObject({ tag: "loadout", camp: { index: 3, shop: true } });
    expect(own.stage.tag === "loadout" && own.stage.shop).toEqual({
      stock: stock.map((e) => ({ stockId: e.stockId, what: e.what, price: e.price, soldTo: null })),
      yourUpgrades: [
        { stockId: "upgrade:explorer.second-wind", upgradeId: "explorer.second-wind", price: 8 },
        { stockId: "upgrade:explorer.true-form", upgradeId: "explorer.true-form", price: 8 },
        { stockId: "upgrade:explorer.reshape", upgradeId: "explorer.reshape", price: 8 },
      ],
    });
    expect(stock.map((e) => e.stockId)).toEqual(["supplies", "item0", "item1", "item2"]);
    const upgraded = toExpeditionPlayerView(run, "p1", CATALOG);
    expect(upgraded.stage.tag === "loadout" && upgraded.stage.shop!.yourUpgrades).toEqual([]);
    expect(toExpeditionPlayerView(run, "spectator", CATALOG).stage).toMatchObject({ yourSlots: 0, shop: { yourUpgrades: [] } });
  });

  it("muster votes: every seat's ballot is public, and the resolved length vote is reported with its tally", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let run = createRun({ seatIds: [...SEATS], seed });
    const steps = [
      ["p0", { type: "pick-character", characterId: "explorer" }],
      ["p1", { type: "pick-character", characterId: "leader" }],
      ["p2", { type: "pick-character", characterId: "jd" }],
      ["p0", { type: "vote", choice: "long" }],
      ["p1", { type: "vote", choice: null }],
    ] as const;
    for (const [seatId, action] of steps) {
      const result = applyRunAction(run, seatId, action, CATALOG);
      if (!result.ok) throw new Error(result.error);
      run = result.state;
    }
    expect(toExpeditionPlayerView(run, "p2", CATALOG).stage).toEqual({
      tag: "muster",
      ballots: [{ seatId: "p0", choice: "long" }, { seatId: "p1", choice: null }],
    });

    const last = applyRunAction(run, "p2", { type: "vote", choice: "long" }, CATALOG);
    if (!last.ok) throw new Error(last.error);
    const view = toExpeditionPlayerView(last.state, "p2", CATALOG);

    expect(view.lastVote).toEqual({
      topic: "length",
      tally: [{ choice: "short", votes: 0 }, { choice: "standard", votes: 0 }, { choice: "long", votes: 2 }],
      tied: null,
      winner: "long",
    });
    expect([view.length, view.campCount, view.stage.tag]).toEqual(["long", 8, "loadout"]);
  });

  it("ended: the run result shows and the stage carries nothing else", () => {
    const base = setupRun({ seatIds: [...SEATS], seed: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", catalog: CATALOG });
    const lost: RunState = { ...base, supplies: 0, stage: { tag: "ended", result: "lost" } };

    const view = toExpeditionPlayerView(lost, "p0", CATALOG);

    expect([view.runStatus, view.stage, view.supplies]).toEqual(["lost", { tag: "ended", result: "lost" }, { count: 0, max: 4 }]);
  });

  it("seats[] carry each seat's public character, upgrade, equipped and backpack items, and usage by key", () => {
    const run = setupRun({
      seatIds: [...SEATS],
      seed: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      catalog: CATALOG,
      characters: { p0: "explorer", p1: "jd", p2: "leader" },
      upgrades: { p0: "explorer.second-wind", p1: "jd.free-spirit" },
      items: { p0: ["rain-poncho", "heavy-pack", "parrot"] },
    });

    const seats = toExpeditionPlayerView(run, "p1", CATALOG).seats;

    expect(seats[0]).toEqual({
      seatId: "p0",
      characterId: "explorer",
      upgradeId: "explorer.second-wind",
      items: {
        equipped: [
          { uid: "it0", itemId: "rain-poncho", remaining: { kind: "uses", left: 2, of: 2 } },
          { uid: "it1", itemId: "heavy-pack", remaining: null },
        ],
        backpack: [{ uid: "it2", itemId: "parrot", remaining: { kind: "uses", left: 1, of: 1 } }],
        concealed: false,
      },
      usage: [
        { sourceKey: "explorer", remaining: { kind: "uses", left: 2, of: 2 } },
        { sourceKey: "it0", remaining: { kind: "uses", left: 2, of: 2 } },
      ],
    });
    expect(seats[1]).toMatchObject({ characterId: "jd", upgradeId: "jd.free-spirit", usage: [{ sourceKey: "jd.free-spirit", remaining: { kind: "uses", left: 1, of: 1 } }] });
    expect(seats[2]).toMatchObject({ characterId: "leader", usage: [] });
  });

  it("dealt face-up camp: own hand full identity, correct handSizes, objectives carry status, no other seat's card id leaks", () => {
    const seed = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "objective-pick", CATALOG);
    const camp = attemptOf(run)!.camp;

    const view = toExpeditionPlayerView(run, "p0", CATALOG);
    const campView = attemptViewOf(view).camp;

    const ownHand = camp.hands.find((h) => h.seatId === "p0")!;
    expect(campView.yourHand.map((c) => c.id).sort()).toEqual(ownHand.cards.map((c) => c.id).sort());

    for (const hand of camp.hands) {
      const hs = campView.handSizes.find((h) => h.seatId === hand.seatId)!;
      expect(hs.size).toBe(hand.cards.length);
    }

    const otherCardIds = camp.hands.filter((h) => h.seatId !== "p0").flatMap((h) => h.cards.map((c) => c.id));
    const json = JSON.stringify(view);
    for (const id of otherCardIds) {
      expect(json.includes(id)).toBe(false);
    }

    expect(campView.objectives).toHaveLength(camp.objectives.length);
    for (const objective of camp.objectives) {
      const objectiveView = campView.objectives.find((o) => o.id === objective.id)!;
      expect(objectiveView.status).toBe(evaluateObjective(camp, objective));
    }
  });

  it("every viewer, seated or not, sees every objective", () => {
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed: "cccccccccccccccccccccccccccccccc", catalog: CATALOG, camp: 3 }), "objective-pick", CATALOG);
    const ids = attemptOf(run)!.camp.objectives.map((o) => o.id);
    expect(ids).toHaveLength(3);
    for (const viewer of ["p0", "p1", "spectator"]) {
      expect(attemptViewOf(toExpeditionPlayerView(run, viewer, CATALOG)).camp.objectives.map((o) => o.id)).toEqual(ids);
    }
  });

  it("Whisper: only the addressed seat and the sender get the reveal; the public log entry carries no audience key", () => {
    const seed = "dddddddddddddddddddddddddddddddd";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp0 = attemptOf(setup)!.camp;
    const cardId = camp0.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const result = applyRunAction(setup, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const run = result.state;

    const viewA = toExpeditionPlayerView(run, "p0", CATALOG);
    const viewB = toExpeditionPlayerView(run, "p1", CATALOG);
    const viewC = toExpeditionPlayerView(run, "p2", CATALOG);

    expect(attemptViewOf(viewB).reveals).toHaveLength(1);
    expect(attemptViewOf(viewB).reveals[0]!.cardId).toBe(cardId);
    expect(attemptViewOf(viewB).reveals[0]!.fromSeatId).toBe("p0");
    expect(attemptViewOf(viewB).reveals[0]!.toSeatId).toBe("p1");
    expect(attemptViewOf(viewA).reveals.map((r) => ({ cardId: r.cardId, from: r.fromSeatId, to: r.toSeatId, source: r.source }))).toEqual([
      { cardId, from: "p0", to: "p1", source: "whisper" },
    ]);
    expect(attemptViewOf(viewC).reveals).toEqual([]);

    for (const view of [viewA, viewB, viewC]) {
      const whisperEntry = attemptViewOf(view).log.find((e) => e.event === "whisper")!;
      expect(whisperEntry.private).toBe(false);
      expect(Object.keys(whisperEntry).sort()).toEqual(
        ["actorSeatId", "event", "private", "sourceId", "subjectSeatIds"].sort(),
      );
    }
  });

  it("WR-03: a reveal keeps its recorded fromSeatId after the revealed card is moved to a third seat's hand", () => {
    const seed = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp0 = attemptOf(setup)!.camp;
    const cardId = camp0.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const whispered = applyRunAction(setup, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    expect(whispered.ok).toBe(true);
    if (!whispered.ok) return;
    const run = whispered.state;
    const camp = attemptOf(run)!.camp;

    const movedCard = camp.hands.find((h) => h.seatId === "p0")!.cards.find((c) => c.id === cardId)!;
    const movedCamp: CampState = {
      ...camp,
      hands: camp.hands.map((h) => {
        if (h.seatId === "p0") return { seatId: h.seatId, cards: h.cards.filter((c) => c.id !== cardId) };
        if (h.seatId === "p2") return { seatId: h.seatId, cards: [...h.cards, movedCard] };
        return h;
      }),
    };
    const movedRun = withAttempt(run, { ...attemptOf(run)!, camp: movedCamp });

    const viewB = toExpeditionPlayerView(movedRun, "p1", CATALOG);
    expect(attemptViewOf(viewB).reveals).toHaveLength(1);
    expect(attemptViewOf(viewB).reveals[0]!.fromSeatId).toBe("p0");
    expect(attemptViewOf(viewB).reveals[0]!.cardId).toBe(cardId);
  });

  it("unseated viewer: fail-closed defaults across every field", () => {
    const seed = "ffffffffffffffffffffffffffffffff";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);

    const view = toExpeditionPlayerView(run, "ghost", CATALOG);

    expect(view.yourSeatId).toBeNull();
        expect(view.yourAbilities).toEqual([]);
    expect(attemptViewOf(view).camp.yourHand).toEqual([]);
    expect(attemptViewOf(view).camp.yourLegalCardIds).toEqual([]);
    expect(attemptViewOf(view).reveals).toEqual([]);
    for (const entry of attemptViewOf(view).log) {
      expect(entry.private).toBe(false);
    }
  });

  it("yourLegalCardIds is non-empty only for the current actor while playing, and every id belongs to their own hand", () => {
    const seed = "01234567890123456789012345678901";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp = attemptOf(run)!.camp;
    const actor = currentActorSeatId(camp, rulesFor(run, CATALOG))!;

    const actorView = toExpeditionPlayerView(run, actor, CATALOG);
    expect(attemptViewOf(actorView).camp.campPhase).toBe("playing");
    expect(attemptViewOf(actorView).camp.yourLegalCardIds.length).toBeGreaterThan(0);
    const ownHandIds = camp.hands.find((h) => h.seatId === actor)!.cards.map((c) => c.id);
    for (const id of attemptViewOf(actorView).camp.yourLegalCardIds) {
      expect(ownHandIds).toContain(id);
    }

    const nonActor = SEATS.find((s) => s !== actor)!;
    const otherView = toExpeditionPlayerView(run, nonActor, CATALOG);
    expect(attemptViewOf(otherView).camp.yourLegalCardIds).toEqual([]);
  });

  it("yourWhisper: one whisper allowed per camp, spent after sending, null when unseated", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const cardId = attemptOf(setup)!.camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    expect(attemptViewOf(toExpeditionPlayerView(setup, "p0", CATALOG)).yourWhisper).toEqual({ allowed: true, left: 1 });

    const sent = applyRunAction(setup, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    if (!sent.ok) throw new Error(sent.error);
    expect(attemptViewOf(toExpeditionPlayerView(sent.state, "p0", CATALOG)).yourWhisper).toEqual({ allowed: true, left: 0 });
    expect(attemptViewOf(toExpeditionPlayerView(sent.state, "p1", CATALOG)).yourWhisper).toEqual({ allowed: true, left: 1 });
    expect(attemptViewOf(toExpeditionPlayerView(sent.state, "watcher", CATALOG)).yourWhisper).toBeNull();
  });

  it("yourWhisper: a Rain Poncho gives only its owner one more whisper this camp", () => {
    const seed = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG, camp: 3, items: { p0: ["rain-poncho"] } }), "between-tricks", CATALOG);
    const used = applyRunAction(run, "p0", { type: "use-ability", sourceKey: "it0", targets: [] }, CATALOG);
    if (!used.ok) throw new Error(used.error);
    expect(attemptViewOf(toExpeditionPlayerView(used.state, "p0", CATALOG)).yourWhisper).toEqual({ allowed: true, left: 2 });
    expect(attemptViewOf(toExpeditionPlayerView(used.state, "p1", CATALOG)).yourWhisper).toEqual({ allowed: true, left: 1 });
  });

  it("is pure: two calls return deep-equal views, the input state is unchanged, and the view round-trips through JSON", () => {
    const seed = "99999999999999999999999999999999";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const before = JSON.stringify(run);

    const view1 = toExpeditionPlayerView(run, "p0", CATALOG);
    const view2 = toExpeditionPlayerView(run, "p0", CATALOG);

    expect(view1).toEqual(view2);
    expect(JSON.stringify(run)).toBe(before);

    const roundTripped = JSON.parse(JSON.stringify(view1));
    expect(roundTripped).toEqual(view1);
  });
});

describe("toExpeditionPlayerView: abilities, effects, rescue and ranks", () => {
  const SEED = "abababababababababababababababab";

  it("yourAbilities: a usable ability lists its steps' choices, an unusable one a reason and no steps", () => {
    const run = advanceTo(
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, characters: { p0: "leader", p1: "jd" }, upgrades: { p0: "leader.delegate" }, items: { p0: ["rope-ladder"] } }),
      "between-tricks",
      CATALOG,
    );

    const abilities = toExpeditionPlayerView(run, "p0", CATALOG).yourAbilities;

    expect(abilities.map((a) => a.sourceKey)).toEqual(["leader.delegate", "it0"]);
    const [delegate, ladder] = abilities;
    expect(delegate).toEqual({
      sourceKey: "leader.delegate",
      usableNow: true,
      reason: null,
      steps: [{ kind: "player", prompt: "Pick a teammate", choices: ["seat:p1", "seat:p2"] }],
    });
    expect(ladder).toEqual({ sourceKey: "it0", usableNow: false, reason: "Usable when an objective fails", steps: [] });
    expect(toExpeditionPlayerView(run, "p1", CATALOG).yourAbilities).toEqual([]);
  });

  it("yourAbilities: a spent ability reports why it cannot be used", () => {
    const start = advanceTo(
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, characters: { p0: "explorer" } }),
      "between-tricks",
      CATALOG,
    );
    const choice = toExpeditionPlayerView(start, "p0", CATALOG).yourAbilities[0]!.steps[0]!.choices[0]!;
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceKey: "explorer", targets: [choice] }, CATALOG);
    if (!used.ok) throw new Error(used.error);

    const view = toExpeditionPlayerView(used.state, "p0", CATALOG);

    expect(view.yourAbilities).toEqual([{ sourceKey: "explorer", usableNow: false, reason: "Already used", steps: [] }]);
    expect(view.seats[0]!.usage).toEqual([{ sourceKey: "explorer", remaining: { kind: "uses", left: 0, of: 1 } }]);
    expect(attemptViewOf(view).effects.map((e) => e.origin)).toEqual([{ kind: "seat", seatId: "p0", sourceId: "explorer" }]);
  });

  it("effect params: shown to the owner of an owner-audience effect, null for everyone else; public params shown to all", () => {
    const start = advanceTo(
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, items: { p0: ["whetstone"], p1: ["rain-poncho"] } }),
      "between-tricks",
      CATALOG,
    );
    const step = toExpeditionPlayerView(start, "p0", CATALOG).yourAbilities.find((a) => a.sourceKey === "it0")!.steps[0]!;
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceKey: "it0", targets: [step.choices[0]!] }, CATALOG);
    if (!used.ok) throw new Error(used.error);

    const ownerEffect = attemptViewOf(toExpeditionPlayerView(used.state, "p0", CATALOG)).effects[0]!;
    const otherEffect = attemptViewOf(toExpeditionPlayerView(used.state, "p1", CATALOG)).effects[0]!;
    const spectatorEffect = attemptViewOf(toExpeditionPlayerView(used.state, "ghost", CATALOG)).effects[0]!;

    expect(ownerEffect).toMatchObject({ origin: { kind: "seat", seatId: "p0", sourceId: "whetstone" }, lasts: "attempt" });
    expect(Object.keys(ownerEffect.params!).sort()).toEqual(["cardId", "rank"]);
    expect(otherEffect).toEqual({ origin: { kind: "seat", seatId: "p0", sourceId: "whetstone" }, atTrick: 0, lasts: "attempt", params: null });
    expect(spectatorEffect.params).toBeNull();

    const publicCatalog = testCatalog({
      items: {
        flag: defineItem({
          id: "flag",
          name: "Flag",
          rarity: "common",
          price: 2,
          uses: { kind: "per-camp" },
          text: "Nothing happens.",
          active: itemAbility({
            window: "between-tricks",
            targets: [],
            apply: () => [{ op: "add-modifier", lasts: "attempt", params: { colour: "red", n: 2 }, audience: "public" }],
            effect: () => ({}),
          }),
        }),
      },
    });
    const flagged = applyRunAction(
      advanceTo(setupRun({ seatIds: [...SEATS], seed: SEED, catalog: publicCatalog, items: { p0: ["flag"] } }), "between-tricks", publicCatalog),
      "p0",
      { type: "use-ability", sourceKey: "it0", targets: [] },
      publicCatalog,
    );
    if (!flagged.ok) throw new Error(flagged.error);
    expect(attemptViewOf(toExpeditionPlayerView(flagged.state, "p2", publicCatalog)).effects[0]!.params).toEqual({ colour: "red", n: 2 });
  });

  it("effectiveRank is set only on the card whose rank the composed rankOf changed", () => {
    const start = advanceTo(
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, items: { p0: ["whetstone"] } }),
      "between-tricks",
      CATALOG,
    );
    const before = attemptViewOf(toExpeditionPlayerView(start, "p0", CATALOG)).camp.yourHand;
    expect(before.every((card) => card.effectiveRank === null)).toBe(true);

    const step = toExpeditionPlayerView(start, "p0", CATALOG).yourAbilities.find((a) => a.sourceKey === "it0")!.steps[0]!;
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceKey: "it0", targets: [step.choices[0]!] }, CATALOG);
    if (!used.ok) throw new Error(used.error);

    const view = toExpeditionPlayerView(used.state, "p0", CATALOG);
    const params = attemptViewOf(view).effects[0]!.params as { cardId: string; rank: number };
    const changed = attemptViewOf(view).camp.yourHand.filter((card) => card.effectiveRank !== null);
    expect(changed.map((card) => card.id)).toEqual([params.cardId]);
    expect(changed[0]!.effectiveRank).toBe(params.rank);
    const printed = changed[0]!.identity;
    expect(printed.kind === "standard" && printed.rank).not.toBe(params.rank);
  });

  it("effectiveRank on a trick play is the composed rank, null when it matches the printed one", () => {
    const boostCatalog = testCatalog({
      items: {
        boost: defineItem({
          id: "boost",
          name: "Boost",
          rarity: "common",
          price: 2,
          uses: { kind: "per-camp" },
          text: "Nothing happens.",
          active: itemAbility({
            window: "between-tricks",
            targets: [],
            apply: () => [{ op: "add-modifier", lasts: "attempt", params: {}, audience: "public" }],
            effect: () => ({ rankOf: (prev) => (card) => (card.identity.kind === "standard" ? prev(card) + 1 : prev(card)) }),
          }),
        }),
      },
    });
    const start = advanceTo(setupRun({ seatIds: [...SEATS], seed: SEED, catalog: boostCatalog, items: { p0: ["boost"] } }), "between-tricks", boostCatalog);
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceKey: "it0", targets: [] }, boostCatalog);
    if (!used.ok) throw new Error(used.error);
    const camp = attemptOf(used.state)!.camp;
    const rules = rulesFor(used.state, boostCatalog);
    const actor = currentActorSeatId(camp, rules)!;
    const standard = rules.legalPlays(camp, actor).find((card) => card.identity.kind === "standard")!;
    const played = applyRunAction(used.state, actor, { type: "play-card", cardId: standard.id }, boostCatalog);
    if (!played.ok) throw new Error(played.error);

    const play = attemptViewOf(toExpeditionPlayerView(played.state, "p0", boostCatalog)).camp.currentTrick.plays[0]!;

    if (play.hidden) throw new Error("expected the play face up");
    expect(play.card.id).toBe(standard.id);
    expect(standard.identity.kind === "standard" && play.effectiveRank).toBe(standard.identity.kind === "standard" ? standard.identity.rank + 1 : null);
  });

  /** Plays pick-objective and play-card only, through the real dispatcher,
   * until some seat's view shows the rescue window. */
  function walkToRescue(): RunState {
    for (let attempt = 0; attempt < 60; attempt++) {
      let state = setupRun({ seatIds: [...SEATS], seed: `${SEED}${attempt}`.slice(-32), catalog: CATALOG, items: { p0: ["rope-ladder"] } });
      state = advanceTo(state, "objective-pick", CATALOG);
      for (let step = 0; step < 200; step++) {
        const view = toExpeditionPlayerView(state, "p0", CATALOG);
        if (view.stage.tag !== "camp") break;
        if (attemptViewOf(view).window === "rescue") return state;
        const legal = enumerateLegalRunActions(state, CATALOG).filter((c) => c.action.type === "pick-objective" || c.action.type === "play-card");
        if (legal.length === 0) break;
        const picked = legal[(step * 7 + attempt) % legal.length]!;
        const result = applyRunAction(state, picked.seatId, picked.action, CATALOG);
        if (!result.ok) throw new Error(result.error);
        state = result.state;
      }
    }
    throw new Error("no walk reached the rescue window");
  }

  it("attempt.rescue lists the failed visible objectives while the rescue window holds the camp, and is null otherwise", () => {
    const run = walkToRescue();
    const view: ExpeditionView = toExpeditionPlayerView(run, "p0", CATALOG);

    expect(view.stage.tag).toBe("camp");
    expect(attemptViewOf(view).window).toBe("rescue");
    expect(attemptViewOf(view).pendingSeatIds).toEqual(["p0"]);
    const rescue = attemptViewOf(view).rescue!;
    expect(rescue.failedObjectiveIds.length).toBeGreaterThan(0);
    for (const id of rescue.failedObjectiveIds) {
      expect(attemptViewOf(view).camp.objectives.find((o) => o.id === id)!.status).toBe("failed");
    }
    expect(view.yourAbilities.find((a) => a.sourceKey === "it0")!.usableNow).toBe(true);

    const between = advanceTo(setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG }), "between-tricks", CATALOG);
    expect(attemptViewOf(toExpeditionPlayerView(between, "p0", CATALOG)).rescue).toBeNull();
  });
});
