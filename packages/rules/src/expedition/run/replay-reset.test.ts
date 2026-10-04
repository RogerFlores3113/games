// The Phase 10 integration proofs (RUN-06/COMM-01/COMM-02), driven on the
// production catalogue plus one local fixture item ("test-sabotage":
// between-tricks, single-use, always breaks a guard) that fails a camp
// on demand without depending on a specific deal.
//
// The fail-then-replay fixture proves its two attempt-1 effects via Rain
// Poncho (one more whisper for its owner) and Camouflage.

import { describe, expect, it } from "vitest";
import { guard } from "../camp";
import { ability, defineItem } from "../content/source-def";
import { buildCatalog, CATALOG as PRODUCTION } from "./catalog";
import { rulesFor } from "./compose";
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
    effect: () => ({ goals: (prev) => (state) => [...prev(state), guard("sabotage", true)] }),
  }),
});

const catalog = buildCatalog({
  characters: PRODUCTION.characters,
  items: { ...PRODUCTION.items, "test-sabotage": testSabotage },
});

function act(run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

describe("fail-then-replay resets every camp-scoped resource (RUN-06)", () => {
  it("resets effects, reveals and per-camp uses, while kits, per-run uses and history persist", () => {
    const SEED = "10-16-fail-then-replay";
    const [scoutSeat, camoSeat, sabotageSeat] = ["s0", "s1", "s2"] as const;
    const whispersOf = (state: RunState, seatId: string) => rulesFor(state, catalog).whispersPerCamp(state, seatId);

    let run = setupRun({
      seatIds: [scoutSeat, camoSeat, sabotageSeat],
      seed: SEED,
      catalog,
      campNumber: 3,
      characters: { [scoutSeat]: "scout", [camoSeat]: "signaller", [sabotageSeat]: "medic" },
      kits: { [scoutSeat]: ["rain-poncho"], [camoSeat]: ["camouflage"], [sabotageSeat]: ["test-sabotage"] },
    });

    run = advanceTo(run, "between-tricks", catalog);
    const camp1Hands = run.attempt!.camp.hands;

    run = act(run, scoutSeat, { type: "use-ability", sourceId: "rain-poncho", targets: [] });
    expect(whispersOf(run, scoutSeat)).toBe(2);

    // The Scout's Spyglass reveals one card to the Scout alone (COMM-02).
    run = act(run, scoutSeat, { type: "use-ability", sourceId: "scout", targets: [`hand:${sabotageSeat}`] });
    expect(run.attempt!.reveals).toHaveLength(1);
    expect(run.attempt!.reveals[0]!.audience).toEqual([scoutSeat]);

    // Camouflage drops its owner's objective and adds its effect.
    const camoObjective = run.attempt!.camp.objectives.find((o) => o.ownerSeatId === camoSeat)!;
    run = act(run, camoSeat, { type: "use-ability", sourceId: "camouflage", targets: [`objective:${camoObjective.id}`] });
    expect(run.attempt!.camp.objectives.some((o) => o.id === camoObjective.id)).toBe(false);
    expect(run.attempt!.effects).toHaveLength(2);

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
    expect(run.history).toEqual([{ campNumber: 3, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
    expect(nextAttemptNumber(run)).toBe(2);

    // Replay: ready every seat again.
    for (const seatId of run.seatIds) run = act(run, seatId, { type: "ready" });

    expect(run.attempt).not.toBeNull();
    expect(run.attempt!.attemptNumber).toBe(2);
    expect(run.attempt!.effects).toEqual([]);
    expect(run.attempt!.reveals).toEqual([]);
    expect(run.attempt!.log).toEqual([]);
    expect(runPhase(run)).toBe("camp");
    expect(run.attempt!.camp.hands).not.toEqual(camp1Hands); // a fresh deal

    // Rain Poncho is per-run: one use left, and its extra whisper is gone.
    expect(remaining(run, scoutSeat, "rain-poncho", catalog)).toEqual({ kind: "uses", left: 1, of: 2 });
    expect(whispersOf(run, scoutSeat)).toBe(1);

    run = advanceTo(run, "between-tricks", catalog);

    // The Scout's per-camp use is fresh again; the ledger still holds attempt 1.
    expect(remaining(run, scoutSeat, "scout", catalog)).toEqual({ kind: "uses", left: 1, of: 1 });
    expect(run.seats[0]!.ledger).toHaveLength(2);
    expect(
      enumerateLegalRunActions(run, catalog).some((c) => c.seatId === scoutSeat && c.action.type === "use-ability" && c.action.sourceId === "scout"),
    ).toBe(true);
    for (const seatId of run.seatIds) expect(whispersUsedBy(run, seatId)).toBe(0);
  });
});

describe("Whisper end to end (COMM-01/COMM-02)", () => {
  it("refuses outside between-tricks, is visible only to its target, stays public in the log and present across tricks, and clears on replay", () => {
    const SEAT_IDS = ["p0", "p1", "p2"];
    const [p0, p1, p2] = SEAT_IDS as [string, string, string];

    let run = setupRun({ seatIds: SEAT_IDS, seed: "10-16-whisper-lifecycle", catalog, campNumber: 2, kits: { [p2]: ["test-sabotage"] } });
    run = advanceTo(run, "objective-pick", catalog);
    const objectivePickCard = run.attempt!.camp.hands.find((h) => h.seatId === p0)!.cards[0]!.id;

    expect(applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: objectivePickCard }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });

    run = advanceTo(run, "between-tricks", catalog);

    // Private to the target (COMM-02), public in the log naming whisperer and target only (COMM-01).
    const whisperedCardId = run.attempt!.camp.hands.find((h) => h.seatId === p0)!.cards[0]!.id;
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

    const camp = run.attempt!.camp;
    const leaderHand = camp.hands.find((h) => h.seatId === camp.currentTrick.leaderSeatId)!;
    run = act(run, camp.currentTrick.leaderSeatId, { type: "play-card", cardId: leaderHand.cards[0]!.id });

    // Mid-trick, after the first card is played (D-13, no grace period).
    const p2Hand = run.attempt!.camp.hands.find((h) => h.seatId === p2)!;
    expect(applyRunAction(run, p2, { type: "whisper", targetSeatId: p0, cardId: p2Hand.cards[0]!.id }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });

    // Finish the trick with each seat's first legal play (legality is the dispatcher's call).
    while (run.attempt!.camp.currentTrick.plays.length > 0 && run.attempt!.camp.currentTrick.plays.length < SEAT_IDS.length) {
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
    const freshHand = run.attempt!.camp.hands.find((h) => h.seatId === p0)!;
    expect(applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: freshHand.cards[0]!.id }, catalog).ok).toBe(true);
  });
});
