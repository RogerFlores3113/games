// Canary tests for view-leak-check.ts (Phase 11, Plan 04, COMM-03/ENG-03).
// Real fixtures are built via setupRun/advanceTo/applyRunAction with the
// production CATALOG and 32-hex seeds (so the seed-substring scan is always
// active); clean views assert []; every canary clones a clean view
// (structuredClone) and mutates the CLONE, never the original state or view,
// proving each detection layer can fail.

import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { createRun } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { toExpeditionPlayerView } from "./view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "./view-leak-check";
import type { RunState } from "../run/types";

const SEED = "0123456789abcdef0123456789abcdef";
const SEAT_IDS = ["p0", "p1", "p2"];

function dealtFaceUpCamp(): RunState {
  return advanceTo(
    setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG, campNumber: 1 }),
    "objective-pick",
    CATALOG,
  );
}

function thickFogCamp(): RunState {
  return advanceTo(
    setupRun({
      seatIds: SEAT_IDS,
      seed: SEED,
      catalog: CATALOG,
      campNumber: 3,
      bossTwists: { 3: "blind-orders", 6: null },
    }),
    "objective-pick",
    CATALOG,
  );
}

function postWhisperState(): RunState {
  const between = advanceTo(
    setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG, campNumber: 2 }),
    "between-tricks",
    CATALOG,
  );
  const hand = between.attempt!.camp!.hands.find((h) => h.seatId === "p0")!;
  const cardId = hand.cards[0]!.id;
  const result = applyRunAction(between, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
  if (!result.ok) throw new Error(`postWhisperState: whisper rejected: ${result.error}`);
  return result.state;
}

function freshFireside(): RunState {
  return setupRun({ seatIds: SEAT_IDS, seed: SEED, catalog: CATALOG });
}

/** Unlike setupRun (which always clears every seat's draftOffer to null),
 * createRun leaves camp-1's real per-seat draft offers in place — needed for
 * Canary F, which proves a cross-seat draft-offer swap is detected. */
function realFireside(): RunState {
  return createRun({ seatIds: SEAT_IDS, seed: SEED }, CATALOG);
}

describe("view-leak-check: clean baseline", () => {
  it("reports no leaks for a real toExpeditionPlayerView on every seat and an unseated viewer, across several run shapes", () => {
    let checked = 0;
    const states: RunState[] = [dealtFaceUpCamp(), thickFogCamp(), postWhisperState(), freshFireside()];

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

describe("view-leak-check: canary suite", () => {
  it("Canary A: another seat's card inserted into camp.yourHand", () => {
    const state = dealtFaceUpCamp();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const otherHand = state.attempt!.camp!.hands.find((h) => h.seatId !== viewer)!;
    const otherCard = otherHand.cards[0]!;

    const leaky = structuredClone(view);
    leaky.attempt!.camp!.yourHand.push({ id: otherCard.id, identity: otherCard.identity as never });

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
    (withObjectiveDeck.attempt!.camp as unknown as Record<string, unknown>).objectiveDeck = [];
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
    expect(withAudience.attempt!.log.length).toBeGreaterThan(0);
    (withAudience.attempt!.log[0] as unknown as Record<string, unknown>).audience = "public";
    expect(
      checkExpeditionViewForLeaks({
        view: withAudience,
        serialized: JSON.stringify(withAudience),
        secrets: whisperSecrets,
      }),
    ).toContain("structural:forbidden-key:audience");
  });

  it("Canary C: the 32-hex seed embedded inside a log entry's event string", () => {
    const state = postWhisperState();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const leaky = structuredClone(view);
    expect(leaky.attempt!.log.length).toBeGreaterThan(0);
    leaky.attempt!.log[0]!.event = `whisper-${SEED}`;

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("string:forbidden-token");
  });

  it("Canary D: in a Thick Fog view, another seat's objective literal appended reports hidden-id for that objective id", () => {
    const state = thickFogCamp();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const otherObjective = state.attempt!.camp!.objectives.find((o) => o.ownerSeatId !== viewer)!;
    expect(otherObjective).toBeDefined();

    const leaky = structuredClone(view);
    (leaky.attempt!.camp!.objectives as unknown[]).push({
      id: otherObjective.id,
      kind: otherObjective.kind,
      ownerSeatId: otherObjective.ownerSeatId,
      status: "pending",
    });

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`structural:hidden-id:${otherObjective.id}`);
  });

  it("Canary E: the view of a seat NOT in the reveal audience, with the reveal appended, reports identity-count-exceeded and hidden-id", () => {
    const state = postWhisperState();
    const reveal = state.attempt!.reveals[0]!;
    const outsider = state.seatIds.find((id) => !reveal.audience.includes(id) && id !== reveal.fromSeatId)!;
    expect(outsider).toBeDefined();

    const view = toExpeditionPlayerView(state, outsider, CATALOG);
    const secrets = secretsForExpeditionSeat(state, outsider, CATALOG, SEED);
    // Premise: the reveal is genuinely absent from the outsider's clean view.
    expect(view.attempt!.reveals).toEqual([]);

    const camp = state.attempt!.camp!;
    const card = camp.hands.flatMap((h) => h.cards).find((c) => c.id === reveal.cardId)!;

    const leaky = structuredClone(view);
    leaky.attempt!.reveals.push({
      cardId: reveal.cardId,
      fromSeatId: reveal.fromSeatId,
      source: reveal.source,
      identity: card.identity as never,
    });

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`structural:hidden-id:${reveal.cardId}`);
    expect(reasons.some((r) => r.startsWith("typed:identity-count-exceeded:"))).toBe(true);
  });

  it("Canary F: yourDraftOffer replaced with another seat's offer", () => {
    const state = realFireside();
    const viewer = "p0";
    const other = state.seats.find((s) => s.seatId !== viewer && s.draftOffer !== null)!;
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const leaky = structuredClone(view);
    leaky.yourDraftOffer = [...other.draftOffer!];

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:draft-offer-mismatch");
  });

  it("Canary G: a private log entry addressed to a different seat, appended", () => {
    const state = postWhisperState();
    const viewer = "p0";
    const view = toExpeditionPlayerView(state, viewer, CATALOG);
    const secrets = secretsForExpeditionSeat(state, viewer, CATALOG, SEED);

    const leaky = structuredClone(view);
    leaky.attempt!.log.push({
      event: "secret-event",
      actorSeatId: "p1",
      subjectSeatIds: ["p2"],
      gearId: null,
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

    const otherHand = state.attempt!.camp!.hands.find((h) => h.seatId !== viewer)!;
    const otherCard = otherHand.cards[0]!;

    const leaky = structuredClone(view);
    const entry = leaky.attempt!.camp!.handSizes.find((h) => h.seatId === otherHand.seatId)! as unknown as Record<
      string,
      unknown
    >;
    entry.cards = [{ id: otherCard.id, identity: otherCard.identity }];

    const reasons = checkExpeditionViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`structural:hidden-id:${otherCard.id}`);
    expect(reasons.some((r) => r.startsWith("typed:identity-count-exceeded:"))).toBe(true);
  });
});
