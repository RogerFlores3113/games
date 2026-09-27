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
import { createRun } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { CATALOG } from "../run/catalog";
import type { CampNumber, RunState } from "../run/types";
import type { CampState } from "../state";
import { toExpeditionPlayerView } from "./view";

const SEATS = ["p0", "p1", "p2"] as const;

describe("toExpeditionPlayerView", () => {
  it("fireside: own draft offer, every seat's draftPending true, no attempt, seed absent from JSON", () => {
    const seed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const run = createRun({ seatIds: [...SEATS], seed }, CATALOG);

    const view = toExpeditionPlayerView(run, "p0", CATALOG);

    const ownSeat = run.seats.find((s) => s.seatId === "p0")!;
    expect(view.yourDraftOffer).toEqual([...ownSeat.draftOffer!]);
    expect(view.seats).toHaveLength(SEATS.length);
    for (const seat of view.seats) {
      expect(Object.keys(seat).sort()).toEqual(["draftPending", "equippedGearIds", "ready", "seatId"].sort());
      expect(seat.draftPending).toBe(true);
    }
    expect(view.attempt).toBeNull();
    expect(JSON.stringify(view).includes(seed)).toBe(false);
  });

  it("dealt face-up camp: own hand full identity, correct handSizes, objectives carry status, no other seat's card id leaks", () => {
    const seed = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "objective-pick", CATALOG);
    const camp = run.attempt!.camp!;

    const view = toExpeditionPlayerView(run, "p0", CATALOG);
    const campView = view.attempt!.camp!;

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

  it("Thick Fog: objectiveAssignment is face-down, a viewer sees only its own objectives, an unseated viewer sees none", () => {
    const seed = "cccccccccccccccccccccccccccccccc";
    const run = advanceTo(
      setupRun({
        seatIds: [...SEATS],
        seed,
        catalog: CATALOG,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "blind-orders", 6: null },
      }),
      "objective-pick",
      CATALOG,
    );

    const view = toExpeditionPlayerView(run, "p0", CATALOG);
    const campView = view.attempt!.camp!;
    expect(campView.objectiveAssignment).toBe("face-down");
    for (const objective of campView.objectives) {
      expect(objective.ownerSeatId).toBe("p0");
    }

    const otherObjectiveIds = run.attempt!.camp!.objectives.filter((o) => o.ownerSeatId !== "p0").map((o) => o.id);
    const json = JSON.stringify(view);
    for (const id of otherObjectiveIds) {
      expect(json.includes(id)).toBe(false);
    }

    const spectatorView = toExpeditionPlayerView(run, "spectator", CATALOG);
    expect(spectatorView.attempt!.camp!.objectives).toEqual([]);
  });

  it("Whisper: only the addressed seat's view gets the reveal; the public log entry carries no audience key", () => {
    const seed = "dddddddddddddddddddddddddddddddd";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp0 = setup.attempt!.camp!;
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
    expect(viewA.attempt!.reveals).toEqual([]);
    expect(viewC.attempt!.reveals).toEqual([]);

    for (const view of [viewA, viewB, viewC]) {
      const whisperEntry = view.attempt!.log.find((e) => e.event === "whisper")!;
      expect(whisperEntry.private).toBe(false);
      expect(Object.keys(whisperEntry).sort()).toEqual(
        ["actorSeatId", "event", "gearId", "private", "subjectSeatIds"].sort(),
      );
    }
  });

  it("WR-03: a reveal keeps its recorded fromSeatId after the revealed card is moved to a third seat's hand", () => {
    const seed = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const setup = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp0 = setup.attempt!.camp!;
    const cardId = camp0.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const whispered = applyRunAction(setup, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    expect(whispered.ok).toBe(true);
    if (!whispered.ok) return;
    const run = whispered.state;
    const camp = run.attempt!.camp!;

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
    expect(view.yourOwnedGearIds).toEqual([]);
    expect(view.yourDraftOffer).toBeNull();
    expect(view.yourCapacity).toBeNull();
    expect(view.yourGear).toEqual([]);
    expect(view.attempt!.camp!.yourHand).toEqual([]);
    expect(view.attempt!.camp!.yourLegalCardIds).toEqual([]);
    expect(view.attempt!.reveals).toEqual([]);
    for (const entry of view.attempt!.log) {
      expect(entry.private).toBe(false);
    }
  });

  it("yourLegalCardIds is non-empty only for the current actor while playing, and every id belongs to their own hand", () => {
    const seed = "01234567890123456789012345678901";
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed, catalog: CATALOG }), "between-tricks", CATALOG);
    const camp = run.attempt!.camp!;
    const actor = currentActorSeatId(camp, rulesFor(run, CATALOG))!;

    const actorView = toExpeditionPlayerView(run, actor, CATALOG);
    expect(actorView.attempt!.camp!.campPhase).toBe("playing");
    expect(actorView.attempt!.camp!.yourLegalCardIds.length).toBeGreaterThan(0);
    const ownHandIds = camp.hands.find((h) => h.seatId === actor)!.cards.map((c) => c.id);
    for (const id of actorView.attempt!.camp!.yourLegalCardIds) {
      expect(ownHandIds).toContain(id);
    }

    const nonActor = SEATS.find((s) => s !== actor)!;
    const otherView = toExpeditionPlayerView(run, nonActor, CATALOG);
    expect(otherView.attempt!.camp!.yourLegalCardIds).toEqual([]);
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
