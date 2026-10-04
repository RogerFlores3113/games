// The Phase 10 integration proofs (RUN-06/COMM-01/COMM-02), driven on the
// production catalogue plus one local fixture item ("test-sabotage":
// between-tricks, single-use, always breaks a guard) that fails a camp
// on demand without depending on a specific deal.
//
// The fail-then-replay fixture proves its two attempt-1 effects via Rain
// Poncho (one more whisper for its owner) and Camouflage.

import { describe, expect, it } from "vitest";
import { guard } from "../camp";
import { defineItem, itemAbility } from "../content/source-def";
import { buildCatalog, CATALOG as PRODUCTION } from "./catalog";
import { rulesFor } from "./compose";
import { attemptOf, nextAttemptNumber } from "./attempt";
import { campIndex } from "./plan";
import { applyRunAction } from "./stages/registry";
import { advanceTo, enumerateLegalRunActions, setupRun } from "./run-test-support";
import { remaining } from "./usage";
import { whispersUsedBy } from "./whisper";
import type { RunState } from "./types";

const testSabotage = defineItem({
  id: "test-sabotage",
  name: "Test Sabotage (fixture only)",
  rarity: "common",
  price: 2,
  uses: { kind: "single-use" },
  text: "Test fixture only: always fails the camp.",
  active: itemAbility({
    window: "between-tricks",
    targets: [],
    apply: () => [{ op: "add-modifier", lasts: "attempt", params: {}, audience: "public" }],
    effect: () => ({ goals: (prev) => (state) => [...prev(state), guard("sabotage", true)] }),
  }),
});

const catalog = buildCatalog({
  characters: PRODUCTION.characters,
  items: { ...PRODUCTION.items, "test-sabotage": testSabotage },
  mods: PRODUCTION.mods,
  pairings: PRODUCTION.pairings,
});

function act(run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

describe("fail-then-replay resets every camp-scoped resource (RUN-06)", () => {
  it("resets effects, reveals and per-camp uses, while items, charges and history persist", () => {
    const SEED = "10-16-fail-then-replay";
    const [scoutSeat, camoSeat, sabotageSeat] = ["s0", "s1", "s2"] as const;
    const whispersOf = (state: RunState, seatId: string) => rulesFor(state, catalog).whispersPerCamp(state, seatId);

    let run = setupRun({
      seatIds: [scoutSeat, camoSeat, sabotageSeat],
      seed: SEED,
      catalog,
      camp: 3,
      characters: { [scoutSeat]: "scout", [camoSeat]: "signaller", [sabotageSeat]: "medic" },
      items: { [scoutSeat]: ["rain-poncho"], [camoSeat]: ["camouflage"], [sabotageSeat]: ["test-sabotage"] },
    });
    const [poncho, camouflage, sabotage] = ["it0", "it1", "it2"];

    run = advanceTo(run, "between-tricks", catalog);
    const camp1Hands = attemptOf(run)!.camp.hands;

    run = act(run, scoutSeat, { type: "use-ability", sourceKey: poncho, targets: [] });
    expect(whispersOf(run, scoutSeat)).toBe(2);

    // The Scout's Spyglass reveals one card to the Scout alone (COMM-02).
    run = act(run, scoutSeat, { type: "use-ability", sourceKey: "scout", targets: [`hand:${sabotageSeat}`] });
    expect(attemptOf(run)!.reveals).toHaveLength(1);
    expect(attemptOf(run)!.reveals[0]!.audience).toEqual([scoutSeat]);

    // Camouflage drops its owner's objective and adds its effect.
    const camoObjective = attemptOf(run)!.camp.objectives.find((o) => o.ownerSeatId === camoSeat)!;
    run = act(run, camoSeat, { type: "use-ability", sourceKey: camouflage, targets: [`objective:${camoObjective.id}`] });
    expect(attemptOf(run)!.camp.objectives.some((o) => o.id === camoObjective.id)).toBe(false);
    expect(attemptOf(run)!.effects).toHaveLength(2);

    const suppliesBefore = run.supplies;

    // The camp fails and settles inside this same call.
    run = act(run, sabotageSeat, { type: "use-ability", sourceKey: sabotage, targets: [] });

    expect(run.stage.tag).toBe("loadout");
    expect(suppliesBefore).toBe(3);
    expect(run.supplies).toBe(2);
    expect(run.seats.every((seat) => seat.offers.length === 0)).toBe(true); // D-01: no draft on a failure
    expect(run.seats.map((s) => s.items)).toEqual([[{ uid: poncho, itemId: "rain-poncho" }], [], []]); // single-use items are spent
    expect(run.seats.map((s) => s.ledger.map((e) => (e.kind === "used" ? e.sourceKey : e.kind)))).toEqual([[poncho, "scout"], [camouflage], [sabotage]]);
    expect(run.history).toEqual([{ camp: 3, attempt: 1, status: "failed", suppliesSpent: 1, coins: 0 }]);
    expect(nextAttemptNumber(run, campIndex(3))).toBe(2);

    // Replay: ready every seat again.
    for (const seatId of run.seatIds) run = act(run, seatId, { type: "ready" });

        expect(attemptOf(run)!.attemptNumber).toBe(2);
    expect(attemptOf(run)!.effects).toEqual([]);
    expect(attemptOf(run)!.reveals).toEqual([]);
    expect(attemptOf(run)!.log).toEqual([]);
    expect(run.stage.tag).toBe("camp");
    expect(attemptOf(run)!.camp.hands).not.toEqual(camp1Hands); // a fresh deal

    // Rain Poncho's charges survive the replay: one left, and its extra whisper is gone.
    expect(remaining(run, scoutSeat, poncho, catalog)).toEqual({ kind: "uses", left: 1, of: 2 });
    expect(whispersOf(run, scoutSeat)).toBe(1);

    run = advanceTo(run, "between-tricks", catalog);

    // The Scout's per-camp use is fresh again; the ledger still holds attempt 1.
    expect(remaining(run, scoutSeat, "scout", catalog)).toEqual({ kind: "uses", left: 1, of: 1 });
    expect(run.seats[0]!.ledger).toHaveLength(2);
    expect(
      enumerateLegalRunActions(run, catalog).some((c) => c.seatId === scoutSeat && c.action.type === "use-ability" && c.action.sourceKey === "scout"),
    ).toBe(true);
    for (const seatId of run.seatIds) expect(whispersUsedBy(run, seatId)).toBe(0);
  });
});

describe("Whisper end to end (COMM-01/COMM-02)", () => {
  it("refuses outside between-tricks, is visible only to its target, stays public in the log and present across tricks, and clears on replay", () => {
    const SEAT_IDS = ["p0", "p1", "p2"];
    const [p0, p1, p2] = SEAT_IDS as [string, string, string];

    let run = setupRun({ seatIds: SEAT_IDS, seed: "10-16-whisper-lifecycle", catalog, camp: 2, items: { [p2]: ["test-sabotage"] } });
    run = advanceTo(run, "objective-pick", catalog);
    const objectivePickCard = attemptOf(run)!.camp.hands.find((h) => h.seatId === p0)!.cards[0]!.id;

    expect(applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: objectivePickCard }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });

    run = advanceTo(run, "between-tricks", catalog);

    // Private to the target (COMM-02), public in the log naming whisperer and target only (COMM-01).
    const whisperedCardId = attemptOf(run)!.camp.hands.find((h) => h.seatId === p0)!.cards[0]!.id;
    run = act(run, p0, { type: "whisper", targetSeatId: p1, cardId: whisperedCardId });

    const reveal = attemptOf(run)!.reveals.find((r) => r.cardId === whisperedCardId);
    expect(reveal!.audience).toEqual([p1]);
    expect(attemptOf(run)!.log.find((e) => e.event === "whisper")).toEqual({
      event: "whisper",
      actorSeatId: p0,
      subjectSeatIds: [p1],
      sourceId: null,
      audience: "public",
    });

    const camp = attemptOf(run)!.camp;
    const leaderHand = camp.hands.find((h) => h.seatId === camp.currentTrick.leaderSeatId)!;
    run = act(run, camp.currentTrick.leaderSeatId, { type: "play-card", cardId: leaderHand.cards[0]!.id });

    // Mid-trick, after the first card is played (D-13, no grace period).
    const p2Hand = attemptOf(run)!.camp.hands.find((h) => h.seatId === p2)!;
    expect(applyRunAction(run, p2, { type: "whisper", targetSeatId: p0, cardId: p2Hand.cards[0]!.id }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });

    // Finish the trick with each seat's first legal play (legality is the dispatcher's call).
    while (attemptOf(run)!.camp.currentTrick.plays.length > 0 && attemptOf(run)!.camp.currentTrick.plays.length < SEAT_IDS.length) {
      const picked = enumerateLegalRunActions(run, catalog).find((c) => c.action.type === "play-card")!;
      run = act(run, picked.seatId, picked.action);
    }

    // The reveal survives further tricks within the attempt.
    expect(attemptOf(run)!.reveals.some((r) => r.cardId === whisperedCardId)).toBe(true);

    // Fail the camp, then replay.
    run = act(run, p2, { type: "use-ability", sourceKey: "it0", targets: [] });
    expect(run.stage.tag).toBe("loadout");
    for (const seatId of SEAT_IDS) run = act(run, seatId, { type: "ready" });

    expect(attemptOf(run)!.reveals).toEqual([]); // COMM-02: cleared with the replay

    run = advanceTo(run, "between-tricks", catalog);
    const freshHand = attemptOf(run)!.camp.hands.find((h) => h.seatId === p0)!;
    expect(applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: freshHand.cards[0]!.id }, catalog).ok).toBe(true);
  });
});
