// The Phase 10 integration proofs (RUN-06/COMM-01/COMM-02), driven on the
// production catalogue plus one local fixture item ("test-sabotage":
// between-tricks, single-use, always fires a failure check) that fails a camp
// on demand without depending on a specific deal.
//
// Rain Poncho's "nobody may whisper this camp" blocks every whisper, so the
// fail-then-replay fixture proves its two attempt-1 effects via Rain Poncho
// and Camouflage and checks the whisper refusal directly.

import { describe, expect, it } from "vitest";
import { ability, defineItem } from "../content/source-def";
import { buildCatalog, CATALOG as PRODUCTION } from "./catalog";
import { activeBossId } from "./compose";
import { nextAttemptNumber, runPhase } from "./lifecycle";
import { applyRunAction } from "./run-actions";
import { advanceTo, enumerateLegalRunActions, setupRun } from "./run-test-support";
import { remaining } from "./usage";
import { whispersUsedBy } from "./whisper";
import type { RunState } from "./types";

const testSabotage = defineItem({
  id: "test-sabotage",
  name: "Test Sabotage (fixture only)",
  text: "Test fixture only: always fails the camp.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "single-use" },
    targets: [],
    apply: () => [{ op: "add-modifier", lasts: "attempt", params: {}, audience: "public" }],
    effect: () => ({ failureChecks: (prev) => (state) => [...prev(state), "sabotage"] }),
  }),
});

const catalog = buildCatalog({
  characters: PRODUCTION.characters,
  items: { ...PRODUCTION.items, "test-sabotage": testSabotage },
  bosses: PRODUCTION.bosses,
});

function act(run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

describe("fail-then-replay resets every camp-scoped resource (RUN-06)", () => {
  it("resets effects, reveals, per-camp uses and the cancelled twist, while kits, per-run uses, bossTwists and history persist", () => {
    const SEED = "10-16-fail-then-replay";
    const [scoutSeat, camoSeat, sabotageSeat] = ["s0", "s1", "s2"] as const;

    let run = setupRun({
      seatIds: [scoutSeat, camoSeat, sabotageSeat],
      seed: SEED,
      catalog,
      campNumber: 3,
      bossTwists: { 3: "radio-silence", 6: null },
      characters: { [scoutSeat]: "scout", [camoSeat]: "signaller", [sabotageSeat]: "medic" },
      kits: { [scoutSeat]: ["rain-poncho"], [camoSeat]: ["camouflage"], [sabotageSeat]: ["test-sabotage"] },
    });

    run = advanceTo(run, "pre-deal", catalog);
    expect(runPhase(run)).toBe("pre-deal");
    expect(activeBossId(run)).toBe("radio-silence");

    // Rain Poncho cancels Monsoon for this attempt (D-04) but blocks whispers.
    run = act(run, scoutSeat, { type: "use-ability", sourceId: "rain-poncho", targets: [] });
    expect(activeBossId(run)).toBeNull();

    run = advanceTo(run, "between-tricks", catalog);
    const camp1Hands = run.attempt!.camp!.hands;

    // The Scout's Spyglass reveals one card to the Scout alone (COMM-02).
    run = act(run, scoutSeat, { type: "use-ability", sourceId: "scout", targets: [`hand:${sabotageSeat}`] });
    expect(run.attempt!.reveals).toHaveLength(1);
    expect(run.attempt!.reveals[0]!.audience).toEqual([scoutSeat]);

    // Camouflage drops its owner's objective and adds its effect.
    const camoObjective = run.attempt!.camp!.objectives.find((o) => o.ownerSeatId === camoSeat)!;
    run = act(run, camoSeat, { type: "use-ability", sourceId: "camouflage", targets: [`objective:${camoObjective.id}`] });
    expect(run.attempt!.camp!.objectives.some((o) => o.id === camoObjective.id)).toBe(false);
    expect(run.attempt!.effects).toHaveLength(2);

    // Rain Poncho's downside: a raw whisper is refused for the whole camp.
    const hand = run.attempt!.camp!.hands.find((h) => h.seatId === sabotageSeat)!;
    expect(applyRunAction(run, sabotageSeat, { type: "whisper", targetSeatId: scoutSeat, cardId: hand.cards[0]!.id }, catalog)).toEqual({
      ok: false,
      error: "whisper_blocked",
    });

    const bossTwistsBefore = run.bossTwists;
    const suppliesBefore = run.supplies;

    // The camp fails and settles inside this same call.
    run = act(run, sabotageSeat, { type: "use-ability", sourceId: "test-sabotage", targets: [] });

    expect(runPhase(run)).toBe("fireside");
    expect(run.supplies).toBe(suppliesBefore - 1);
    expect(run.seats.every((seat) => seat.draftOffer === null)).toBe(true); // D-01: no draft on a failure
    expect(run.seats.map((s) => s.kit)).toEqual([["rain-poncho"], [], []]); // single-use items are spent
    expect(run.seats.map((s) => s.ledger.map((e) => (e.kind === "used" ? e.sourceId : e.kind)))).toEqual([
      ["rain-poncho", "scout"],
      ["camouflage"],
      ["test-sabotage"],
    ]);
    expect(run.bossTwists).toEqual(bossTwistsBefore);
    expect(run.bossTwists[3]).toBe("radio-silence"); // D-02: the stored twist survives cancellation
    expect(run.history).toEqual([{ campNumber: 3, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
    expect(nextAttemptNumber(run)).toBe(2);

    // Replay: ready every seat again.
    for (const seatId of run.seatIds) run = act(run, seatId, { type: "ready" });

    expect(run.attempt).not.toBeNull();
    expect(run.attempt!.attemptNumber).toBe(2);
    expect(run.attempt!.effects).toEqual([]);
    expect(run.attempt!.reveals).toEqual([]);
    expect(run.attempt!.log).toEqual([]);
    expect(run.attempt!.bossCancelled).toBe(false);
    expect(activeBossId(run)).toBe("radio-silence"); // D-04: the twist returns

    // Rain Poncho is per-run: still spent, so nothing waits at pre-deal.
    expect(remaining(run, scoutSeat, "rain-poncho", catalog)).toEqual({ kind: "uses", left: 0, of: 1 });
    expect(runPhase(run)).toBe("camp");
    expect(run.attempt!.camp!.hands).not.toEqual(camp1Hands); // a fresh deal

    run = advanceTo(run, "between-tricks", catalog);

    // The Scout's per-camp use is fresh again; the ledger still holds attempt 1.
    expect(remaining(run, scoutSeat, "scout", catalog)).toEqual({ kind: "uses", left: 1, of: 1 });
    expect(run.seats[0]!.ledger).toHaveLength(2);
    expect(
      enumerateLegalRunActions(run, catalog).some((c) => c.seatId === scoutSeat && c.action.type === "use-ability" && c.action.sourceId === "scout"),
    ).toBe(true);

    // Monsoon is back, so a raw whisper is refused and none were counted.
    const someHand = run.attempt!.camp!.hands.find((h) => h.seatId === scoutSeat)!;
    expect(applyRunAction(run, scoutSeat, { type: "whisper", targetSeatId: camoSeat, cardId: someHand.cards[0]!.id }, catalog)).toEqual({
      ok: false,
      error: "whisper_blocked",
    });
    for (const seatId of run.seatIds) expect(whispersUsedBy(run, seatId)).toBe(0);
  });
});

describe("Whisper end to end (COMM-01/COMM-02)", () => {
  it("refuses outside between-tricks, is visible only to its target, stays public in the log and present across tricks, and clears on replay", () => {
    const SEAT_IDS = ["p0", "p1", "p2"];
    const [p0, p1, p2] = SEAT_IDS as [string, string, string];

    let run = setupRun({ seatIds: SEAT_IDS, seed: "10-16-whisper-lifecycle", catalog, campNumber: 2, kits: { [p2]: ["test-sabotage"] } });
    run = advanceTo(run, "objective-pick", catalog);
    const objectivePickCard = run.attempt!.camp!.hands.find((h) => h.seatId === p0)!.cards[0]!.id;

    expect(applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: objectivePickCard }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });

    run = advanceTo(run, "between-tricks", catalog);

    // Private to the target (COMM-02), public in the log naming whisperer and target only (COMM-01).
    const whisperedCardId = run.attempt!.camp!.hands.find((h) => h.seatId === p0)!.cards[0]!.id;
    run = act(run, p0, { type: "whisper", targetSeatId: p1, cardId: whisperedCardId });

    const reveal = run.attempt!.reveals.find((r) => r.cardId === whisperedCardId);
    expect(reveal!.audience).toEqual([p1]);
    expect(run.attempt!.log.find((e) => e.event === "whisper")).toEqual({
      event: "whisper",
      actorSeatId: p0,
      subjectSeatIds: [p1],
      sourceId: null,
      audience: "public",
    });

    const camp = run.attempt!.camp!;
    const leaderHand = camp.hands.find((h) => h.seatId === camp.currentTrick.leaderSeatId)!;
    run = act(run, camp.currentTrick.leaderSeatId, { type: "play-card", cardId: leaderHand.cards[0]!.id });

    // Mid-trick, after the first card is played (D-13, no grace period).
    const p2Hand = run.attempt!.camp!.hands.find((h) => h.seatId === p2)!;
    expect(applyRunAction(run, p2, { type: "whisper", targetSeatId: p0, cardId: p2Hand.cards[0]!.id }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });

    // Finish the trick with each seat's first legal play (legality is the dispatcher's call).
    while (run.attempt!.camp!.currentTrick.plays.length > 0 && run.attempt!.camp!.currentTrick.plays.length < SEAT_IDS.length) {
      const picked = enumerateLegalRunActions(run, catalog).find((c) => c.action.type === "play-card")!;
      run = act(run, picked.seatId, picked.action);
    }

    // The reveal survives further tricks within the attempt.
    expect(run.attempt!.reveals.some((r) => r.cardId === whisperedCardId)).toBe(true);

    // Fail the camp, then replay.
    run = act(run, p2, { type: "use-ability", sourceId: "test-sabotage", targets: [] });
    expect(runPhase(run)).toBe("fireside");
    for (const seatId of SEAT_IDS) run = act(run, seatId, { type: "ready" });

    expect(run.attempt!.reveals).toEqual([]); // COMM-02: cleared with the replay

    run = advanceTo(run, "between-tricks", catalog);
    const freshHand = run.attempt!.camp!.hands.find((h) => h.seatId === p0)!;
    expect(applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: freshHand.cards[0]!.id }, catalog).ok).toBe(true);
  });
});
