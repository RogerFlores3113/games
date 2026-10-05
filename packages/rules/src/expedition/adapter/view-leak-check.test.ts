// Canary tests for view-leak-check.ts (Phase 11, Plan 04, COMM-03/ENG-03).
// Real fixtures are built via setupRun/advanceTo/applyRunAction with the
// production CATALOG and 32-hex seeds (so the seed-substring scan is always
// active); clean views assert []; every canary clones a clean view
// (structuredClone) and mutates the CLONE, never the original state or view,
// proving each detection layer can fail.

import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { draftOfferFor } from "../run/draft";
import { attemptOf } from "../run/attempt";
import { createRun } from "../run/lifecycle";
import { campIndex } from "../run/plan";
import { applyRunAction } from "../run/stages/registry";
import { advanceTo, setupRun, testCatalog } from "../run/run-test-support";
import { currentActorSeatId } from "../camp";
import { defineItem } from "../content/source-def";
import { rulesFor } from "../run/compose";
import { toExpeditionPlayerView } from "./view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "./view-leak-check";
import type { Catalog, RunState } from "../run/types";
import type { CardIdentity } from "../state";
import type { ExpeditionAttemptView, ExpeditionView } from "./view-types";

const SEED = "0123456789abcdef0123456789abcdef";
const SEAT_IDS = ["p0", "p1", "p2"];

function attemptViewOf(view: ExpeditionView): ExpeditionAttemptView {
  if (view.stage.tag !== "camp") throw new Error(`expected the camp stage, got ${view.stage.tag}`);
  return view.stage.attempt;
}

function dealtFaceUpCamp(): RunState {
  return advanceTo(
    setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG, camp: 1 }),
    "objective-pick",
    CATALOG,
  );
}

function postWhisperState(): RunState {
  const between = advanceTo(
    setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG, camp: 2 }),
    "between-tricks",
    CATALOG,
  );
  const hand = attemptOf(between)!.camp.hands.find((h) => h.seatId === "p0")!;
  const cardId = hand.cards[0]!.id;
  const result = applyRunAction(between, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
  if (!result.ok) throw new Error(`postWhisperState: whisper rejected: ${result.error}`);
  return result.state;
}

function freshLoadout(): RunState {
  return setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG });
}

/** setupRun deals no offers, so this opens the draft after camp 2 with each
 * seat's real private offer (p0 with a second one queued), which Canaries F
 * and F2 need to prove another seat's offer is detected. */
function realDraft(): RunState {
  const base = setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG, camp: 2 });
  const offers = (seat: RunState["seats"][number]) =>
    [draftOfferFor(SEED, campIndex(2), seat, 0, CATALOG), ...(seat.seatId === "p0" ? [draftOfferFor(SEED, campIndex(2), seat, 1, CATALOG)] : [])];
  return {
    ...base,
    seats: base.seats.map((seat) => ({ ...seat, offers: offers(seat) })),
    stage: { tag: "draft", cleared: campIndex(2), payout: 5 },
  };
}

function musterRun(): RunState {
  return createRun({ seatIds: SEAT_IDS, seed: SEED });
}

/** p0 has used a Whetstone: an owner-audience effect naming one of p0's cards. */
function afterWhetstone(): RunState {
  const start = advanceTo(
    setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG, items: { p0: ["whetstone"] } }),
    "between-tricks",
    CATALOG,
  );
  const step = toExpeditionPlayerView(start, "p0", CATALOG).yourAbilities.find((a) => a.sourceKey === "it0")!.steps[0]!;
  const result = applyRunAction(start, "p0", { type: "use-ability", sourceKey: "it0", targets: [step.choices[0]!] }, CATALOG);
  if (!result.ok) throw new Error(`afterWhetstone: ${result.error}`);
  return result.state;
}

describe("view-leak-check: clean baseline", () => {
  it("reports no leaks for a real toExpeditionPlayerView on every seat and an unseated viewer, across several run shapes", () => {
    let checked = 0;
    const states: RunState[] = [musterRun(), dealtFaceUpCamp(), postWhisperState(), afterWhetstone(), freshLoadout(), realDraft()];

    for (const state of states) {
      for (const seatId of [...state.seatIds, "unseated-viewer"]) {
        const view = toExpeditionPlayerView(state, seatId, CATALOG);
        const secrets = secretsForExpeditionSeat(state, seatId, CATALOG, SEED);
        const reasons = checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
        expect(reasons).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("view-leak-check: cards that count as others", () => {
  it("allows your own hand's counted-as identities and a resolved trick's, and nothing more", () => {
    const spadesAsHearts = defineItem({
      id: "spades-as-hearts",
      name: "Spades as hearts",
      rarity: "common",
      price: 2,
      text: "Spades count as hearts.",
      passive: { modifier: () => ({ identityOf: (prev) => (card) => (card.identity.kind === "standard" && card.identity.suit === "spades" ? { ...card.identity, suit: "hearts" } : prev(card)) }) },
    });
    const catalog = testCatalog({ characters: CATALOG.characters, items: { ...CATALOG.items, "spades-as-hearts": spadesAsHearts } });
    let state = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog, items: { p2: ["spades-as-hearts"] } }), "between-tricks", catalog);
    for (let i = 0; i < SEAT_IDS.length; i++) {
      const rules = rulesFor(state, catalog);
      const actor = currentActorSeatId(attemptOf(state)!.camp, rules)!;
      const played = applyRunAction(state, actor, { type: "play-card", cardId: rules.legalPlays(attemptOf(state)!.camp, actor)[0]!.id }, catalog);
      if (!played.ok) throw new Error(played.error);
      state = played.state;
    }
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, catalog);
    expect(attemptViewOf(view).camp.yourHand.some((c) => c.countsAs !== null)).toBe(true);
    const secrets = secretsForExpeditionSeat(state, viewer, catalog, SEED);
    expect(checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets })).toEqual([]);

    const leaky = structuredClone(view);
    const hidden = attemptOf(state)!.camp.hands.find((h) => h.seatId !== viewer)!.cards[0]!;
    attemptViewOf(leaky).camp.yourHand[0]!.countsAs = hidden.identity as never;
    expect(checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets })).toContain(
      `typed:identity-count-exceeded:${hidden.identity.kind === "joker" ? `joker:${hidden.identity.joker}` : `standard:${hidden.identity.suit}:${hidden.identity.rank}`}`,
    );
  });
});

describe("view-leak-check: canary suite", () => {
  it("Canary A: another seat's card inserted into camp.yourHand", () => {
    const state = dealtFaceUpCamp();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const otherHand = attemptOf(state)!.camp.hands.find((h) => h.seatId !== viewer)!;
    const otherCard = otherHand.cards[0]!;

    const leaky = structuredClone(view);
    attemptViewOf(leaky).camp.yourHand.push({ id: otherCard.id, identity: otherCard.identity as never, effectiveRank: null, countsAs: null });

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`structural:hidden-id:${otherCard.id}`);
    expect(reasons.some((r) => r.startsWith("typed:identity-count-exceeded:"))).toBe(true);
  });

  it("Canary B: a top-level seed key, camp.objectiveDeck, and a log entry's audience key each report their own forbidden-key reason", () => {
    const state = dealtFaceUpCamp();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const withSeed = { ...structuredClone(view), seed: "leaked" };
    expect(
      checkExpeditionViewForLeaks({ view: withSeed, serialized: JSON.stringify(withSeed), secrets }),
    ).toContain("structural:forbidden-key:seed");

    const withObjectiveDeck = structuredClone(view);
    (attemptViewOf(withObjectiveDeck).camp as unknown as Record<string, unknown>).objectiveDeck = [];
    expect(
      checkExpeditionViewForLeaks({
        view: withObjectiveDeck,
        serialized: JSON.stringify(withObjectiveDeck),
        secrets,
      }),
    ).toContain("structural:forbidden-key:objectiveDeck");

    const whisperState = postWhisperState();
    const whisperViewer = "p0";
    const whisperView = toExpeditionPlayerView(whisperState, whisperViewer, CATALOG);
    const whisperSecrets = secretsForExpeditionSeat(whisperState, whisperViewer, CATALOG, SEED);
    const withAudience = structuredClone(whisperView);
    expect(attemptViewOf(withAudience).log.length).toBeGreaterThan(0);
    (attemptViewOf(withAudience).log[0] as unknown as Record<string, unknown>).audience = "public";
    expect(
      checkExpeditionViewForLeaks({
        view: withAudience,
        serialized: JSON.stringify(withAudience),
        secrets: whisperSecrets,
      }),
    ).toContain("structural:forbidden-key:audience");
  });

  it("Canary B2: a ledger key on a seat is flagged as a forbidden key", () => {
    const state = dealtFaceUpCamp();
    const view = toExpeditionPlayerView(state, "p0", CATALOG);
    const secrets = secretsForExpeditionSeat(state, "p0", CATALOG, SEED);

    const leaky = structuredClone(view);
    (leaky.seats[1] as unknown as Record<string, unknown>).ledger = [{ kind: "used", sourceKey: "explorer" }];

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:forbidden-key:ledger");
  });

  it("Canary B3: a seat's offers and the run's itemSerial are each flagged as forbidden keys", () => {
    const state = realDraft();
    const view = toExpeditionPlayerView(state, "p0", CATALOG);
    const secrets = secretsForExpeditionSeat(state, "p0", CATALOG, SEED);

    const leaky = structuredClone(view) as unknown as Record<string, unknown> & { seats: Record<string, unknown>[] };
    leaky.seats[0]!.offers = [];
    leaky.itemSerial = state.itemSerial;

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toEqual(expect.arrayContaining(["structural:forbidden-key:offers", "structural:forbidden-key:itemSerial"]));
  });

  it("Canary C: the 32-hex seed embedded inside a log entry's event string", () => {
    const state = postWhisperState();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const leaky = structuredClone(view);
    expect(attemptViewOf(leaky).log.length).toBeGreaterThan(0);
    attemptViewOf(leaky).log[0]!.event = `whisper-${SEED}`;

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("string:forbidden-token");
  });

  it("Canary E: the view of a seat NOT in the reveal audience, with the reveal appended, reports identity-count-exceeded and hidden-id", () => {
    const state = postWhisperState();
    const reveal = attemptOf(state)!.reveals[0]!;
    const outsider = state.seatIds.find((id) => !reveal.audience.includes(id) && id !== reveal.fromSeatId)!;
    expect(outsider).toBeDefined();

    const view = toExpeditionPlayerView(state, outsider, CATALOG);
    const secrets = secretsForExpeditionSeat(state, outsider, CATALOG, SEED);
    // Premise: the reveal is genuinely absent from the outsider's clean view.
    expect(attemptViewOf(view).reveals).toEqual([]);

    const camp = attemptOf(state)!.camp;
    const card = camp.hands.flatMap((h) => h.cards).find((c) => c.id === reveal.cardId)!;

    const leaky = structuredClone(view);
    attemptViewOf(leaky).reveals.push({
      cardId: reveal.cardId,
      fromSeatId: reveal.fromSeatId,
      source: reveal.source,
      identity: card.identity as never,
      toSeatId: null,
    });

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`structural:hidden-id:${reveal.cardId}`);
    expect(reasons.some((r) => r.startsWith("typed:identity-count-exceeded:"))).toBe(true);
  });

  it("Canary F: the draft stage's yourOffer replaced with another seat's offer", () => {
    const state = realDraft();
    const viewer = "p0";
    const other = state.seats.find((s) => s.seatId !== viewer)!;
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const leaky = structuredClone(view);
    if (leaky.stage.tag !== "draft") throw new Error("expected the draft stage");
    leaky.stage.yourOffer = { kind: "standard", bundles: other.offers[0]!.bundles.map((b) => [...b]) };

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toEqual(expect.arrayContaining(["structural:draft-offer-mismatch", "structural:foreign-offer"]));
  });

  it("Canary F2: another seat's bundles anywhere in the view are a leak, its queued offer included", () => {
    const state = realDraft();
    const view = toExpeditionPlayerView(state, "p1", CATALOG);
    const secrets = secretsForExpeditionSeat(state, "p1", CATALOG, SEED);
    const p0 = state.seats[0]!;

    for (const offer of p0.offers) {
      const leaky = structuredClone(view) as unknown as Record<string, unknown>;
      leaky.hint = offer.bundles.map((b) => [...b]);
      expect(checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets })).toEqual(["structural:foreign-offer"]);
    }
  });

  it("Canary G: a private log entry addressed to a different seat, appended", () => {
    const state = postWhisperState();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const leaky = structuredClone(view);
    attemptViewOf(leaky).log.push({
      event: "secret-event",
      actorSeatId: "p1",
      subjectSeatIds: ["p2"],
      sourceId: null,
      private: true,
    });

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:log-entry-count");
  });

  it("Canary H: a handSizes entry for another seat carrying cards: [otherCard] is flagged (hidden-id and identity excess)", () => {
    const state = dealtFaceUpCamp();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const otherHand = attemptOf(state)!.camp.hands.find((h) => h.seatId !== viewer)!;
    const otherCard = otherHand.cards[0]!;

    const leaky = structuredClone(view);
    const entry = attemptViewOf(leaky).camp.handSizes.find((h) => h.seatId === otherHand.seatId)! as unknown as Record<
      string,
      unknown
    >;
    entry.cards = [{ id: otherCard.id, identity: otherCard.identity }];

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`structural:hidden-id:${otherCard.id}`);
    expect(reasons.some((r) => r.startsWith("typed:identity-count-exceeded:"))).toBe(true);
  });

  it("Canary I: another seat's card id inside a prefixed target choice id is flagged", () => {
    const state = dealtFaceUpCamp();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);
    const otherCard = attemptOf(state)!.camp.hands.find((h) => h.seatId !== viewer)!.cards[0]!;

    const leaky = { ...view, steps: [{ kind: "card", prompt: "", choices: [`card:${otherCard.id}`, `value:${otherCard.id}:5`] }] };

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toEqual([`structural:hidden-id:${otherCard.id}`]);
  });
});

describe("view-leak-check: concealment canaries", () => {
  /** Camp 2's loadout at `location` in `weather`. */
  function loadoutAt(location: string, weather: string, items: Record<string, readonly string[]> = {}): RunState {
    const run = setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG, camp: 2, items });
    if (run.stage.tag !== "loadout") throw new Error("expected a loadout");
    return { ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location, weather } } };
  }

  function leaks(state: RunState, seatId: string, view: unknown): string[] {
    return checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets: secretsForExpeditionSeat(state, seatId, CATALOG, SEED) });
  }

  /** A Cave camp with the leader's card on the table, and a seat that sees it face down. */
  function caveLead(): { state: RunState; viewer: string; card: { id: string; identity: CardIdentity } } {
    const between = advanceTo(loadoutAt("cave", "fair"), "between-tricks", CATALOG);
    const camp = attemptOf(between)!.camp;
    const rules = rulesFor(between, CATALOG);
    const leader = currentActorSeatId(camp, rules)!;
    const card = rules.legalPlays(camp, leader)[0]!;
    const result = applyRunAction(between, leader, { type: "play-card", cardId: card.id }, CATALOG);
    if (!result.ok) throw new Error(result.error);
    return { state: result.state, viewer: SEAT_IDS.find((s) => s !== leader)!, card };
  }

  const key = (identity: CardIdentity) => (identity.kind === "joker" ? `joker:${identity.joker}` : `standard:${identity.suit}:${identity.rank}`);

  it("Canary J: a face-down play shown face up is flagged by its id and its identity", () => {
    const { state, viewer, card } = caveLead();
    const clean = toExpeditionPlayerView(state, viewer, CATALOG);
    expect(leaks(state, viewer, clean)).toEqual([]);
    const tampered = structuredClone(clean);
    const trick = attemptViewOf(tampered).camp.currentTrick;
    trick.plays = [{ seatId: trick.plays[0]!.seatId, hidden: false, card: { id: card.id, identity: card.identity }, effectiveRank: null, countsAs: null }];
    expect(leaks(state, viewer, tampered)).toEqual([`structural:hidden-id:${card.id}`, `typed:identity-count-exceeded:${key(card.identity)}`]);
  });

  it("Canary M: a public effect naming a face-down card is flagged", () => {
    const { state, viewer, card } = caveLead();
    const tampered = structuredClone(toExpeditionPlayerView(state, viewer, CATALOG));
    attemptViewOf(tampered).effects.push({ origin: { kind: "seat", seatId: "p0", sourceId: "bait" }, atTrick: 0, lasts: "trick", params: { cardId: card.id } });
    expect(leaks(state, viewer, tampered)).toEqual([`structural:hidden-id:${card.id}`]);
  });

  it("Canary K: the mirage's objective shown with its target is flagged", () => {
    const state = advanceTo(loadoutAt("desert", "fair"), "objective-pick", CATALOG);
    const clean = toExpeditionPlayerView(state, "p1", CATALOG);
    expect(leaks(state, "p1", clean)).toEqual([]);
    const objectives = attemptViewOf(clean).camp.objectives;
    const at = objectives.findIndex((o) => o.kind === "hidden");
    const real = attemptOf(state)!.camp.objectives[at]!;
    if (real.kind !== "win-card") throw new Error(`expected a win-card objective under the mirage, got ${real.kind}`);
    const tampered = structuredClone(clean);
    attemptViewOf(tampered).camp.objectives[at] = { id: real.id, kind: "win-card", target: real.target, ownerSeatId: null, status: "pending" };
    expect(leaks(state, "p1", tampered)).toEqual([`typed:identity-count-exceeded:${key(real.target)}`]);
  });

  it("Canary K2: the mirage's objective shown after another objective is dropped is flagged", () => {
    const loadout = setupRun({ seatIds: SEAT_IDS, seed: "mir5", catalog: CATALOG, camp: 2, characters: { p0: "hermit", p1: "jd", p2: "explorer" } });
    if (loadout.stage.tag !== "loadout") throw new Error("expected a loadout");
    const between = advanceTo({ ...loadout, stage: { ...loadout.stage, camp: { ...loadout.stage.camp, location: "desert", weather: "fair" } } }, "between-tricks", CATALOG);
    const mirage = attemptViewOf(toExpeditionPlayerView(between, "p1", CATALOG)).camp.objectives.find((o) => o.kind === "hidden")!.id;
    const camp = attemptOf(between)!.camp;
    const dropped = camp.objectives.find((o) => o.ownerSeatId === "p0" && o.id !== mirage)!;
    const result = applyRunAction(between, "p0", { type: "use-ability", sourceKey: "hermit", targets: [`objective:${dropped.id}`] }, CATALOG);
    if (!result.ok) throw new Error(result.error);
    const state = result.state;

    const real = camp.objectives.find((o) => o.id === mirage)!;
    if (real.kind !== "win-card") throw new Error(`expected a win-card objective under the mirage, got ${real.kind}`);
    const tampered = structuredClone(toExpeditionPlayerView(state, "p1", CATALOG));
    const objectives = attemptViewOf(tampered).camp.objectives;
    objectives[objectives.findIndex((o) => o.id === mirage)] = { id: real.id, kind: "win-card", target: real.target, ownerSeatId: real.ownerSeatId, status: "pending" };
    expect(leaks(state, "p1", tampered)).toEqual([`typed:identity-count-exceeded:${key(real.target)}`]);
  });

  it("Canary K3: a mirage hook that hides the wrong objective is caught on the real view", () => {
    const state = advanceTo(loadoutAt("desert", "fair"), "objective-pick", CATALOG);
    const camp = attemptOf(state)!.camp;
    const mirage = attemptOf(state)!.effects.find((e) => e.origin.kind === "mod" && e.origin.modId === "desert")!.params.objectiveId;
    const wrong = camp.objectives.find((o) => o.id !== mirage)!;
    const real = camp.objectives.find((o) => o.id === mirage)!;
    if (real.kind !== "win-card") throw new Error(`expected a win-card objective under the mirage, got ${real.kind}`);
    const desert = CATALOG.mods.desert!;
    const misplaced: Catalog = {
      ...CATALOG,
      mods: {
        ...CATALOG.mods,
        desert: { ...desert, full: { ...desert.full, effect: () => ({ hides: (prev) => (run, viewer, subject) => prev(run, viewer, subject) || (subject.kind === "objective" && subject.objectiveId === wrong.id) }) } },
      },
    };
    const view = toExpeditionPlayerView(state, "p1", misplaced);
    const found = checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets: secretsForExpeditionSeat(state, "p1", misplaced, SEED) });
    expect(found).toContain(`typed:identity-count-exceeded:${key(real.target)}`);
  });

  it("Canary L: under fog another seat's backpack or unused item is flagged", () => {
    const state = loadoutAt("jungle", "fog", { p0: ["bait", "parrot", "whetstone"] });
    const clean = toExpeditionPlayerView(state, "p1", CATALOG);
    expect(leaks(state, "p1", clean)).toEqual([]);
    const p0 = state.seats[0]!;

    const backpack = structuredClone(clean);
    backpack.seats[0]!.items.backpack = [];
    expect(leaks(state, "p1", backpack)).toEqual(["structural:fogged-backpack"]);

    const equipped = structuredClone(clean);
    const uid = p0.equipped[0]!;
    equipped.seats[0]!.items.equipped = [{ uid, itemId: "bait", remaining: { kind: "uses", left: 1, of: 1 } }];
    expect(leaks(state, "p1", equipped)).toEqual([`structural:hidden-id:${uid}`]);
  });
});
