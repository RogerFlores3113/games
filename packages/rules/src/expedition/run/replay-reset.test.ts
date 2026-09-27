// The Phase 10 integration proofs (Plan 10-16, RUN-06/COMM-01/COMM-02,
// ROADMAP success criteria 1 and 2), driven on the REAL production CATALOG
// (catalog.ts) plus one local fixture gear ("test-sabotage": between-tricks,
// no targets, always fires a failure check) that lets both scenarios below
// fail a camp on demand without depending on a specific deal.
//
// jam.ts's own downside note applies here: Rain Poncho's "nobody may Whisper
// this camp" blocks every whisper-checking gear too (Signal Whistle's
// canUse reads the same whisperAllowed hook a raw Whisper does), so the
// fail-then-replay fixture below proves its two attempt-1 active effects via
// Rain Poncho (jam) and Camouflage (ghost) rather than forcing a third
// gear's effect through a use that jam's own downside would correctly
// refuse.

import { describe, expect, it } from "vitest";
import { createCamp } from "../camp";
import { activeBossId } from "./compose";
import { capacityOf, nextAttemptNumber, runPhase } from "./lifecycle";
import { attemptSeed } from "./rng";
import { objectiveSlotsFor } from "./balance";
import { applyRunAction } from "./run-actions";
import { advanceTo, enumerateLegalRunActions, setupRun } from "./run-test-support";
import { checkUseGear } from "./use-gear";
import { whispersUsedBy } from "./whisper";
import { CATALOG } from "./catalog";
import type { Catalog } from "./types";
import type { GearDef } from "../gear/gear-def";

/** A local fixture gear, not part of the real catalogue: between-tricks, no
 * targets, and its `apply` appends an active effect whose `effectModifier`
 * unconditionally adds "sabotage" to `failureChecks`, so using it always
 * fails the camp on the next `settleIfDecided` pass — regardless of the
 * actual deal, the trick played, or which objectives are still pending. */
function testSabotageGear(): GearDef {
  return {
    id: "test-sabotage",
    name: "Test Sabotage (fixture only)",
    size: 0,
    window: "between-tricks",
    text: "Test fixture only: always fails the camp.",
    targets: [],
    apply(_ctx) {
      return [{ op: "add-modifier" }];
    },
    effectModifier(_effect) {
      return {
        failureChecks(prev) {
          return (state) => [...prev(state), "sabotage"];
        },
      };
    },
  };
}

function testCatalog(): Catalog {
  return { gear: { ...CATALOG.gear, "test-sabotage": testSabotageGear() }, bosses: CATALOG.bosses };
}

describe("fail-then-replay resets every camp-scoped resource (ROADMAP criterion 2, RUN-06)", () => {
  it("resets gear-used flags, effects, reveals, the leader and Whisper availability, while owned/equipped gear, bossTwists, history and capacity persist", () => {
    const catalog = testCatalog();
    const SEED = "10-16-fail-then-replay";
    const SEAT_IDS = ["s0", "s1", "s2"];

    // Precompute attempt 1's leader with the SAME deal lifecycle.ts's
    // dealAttempt will produce (attemptSeed/objectiveSlotsFor at camp 3,
    // attempt 1), so the Machete/Camouflage bundle can be assigned to a
    // NON-leader seat — D-09's "the leader changes" needs a non-leader
    // owner, since a leader using Machete would hit its own "You already
    // lead the next trick" guard instead.
    const dealSeed = attemptSeed(SEED, 3, 1);
    const slots = objectiveSlotsFor(SEED, 3, 1);
    const preview = createCamp({ seatIds: SEAT_IDS, seed: dealSeed, objectiveSlots: slots });
    const macheteSeatId = SEAT_IDS.find((id) => id !== preview.expeditionLeaderSeatId)!;
    expect(macheteSeatId).not.toBe(preview.expeditionLeaderSeatId); // the precondition this fixture depends on
    const [jamSeatId, chatterSeatId] = SEAT_IDS.filter((id) => id !== macheteSeatId) as [string, string];

    const loadouts = {
      [jamSeatId]: ["jam", "peek"],
      [macheteSeatId]: ["commandeer", "ghost"],
      [chatterSeatId]: ["chatter", "test-sabotage"],
    };

    let run = setupRun({
      seatIds: SEAT_IDS,
      seed: SEED,
      catalog,
      campNumber: 3,
      bossTwists: { 3: "radio-silence", 6: null },
      loadouts,
    });

    const suppliesBefore = run.supplies;

    // Ready everyone; jamSeatId's Rain Poncho is pre-deal, so the run halts
    // at pre-deal without dealing (D-12).
    run = advanceTo(run, "pre-deal", catalog);
    expect(runPhase(run)).toBe("pre-deal");
    expect(activeBossId(run)).toBe("radio-silence"); // Monsoon, not yet cancelled

    // p0 uses Rain Poncho: Monsoon is cancelled for this attempt (D-04), but
    // the Poncho's own downside blocks Whispers instead (jam.ts's header).
    let result = applyRunAction(run, jamSeatId, { type: "use-gear", gearId: "jam", targets: [] }, catalog);
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;
    expect(activeBossId(run)).toBeNull();

    // Advance through objective-pick (one win-card objective per seat: 3
    // seats, 3 slots at camp 3, round-robin from the leader) to between-tricks.
    run = advanceTo(run, "between-tricks", catalog);
    expect(run.attempt).not.toBeNull();
    const camp1Hands = run.attempt!.camp!.hands;

    // p0 uses Spyglass on the Whistle/Sabotage seat: a reveal exists,
    // audience-scoped to p0 only (COMM-02).
    result = applyRunAction(run, jamSeatId, { type: "use-gear", gearId: "peek", targets: [chatterSeatId] }, catalog);
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;
    expect(run.attempt!.reveals).toHaveLength(1);
    expect(run.attempt!.reveals[0]!.audience).toEqual([jamSeatId]);

    // p1 uses Machete: the OPEN trick's leader changes to p1 (D-09).
    result = applyRunAction(run, macheteSeatId, { type: "use-gear", gearId: "commandeer", targets: [] }, catalog);
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;
    expect(run.attempt!.camp!.currentTrick.leaderSeatId).toBe(macheteSeatId);

    // p1 uses Camouflage on its own pending objective: an active effect
    // exists, and the objective leaves play entirely (D-11).
    const macheteObjective = run.attempt!.camp!.objectives.find((o) => o.ownerSeatId === macheteSeatId)!;
    result = applyRunAction(
      run,
      macheteSeatId,
      { type: "use-gear", gearId: "ghost", targets: [macheteObjective.id] },
      catalog,
    );
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;
    expect(run.attempt!.camp!.objectives.some((o) => o.id === macheteObjective.id)).toBe(false);

    // p2's Signal Whistle is ALSO blocked by Rain Poncho's whole-camp
    // downside (chatter.ts's own canUse reads the same whisperAllowed hook a
    // raw Whisper does) — proving both active effects (Poncho + Camouflage)
    // exist without needing a third gear's effect to make the point.
    const chatterCheck = checkUseGear(run, chatterSeatId, "chatter", [], catalog);
    expect(chatterCheck).toEqual({ ok: false, error: "gear_unavailable", reason: "Whispers are blocked this camp" });
    expect(run.attempt!.effects).toHaveLength(2); // jam's own effect + ghost's

    // Snapshot BEFORE the sabotage use, per the plan's own ordering.
    const seatsSnapshot = run.seats;
    const bossTwistsSnapshot = run.bossTwists;

    // p2 uses the fixture's test-sabotage: the camp fails and settles in the
    // same applyRunAction call (advanceRun runs after every accepted action).
    result = applyRunAction(run, chatterSeatId, { type: "use-gear", gearId: "test-sabotage", targets: [] }, catalog);
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;

    // --- Assertions after settling (D-01/D-02/D-06/RUN-03) ---
    expect(runPhase(run)).toBe("fireside");
    expect(run.supplies).toBe(suppliesBefore - 1);
    expect(run.seats.every((seat) => seat.draftOffer === null)).toBe(true); // D-01: no draft on a failure
    expect(run.seats).toEqual(seatsSnapshot); // owned/equipped survive untouched (D-06)
    expect(run.bossTwists).toEqual(bossTwistsSnapshot);
    expect(run.bossTwists[3]).toBe("radio-silence"); // D-02: the stored twist survives cancellation
    for (const seatId of SEAT_IDS) {
      expect(capacityOf(run, seatId, catalog)).toBe(3); // RUN-03: the camp number, not the attempt count
    }
    expect(nextAttemptNumber(run)).toBe(2);

    // --- Replay: ready every seat again ---
    for (const seatId of SEAT_IDS) {
      result = applyRunAction(run, seatId, { type: "ready" }, catalog);
      expect(result.ok).toBe(true);
      run = result.ok ? result.state : run;
    }

    expect(run.attempt).not.toBeNull();
    expect(run.attempt!.attemptNumber).toBe(2);
    expect(run.attempt!.gearUses).toEqual([]);
    expect(run.attempt!.effects).toEqual([]);
    expect(run.attempt!.reveals).toEqual([]);
    expect(run.attempt!.log).toEqual([]);
    expect(run.attempt!.bossCancelled).toBe(false);
    expect(activeBossId(run)).toBe("radio-silence"); // D-04: the twist returns
    expect(runPhase(run)).toBe("pre-deal");
    expect(
      enumerateLegalRunActions(run, catalog).some(
        (c) => c.seatId === jamSeatId && c.action.type === "use-gear" && c.action.gearId === "jam",
      ),
    ).toBe(true); // p0's jam is pending again (used flags reset)

    // p0 SKIPS the Poncho this time — the deal happens, and Monsoon is
    // active again (the raw twist, uncancelled).
    result = applyRunAction(run, jamSeatId, { type: "skip-window" }, catalog);
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;
    expect(runPhase(run)).toBe("camp");
    expect(activeBossId(run)).toBe("radio-silence");

    const camp2Hands = run.attempt!.camp!.hands;
    expect(camp2Hands).not.toEqual(camp1Hands); // a fresh deal, not the same hands

    // The leader resets to the fresh deal's own expedition leader — Machete's
    // attempt-1 effect does not survive.
    expect(run.attempt!.camp!.currentTrick.leaderSeatId).toBe(run.attempt!.camp!.expeditionLeaderSeatId);

    run = advanceTo(run, "between-tricks", catalog);

    // A raw Whisper is refused: Monsoon is active again.
    const someHand = run.attempt!.camp!.hands.find((h) => h.seatId === jamSeatId)!;
    const whisperTarget = SEAT_IDS.find((id) => id !== jamSeatId)!;
    const whisperResult = applyRunAction(
      run,
      jamSeatId,
      { type: "whisper", targetSeatId: whisperTarget, cardId: someHand.cards[0]!.id },
      catalog,
    );
    expect(whisperResult).toEqual({ ok: false, error: "whisper_blocked" });
    for (const seatId of SEAT_IDS) {
      expect(whispersUsedBy(run, seatId)).toBe(0);
    }

    // T-10-50 / used-flag reset: none of attempt 1's gear rejects with
    // gear_already_used again. Each may still be legitimately unusable for
    // an unrelated, in-context reason this attempt (an already-leading
    // Machete owner in the fresh deal, or Monsoon blocking a
    // whisper-checking gear) — the property under test is only that the
    // ENGINE no longer believes the gear was already used.
    const peekCheck = checkUseGear(run, jamSeatId, "peek", [whisperTarget], catalog);
    expect(peekCheck.ok).toBe(true);

    const commandeerCheck = checkUseGear(run, macheteSeatId, "commandeer", [], catalog);
    expect(commandeerCheck.ok || (commandeerCheck as { error: string }).error !== "gear_already_used").toBe(true);

    const macheteObjective2 = run.attempt!.camp!.objectives.find((o) => o.ownerSeatId === macheteSeatId);
    expect(macheteObjective2).not.toBeUndefined(); // 3 seats / 3 slots: every seat owns exactly one again
    const ghostCheck = checkUseGear(run, macheteSeatId, "ghost", [macheteObjective2!.id], catalog);
    expect(ghostCheck.ok || (ghostCheck as { error: string }).error !== "gear_already_used").toBe(true);

    const chatterCheck2 = checkUseGear(run, chatterSeatId, "chatter", [], catalog);
    expect(chatterCheck2.ok || (chatterCheck2 as { error: string }).error !== "gear_already_used").toBe(true);
  });
});

describe("Whisper end to end (ROADMAP criterion 1, COMM-01/COMM-02)", () => {
  it("refuses outside between-tricks, is visible only to its target, stays public in the log and present across tricks, and clears on replay", () => {
    const catalog = testCatalog();
    const SEED = "10-16-whisper-lifecycle";
    const SEAT_IDS = ["p0", "p1", "p2"];
    const [p0, p1, p2] = SEAT_IDS as [string, string, string];

    let run = setupRun({
      seatIds: SEAT_IDS,
      seed: SEED,
      catalog,
      campNumber: 2,
      loadouts: { [p2]: ["test-sabotage"] },
    });

    run = advanceTo(run, "objective-pick", catalog);
    const objectivePickCard = run.attempt!.camp!.hands.find((h) => h.seatId === p0)!.cards[0]!.id;

    // Wrong window: a whisper before objectives are picked.
    let whisperResult = applyRunAction(
      run,
      p0,
      { type: "whisper", targetSeatId: p1, cardId: objectivePickCard },
      catalog,
    );
    expect(whisperResult).toEqual({ ok: false, error: "wrong_window" });

    run = advanceTo(run, "between-tricks", catalog);

    // Accepted between tricks: private to the target (COMM-02), public in
    // the log naming whisperer -> target only, never a card id (COMM-01).
    const p0Hand = run.attempt!.camp!.hands.find((h) => h.seatId === p0)!;
    const whisperedCardId = p0Hand.cards[0]!.id;
    let result = applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: whisperedCardId }, catalog);
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;

    const reveal = run.attempt!.reveals.find((r) => r.cardId === whisperedCardId);
    expect(reveal).not.toBeUndefined();
    expect(reveal!.audience).toEqual([p1]);
    const logEntry = run.attempt!.log.find((e) => e.event === "whisper");
    expect(logEntry).toEqual({
      event: "whisper",
      actorSeatId: p0,
      subjectSeatIds: [p1],
      gearId: null,
      audience: "public",
    });

    // The trick's leader plays the first card of the trick.
    const camp = run.attempt!.camp!;
    const leaderHand = camp.hands.find((h) => h.seatId === camp.currentTrick.leaderSeatId)!;
    result = applyRunAction(
      run,
      camp.currentTrick.leaderSeatId,
      { type: "play-card", cardId: leaderHand.cards[0]!.id },
      catalog,
    );
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;

    // Wrong window: mid-trick, after the first card is played (D-13, no
    // grace period).
    const p2HandNow = run.attempt!.camp!.hands.find((h) => h.seatId === p2)!;
    whisperResult = applyRunAction(
      run,
      p2,
      { type: "whisper", targetSeatId: p0, cardId: p2HandNow.cards[0]!.id },
      catalog,
    );
    expect(whisperResult).toEqual({ ok: false, error: "wrong_window" });

    // Finish the trick: every remaining seat plays its own first legal card
    // (T-03-24: legality is decided by applyRunAction itself, never
    // re-derived here).
    while (
      run.attempt !== null &&
      run.attempt.camp !== null &&
      run.attempt.camp.currentTrick.plays.length > 0 &&
      run.attempt.camp.currentTrick.plays.length < SEAT_IDS.length
    ) {
      const legalPlays = enumerateLegalRunActions(run, catalog).filter((c) => c.action.type === "play-card");
      expect(legalPlays.length).toBeGreaterThan(0);
      const picked = legalPlays[0]!;
      result = applyRunAction(run, picked.seatId, picked.action, catalog);
      expect(result.ok).toBe(true);
      run = result.ok ? result.state : run;
    }

    // The reveal from before the trick is still present (COMM-02: it
    // survives further tricks within the same attempt).
    expect(run.attempt!.reveals.some((r) => r.cardId === whisperedCardId)).toBe(true);

    // Force a failure through the fixture's test-sabotage (equipped by p2),
    // then replay.
    result = applyRunAction(run, p2, { type: "use-gear", gearId: "test-sabotage", targets: [] }, catalog);
    expect(result.ok).toBe(true);
    run = result.ok ? result.state : run;
    expect(runPhase(run)).toBe("fireside");

    for (const seatId of SEAT_IDS) {
      result = applyRunAction(run, seatId, { type: "ready" }, catalog);
      expect(result.ok).toBe(true);
      run = result.ok ? result.state : run;
    }

    expect(run.attempt).not.toBeNull();
    expect(run.attempt!.reveals).toEqual([]); // COMM-02: cleared with the replay

    run = advanceTo(run, "between-tricks", catalog);

    const freshHand = run.attempt!.camp!.hands.find((h) => h.seatId === p0)!;
    result = applyRunAction(run, p0, { type: "whisper", targetSeatId: p1, cardId: freshHand.cards[0]!.id }, catalog);
    expect(result.ok).toBe(true); // p0 may Whisper again
  });
});
