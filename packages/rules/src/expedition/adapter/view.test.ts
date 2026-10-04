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
import { createRun } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
import { ability, defineItem } from "../content/source-def";
import { advanceTo, enumerateLegalRunActions, setupRun, testCatalog } from "../run/run-test-support";
import { CATALOG } from "../run/catalog";
import type { CampNumber, RunState } from "../run/types";
import type { CampState } from "../state";
import { toExpeditionPlayerView } from "./view";
import type { ExpeditionView } from "./view-types";

const SEATS = ["p0", "p1", "p2"] as const;

describe("toExpeditionPlayerView", () => {
  it("muster: runPhase is muster, every seat has no character, and the view carries no attempt", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const run = createRun({ seatIds: [...SEATS], seed });

    const view = toExpeditionPlayerView(run, "p0", CATALOG);

    expect(view.runPhase).toBe("muster");
    expect(view.seats).toEqual(
      SEATS.map((seatId) => ({ seatId, characterId: null, kit: [], ready: false, draftPending: false, pool: null, usage: [] })),
    );
    expect(view.yourAbilities).toEqual([]);
    expect(view.yourDraftOffer).toBeNull();
    expect(view.attempt).toBeNull();
    expect(JSON.stringify(view).includes(seed)).toBe(false);
  });

  it("fireside: own draft offer only, every offered seat's draftPending true, no attempt, seed absent from JSON", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const base = setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG, campNumber: 2, characters: { p0: "scout" } });
    const offer = draftOfferFor(seed, 2, base.seats[0]!, CATALOG)!;
    const run: RunState = { ...base, seats: base.seats.map((s) => (s.seatId === "p0" ? { ...s, draftOffer: offer } : s)) };

    const own = toExpeditionPlayerView(run, "p0", CATALOG);
    const other = toExpeditionPlayerView(run, "p1", CATALOG);

    expect(own.runPhase).toBe("fireside");
    expect(own.yourDraftOffer).toEqual(offer);
    expect(offer).toHaveLength(3);
    expect(["scout.keen-eye", "scout.eavesdrop"]).toContain(offer[0]);
    expect(other.yourDraftOffer).toBeNull();
    expect(other.seats.map((s) => s.draftPending)).toEqual([true, false, false]);
    expect(own.attempt).toBeNull();
    expect(JSON.stringify(own).includes(seed)).toBe(false);
    for (const seat of other.seats) expect(Object.keys(seat).sort()).toEqual(["characterId", "draftPending", "kit", "pool", "ready", "seatId", "usage"]);
  });

  it("seats[] carry each seat's public character, kit, pool and usage", () => {
    const run = setupRun({
      seatIds: [...SEATS],
      seed: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      catalog: CATALOG,
      characters: { p0: "botanist", p1: "scout", p2: "signaller" },
      kits: { p0: ["botanist.greenhouse", "rain-poncho"] },
    });

    const seats = toExpeditionPlayerView(run, "p1", CATALOG).seats;

    expect(seats[0]).toEqual({
      seatId: "p0",
      characterId: "botanist",
      kit: ["botanist.greenhouse", "rain-poncho"],
      ready: false,
      draftPending: false,
      pool: { balance: 2, max: 3 },
      usage: [
        { sourceId: "botanist", remaining: { kind: "pool", balance: 2, max: 3, cost: 1 } },
        { sourceId: "rain-poncho", remaining: { kind: "uses", left: 2, of: 2 } },
      ],
    });
    expect(seats[1]).toMatchObject({ characterId: "scout", kit: [], pool: null, usage: [{ sourceId: "scout", remaining: { kind: "uses", left: 1, of: 1 } }] });
    expect(seats[2]).toMatchObject({ characterId: "signaller", pool: null, usage: [] });
  });

  it("dealt face-up camp: own hand full identity, correct handSizes, objectives carry status, no other seat's card id leaks", () => {
    const seed = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "objective-pick", CATALOG);
    const camp = run.attempt!.camp;

    const view = toExpeditionPlayerView(run, "p0", CATALOG);
    const campView = view.attempt!.camp;

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
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed: "cccccccccccccccccccccccccccccccc", catalog: CATALOG, campNumber: 3 as CampNumber }), "objective-pick", CATALOG);
    const ids = run.attempt!.camp.objectives.map((o) => o.id);
    expect(ids).toHaveLength(3);
    for (const viewer of ["p0", "p1", "spectator"]) {
      expect(toExpeditionPlayerView(run, viewer, CATALOG).attempt!.camp.objectives.map((o) => o.id)).toEqual(ids);
    }
  });

  it("Whisper: only the addressed seat and the sender get the reveal; the public log entry carries no audience key", () => {
    const seed = "dddddddddddddddddddddddddddddddd";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp0 = setup.attempt!.camp;
    const cardId = camp0.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const result = applyRunAction(setup, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const run = result.state;

    const viewA = toExpeditionPlayerView(run, "p0", CATALOG);
    const viewB = toExpeditionPlayerView(run, "p1", CATALOG);
    const viewC = toExpeditionPlayerView(run, "p2", CATALOG);

    expect(viewB.attempt!.reveals).toHaveLength(1);
    expect(viewB.attempt!.reveals[0]!.cardId).toBe(cardId);
    expect(viewB.attempt!.reveals[0]!.fromSeatId).toBe("p0");
    expect(viewB.attempt!.reveals[0]!.toSeatId).toBe("p1");
    expect(viewA.attempt!.reveals.map((r) => ({ cardId: r.cardId, from: r.fromSeatId, to: r.toSeatId, source: r.source }))).toEqual([
      { cardId, from: "p0", to: "p1", source: "whisper" },
    ]);
    expect(viewC.attempt!.reveals).toEqual([]);

    for (const view of [viewA, viewB, viewC]) {
      const whisperEntry = view.attempt!.log.find((e) => e.event === "whisper")!;
      expect(whisperEntry.private).toBe(false);
      expect(Object.keys(whisperEntry).sort()).toEqual(
        ["actorSeatId", "event", "private", "sourceId", "subjectSeatIds"].sort(),
      );
    }
  });

  it("WR-03: a reveal keeps its recorded fromSeatId after the revealed card is moved to a third seat's hand", () => {
    const seed = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp0 = setup.attempt!.camp;
    const cardId = camp0.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const whispered = applyRunAction(setup, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    expect(whispered.ok).toBe(true);
    if (!whispered.ok) return;
    const run = whispered.state;
    const camp = run.attempt!.camp;

    const movedCard = camp.hands.find((h) => h.seatId === "p0")!.cards.find((c) => c.id === cardId)!;
    const movedCamp: CampState = {
      ...camp,
      hands: camp.hands.map((h) => {
        if (h.seatId === "p0") return { seatId: h.seatId, cards: h.cards.filter((c) => c.id !== cardId) };
        if (h.seatId === "p2") return { seatId: h.seatId, cards: [...h.cards, movedCard] };
        return h;
      }),
    };
    const movedRun: RunState = { ...run, attempt: { ...run.attempt!, camp: movedCamp } };

    const viewB = toExpeditionPlayerView(movedRun, "p1", CATALOG);
    expect(viewB.attempt!.reveals).toHaveLength(1);
    expect(viewB.attempt!.reveals[0]!.fromSeatId).toBe("p0");
    expect(viewB.attempt!.reveals[0]!.cardId).toBe(cardId);
  });

  it("unseated viewer: fail-closed defaults across every field", () => {
    const seed = "ffffffffffffffffffffffffffffffff";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);

    const view = toExpeditionPlayerView(run, "ghost", CATALOG);

    expect(view.yourSeatId).toBeNull();
    expect(view.yourDraftOffer).toBeNull();
    expect(view.yourAbilities).toEqual([]);
    expect(view.attempt!.camp.yourHand).toEqual([]);
    expect(view.attempt!.camp.yourLegalCardIds).toEqual([]);
    expect(view.attempt!.reveals).toEqual([]);
    for (const entry of view.attempt!.log) {
      expect(entry.private).toBe(false);
    }
  });

  it("yourLegalCardIds is non-empty only for the current actor while playing, and every id belongs to their own hand", () => {
    const seed = "01234567890123456789012345678901";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp = run.attempt!.camp;
    const actor = currentActorSeatId(camp, rulesFor(run, CATALOG))!;

    const actorView = toExpeditionPlayerView(run, actor, CATALOG);
    expect(actorView.attempt!.camp.campPhase).toBe("playing");
    expect(actorView.attempt!.camp.yourLegalCardIds.length).toBeGreaterThan(0);
    const ownHandIds = camp.hands.find((h) => h.seatId === actor)!.cards.map((c) => c.id);
    for (const id of actorView.attempt!.camp.yourLegalCardIds) {
      expect(ownHandIds).toContain(id);
    }

    const nonActor = SEATS.find((s) => s !== actor)!;
    const otherView = toExpeditionPlayerView(run, nonActor, CATALOG);
    expect(otherView.attempt!.camp.yourLegalCardIds).toEqual([]);
  });

  it("yourWhisper: one whisper allowed per camp, spent after sending, null when unseated", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const cardId = setup.attempt!.camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    expect(toExpeditionPlayerView(setup, "p0", CATALOG).attempt!.yourWhisper).toEqual({ allowed: true, left: 1 });

    const sent = applyRunAction(setup, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    if (!sent.ok) throw new Error(sent.error);
    expect(toExpeditionPlayerView(sent.state, "p0", CATALOG).attempt!.yourWhisper).toEqual({ allowed: true, left: 0 });
    expect(toExpeditionPlayerView(sent.state, "p1", CATALOG).attempt!.yourWhisper).toEqual({ allowed: true, left: 1 });
    expect(toExpeditionPlayerView(sent.state, "watcher", CATALOG).attempt!.yourWhisper).toBeNull();
  });

  it("yourWhisper: a Rain Poncho gives only its owner one more whisper this camp", () => {
    const seed = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG, campNumber: 3, kits: { p0: ["rain-poncho"] } }), "between-tricks", CATALOG);
    const used = applyRunAction(run, "p0", { type: "use-ability", sourceId: "rain-poncho", targets: [] }, CATALOG);
    if (!used.ok) throw new Error(used.error);
    expect(toExpeditionPlayerView(used.state, "p0", CATALOG).attempt!.yourWhisper).toEqual({ allowed: true, left: 2 });
    expect(toExpeditionPlayerView(used.state, "p1", CATALOG).attempt!.yourWhisper).toEqual({ allowed: true, left: 1 });
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
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, characters: { p0: "scout", p1: "signaller" }, kits: { p0: ["rope-ladder"] } }),
      "between-tricks",
      CATALOG,
    );

    const abilities = toExpeditionPlayerView(run, "p0", CATALOG).yourAbilities;

    expect(abilities.map((a) => a.sourceId)).toEqual(["scout", "rope-ladder"]);
    const [scout, ladder] = abilities;
    expect(scout).toEqual({
      sourceId: "scout",
      usableNow: true,
      reason: null,
      steps: [{ kind: "hand", prompt: "Pick a teammate's hand", choices: ["hand:p1", "hand:p2"] }],
    });
    expect(ladder).toEqual({ sourceId: "rope-ladder", usableNow: false, reason: "Usable when an objective fails", steps: [] });
    expect(toExpeditionPlayerView(run, "p1", CATALOG).yourAbilities).toEqual([]);
  });

  it("yourAbilities: a spent ability reports why it cannot be used", () => {
    const start = advanceTo(
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, characters: { p0: "scout" } }),
      "between-tricks",
      CATALOG,
    );
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceId: "scout", targets: ["hand:p1"] }, CATALOG);
    if (!used.ok) throw new Error(used.error);

    const view = toExpeditionPlayerView(used.state, "p0", CATALOG);

    expect(view.yourAbilities).toEqual([{ sourceId: "scout", usableNow: false, reason: "Already used", steps: [] }]);
    expect(view.seats[0]!.usage).toEqual([{ sourceId: "scout", remaining: { kind: "uses", left: 0, of: 1 } }]);
    expect(view.attempt!.reveals.map((r) => r.source)).toEqual(["scout"]);
  });

  it("effect params: shown to the owner of an owner-audience effect, null for everyone else; public params shown to all", () => {
    const start = advanceTo(
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, kits: { p0: ["whetstone"], p1: ["rain-poncho"] } }),
      "between-tricks",
      CATALOG,
    );
    const step = toExpeditionPlayerView(start, "p0", CATALOG).yourAbilities.find((a) => a.sourceId === "whetstone")!.steps[0]!;
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceId: "whetstone", targets: [step.choices[0]!] }, CATALOG);
    if (!used.ok) throw new Error(used.error);

    const ownerEffect = toExpeditionPlayerView(used.state, "p0", CATALOG).attempt!.effects[0]!;
    const otherEffect = toExpeditionPlayerView(used.state, "p1", CATALOG).attempt!.effects[0]!;
    const spectatorEffect = toExpeditionPlayerView(used.state, "ghost", CATALOG).attempt!.effects[0]!;

    expect(ownerEffect).toMatchObject({ sourceId: "whetstone", seatId: "p0", lasts: "attempt" });
    expect(Object.keys(ownerEffect.params!).sort()).toEqual(["cardId", "rank"]);
    expect(otherEffect).toEqual({ sourceId: "whetstone", seatId: "p0", atTrick: 0, lasts: "attempt", params: null });
    expect(spectatorEffect.params).toBeNull();

    const publicCatalog = testCatalog({
      items: {
        flag: defineItem({
          id: "flag",
          name: "Flag",
          text: "Nothing happens.",
          active: ability({
            window: "between-tricks",
            limit: { kind: "per-camp", times: 1 },
            targets: [],
            apply: () => [{ op: "add-modifier", lasts: "attempt", params: { colour: "red", n: 2 }, audience: "public" }],
            effect: () => ({}),
          }),
        }),
      },
    });
    const flagged = applyRunAction(
      advanceTo(setupRun({ seatIds: [...SEATS], seed: SEED, catalog: publicCatalog, kits: { p0: ["flag"] } }), "between-tricks", publicCatalog),
      "p0",
      { type: "use-ability", sourceId: "flag", targets: [] },
      publicCatalog,
    );
    if (!flagged.ok) throw new Error(flagged.error);
    expect(toExpeditionPlayerView(flagged.state, "p2", publicCatalog).attempt!.effects[0]!.params).toEqual({ colour: "red", n: 2 });
  });

  it("effectiveRank is set only on the card whose rank the composed rankOf changed", () => {
    const start = advanceTo(
      setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG, kits: { p0: ["whetstone"] } }),
      "between-tricks",
      CATALOG,
    );
    const before = toExpeditionPlayerView(start, "p0", CATALOG).attempt!.camp.yourHand;
    expect(before.every((card) => card.effectiveRank === null)).toBe(true);

    const step = toExpeditionPlayerView(start, "p0", CATALOG).yourAbilities.find((a) => a.sourceId === "whetstone")!.steps[0]!;
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceId: "whetstone", targets: [step.choices[0]!] }, CATALOG);
    if (!used.ok) throw new Error(used.error);

    const view = toExpeditionPlayerView(used.state, "p0", CATALOG);
    const params = view.attempt!.effects[0]!.params as { cardId: string; rank: number };
    const changed = view.attempt!.camp.yourHand.filter((card) => card.effectiveRank !== null);
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
          text: "Nothing happens.",
          active: ability({
            window: "between-tricks",
            limit: { kind: "per-camp", times: 1 },
            targets: [],
            apply: () => [{ op: "add-modifier", lasts: "attempt", params: {}, audience: "public" }],
            effect: () => ({ rankOf: (prev) => (card) => (card.identity.kind === "standard" ? prev(card) + 1 : prev(card)) }),
          }),
        }),
      },
    });
    const start = advanceTo(setupRun({ seatIds: [...SEATS], seed: SEED, catalog: boostCatalog, kits: { p0: ["boost"] } }), "between-tricks", boostCatalog);
    const used = applyRunAction(start, "p0", { type: "use-ability", sourceId: "boost", targets: [] }, boostCatalog);
    if (!used.ok) throw new Error(used.error);
    const camp = used.state.attempt!.camp;
    const rules = rulesFor(used.state, boostCatalog);
    const actor = currentActorSeatId(camp, rules)!;
    const standard = rules.legalPlays(camp, actor).find((card) => card.identity.kind === "standard")!;
    const played = applyRunAction(used.state, actor, { type: "play-card", cardId: standard.id }, boostCatalog);
    if (!played.ok) throw new Error(played.error);

    const play = toExpeditionPlayerView(played.state, "p0", boostCatalog).attempt!.camp.currentTrick.plays[0]!;

    expect(play.card.id).toBe(standard.id);
    expect(standard.identity.kind === "standard" && play.effectiveRank).toBe(standard.identity.kind === "standard" ? standard.identity.rank + 1 : null);
  });

  /** Plays pick-objective and play-card only, through the real dispatcher,
   * until some seat's view shows the rescue window. */
  function walkToRescue(): RunState {
    for (let attempt = 0; attempt < 60; attempt++) {
      let state = setupRun({ seatIds: [...SEATS], seed: `${SEED}${attempt}`.slice(-32), catalog: CATALOG, characters: { p0: "medic" } });
      state = advanceTo(state, "objective-pick", CATALOG);
      for (let step = 0; step < 200; step++) {
        const view = toExpeditionPlayerView(state, "p0", CATALOG);
        if (view.attempt === null) break;
        if (view.attempt.window === "rescue") return state;
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

    expect(view.runPhase).toBe("camp");
    expect(view.attempt!.window).toBe("rescue");
    expect(view.attempt!.pendingSeatIds).toEqual(["p0"]);
    const rescue = view.attempt!.rescue!;
    expect(rescue.failedObjectiveIds.length).toBeGreaterThan(0);
    for (const id of rescue.failedObjectiveIds) {
      expect(view.attempt!.camp.objectives.find((o) => o.id === id)!.status).toBe("failed");
    }
    expect(view.yourAbilities.find((a) => a.sourceId === "medic")!.usableNow).toBe(true);

    const between = advanceTo(setupRun({ seatIds: [...SEATS], seed: SEED, catalog: CATALOG }), "between-tricks", CATALOG);
    expect(toExpeditionPlayerView(between, "p0", CATALOG).attempt!.rescue).toBeNull();
  });
});
