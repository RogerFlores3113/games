// Tests for the v1 run gear (Plan 10-11, GEAR-04): Rain Poncho (jam.ts,
// D-04, D-12) and Energy Tonic (overclock.ts, spec §5.1 stacking). Also
// proves end to end that the capacity and failure-cost hooks feed RUN-02
// and RUN-03.
//
// Fixtures are driven exclusively through applyRunAction (run-actions.ts)
// and the run-test-support helpers (setupRun/advanceTo), per this plan's
// own <interfaces> note. checkUseGear is called directly only where a test
// needs the GEAR-06 reason string that applyRunAction's AdapterResult does
// not carry.

import { describe, expect, it } from "vitest";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { checkUseGear } from "../run/use-gear";
import { activeBossId } from "../run/compose";
import { capacityOf, runPhase, runStatus } from "../run/lifecycle";
import type { GearDef } from "./gear-def";
import type { BossDef } from "../boss/boss-def";
import type { Catalog, CampNumber, RunState } from "../run/types";
import { jam } from "./jam";
import { overclock } from "./overclock";

const SEAT_IDS = ["p0", "p1", "p2"] as const;
const SEED = "run-gear-seed";

const FAKE_FOG: BossDef = {
  id: "fake-fog",
  name: "Fake Fog",
  text: "x",
  modifiers: { objectiveAssignment: () => () => "face-down" },
};

const FAKE_FAIL: BossDef = {
  id: "fake-fail",
  name: "Fake Fail",
  text: "x",
  modifiers: { failureChecks: () => () => ["forced"] },
};

// Between-tricks, no targets: forces an immediate failure mid-camp, used
// for the D-04 replay test.
const FAKE_SABOTAGE: GearDef = {
  id: "fake-sabotage",
  name: "Fake Sabotage",
  size: 0,
  window: "between-tricks",
  text: "x",
  targets: [],
  apply(_ctx) {
    return [{ op: "add-modifier" }];
  },
  effectModifier(_effect) {
    return { failureChecks: (_prev) => () => ["sabotage"] };
  },
};

// A plain size-3 gear used only to prove Energy Tonic's capacity bump.
const FAKE_SIZE_3: GearDef = {
  id: "fake-size-3",
  name: "Fake Size 3",
  size: 3,
  window: "passive",
  text: "x",
  targets: [],
};

function makeCatalog(): Catalog {
  return {
    gear: { jam, overclock, "fake-sabotage": FAKE_SABOTAGE, "fake-size-3": FAKE_SIZE_3 },
    bosses: { "fake-fog": FAKE_FOG, "fake-fail": FAKE_FAIL },
  };
}

describe("Rain Poncho (jam)", () => {
  function setupPoncho(): { run: RunState; catalog: Catalog } {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "fake-fog", 6: null },
        loadouts: { p0: ["jam"] },
      }),
      "pre-deal",
      catalog,
    );
    return { run, catalog };
  }

  it("is the only seat pending pre-deal, and using it cancels the twist and deals face-up immediately", () => {
    const { run, catalog } = setupPoncho();
    expect(runPhase(run)).toBe("pre-deal");

    const result = applyRunAction(run, "p0", { type: "use-gear", gearId: "jam", targets: [] }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const next = result.state;
    expect(next.attempt!.camp).not.toBeNull();
    expect(next.attempt!.bossCancelled).toBe(true);
    expect(activeBossId(next)).toBeNull();
    // objectives are face-up (not assigned to owners at the deal): proven
    // by "objective-pick" phase — no seat owns any objective yet.
    expect(next.attempt!.camp!.objectives.every((o) => o.ownerSeatId === null)).toBe(true);
  });

  it("blocks every seat's whisper this camp once used", () => {
    const { run, catalog } = setupPoncho();

    const used = applyRunAction(run, "p0", { type: "use-gear", gearId: "jam", targets: [] }, catalog);
    expect(used.ok).toBe(true);
    if (!used.ok) return;

    const atBetweenTricks = advanceTo(used.state, "between-tricks", catalog);
    for (const seatId of SEAT_IDS) {
      const targetSeatId = SEAT_IDS.find((id) => id !== seatId)!;
      const cardId = atBetweenTricks.attempt!.camp!.hands.find((h) => h.seatId === seatId)!.cards[0]!.id;
      const result = applyRunAction(atBetweenTricks, seatId, { type: "whisper", targetSeatId, cardId }, catalog);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBe("whisper_blocked");
    }
  });

  it("D-04: the twist returns on a replay unless Poncho is used again", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "fake-fog", 6: null },
        loadouts: { p0: ["jam"], p1: ["fake-sabotage"] },
      }),
      "pre-deal",
      catalog,
    );

    const usedJam = applyRunAction(run, "p0", { type: "use-gear", gearId: "jam", targets: [] }, catalog);
    expect(usedJam.ok).toBe(true);
    if (!usedJam.ok) return;

    const atBetweenTricks = advanceTo(usedJam.state, "between-tricks", catalog);
    const sabotaged = applyRunAction(
      atBetweenTricks,
      "p1",
      { type: "use-gear", gearId: "fake-sabotage", targets: [] },
      catalog,
    );
    expect(sabotaged.ok).toBe(true);
    if (!sabotaged.ok) return;

    const failedState = sabotaged.state;
    expect(failedState.history.at(-1)!.status).toBe("failed");
    expect(runStatus(failedState)).toBe("in_progress");

    // Ready every seat for the replay.
    let readied = failedState;
    for (const seatId of SEAT_IDS) {
      const result = applyRunAction(readied, seatId, { type: "ready" }, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      readied = result.state;
    }

    expect(runPhase(readied)).toBe("pre-deal");
    expect(readied.attempt!.bossCancelled).toBe(false);
    expect(activeBossId(readied)).toBe("fake-fog");
  });

  it("D-12: at a non-boss camp the deal happens immediately, because Poncho was never pending", () => {
    const catalog = makeCatalog();
    const run = setupRun({
      seatIds: [...SEAT_IDS],
      seed: SEED,
      catalog,
      campNumber: 2 as CampNumber,
      loadouts: { p0: ["jam"] },
    });

    let readied = run;
    for (const seatId of SEAT_IDS) {
      const result = applyRunAction(readied, seatId, { type: "ready" }, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      readied = result.state;
    }

    // p0's Poncho never held up the deal: the run went straight past
    // "pre-deal" to "camp" instead of stopping to wait on it.
    expect(runPhase(readied)).toBe("camp");

    // Directly probing the (hypothetical) pre-deal window at this same
    // non-boss camp is exactly why: canUse refuses with the GEAR-06 reason.
    const preDealSnapshot: RunState = {
      ...readied,
      attempt: { attemptNumber: 1, bossCancelled: false, gearUses: [], effects: [], reveals: [], log: [], camp: null },
    };
    const check = checkUseGear(preDealSnapshot, "p0", "jam", [], catalog);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("There is no boss twist this camp");
  });
});

describe("Energy Tonic (overclock)", () => {
  it("raises only its owner's capacity by 2, and permits equipping the Tonic and a size-3 item together in one set-loadout", () => {
    const catalog = makeCatalog();
    const run = setupRun({
      seatIds: [...SEAT_IDS],
      seed: SEED,
      catalog,
      campNumber: 1 as CampNumber,
      loadouts: { p0: ["overclock", "fake-size-3"] },
    });
    // setupRun equips directly; clear p0's equip to prove set-loadout itself accepts it.
    const owning: RunState = {
      ...run,
      seats: run.seats.map((s) => (s.seatId === "p0" ? { ...s, equippedGearIds: [] } : s)),
    };

    expect(capacityOf(owning, "p0", catalog)).toBe(1);
    expect(capacityOf(owning, "p1", catalog)).toBe(1);

    const withoutTonic = applyRunAction(owning, "p0", { type: "set-loadout", gearIds: ["fake-size-3"] }, catalog);
    expect(withoutTonic.ok).toBe(false);
    if (!withoutTonic.ok) expect(withoutTonic.error).toBe("over_capacity");

    const withTonic = applyRunAction(
      owning,
      "p0",
      { type: "set-loadout", gearIds: ["overclock", "fake-size-3"] },
      catalog,
    );
    expect(withTonic.ok).toBe(true);
    if (!withTonic.ok) return;
    expect(capacityOf(withTonic.state, "p0", catalog)).toBe(3);
    expect(capacityOf(withTonic.state, "p1", catalog)).toBe(1);
  });

  it("stacks failure cost by 1 per equipped Tonic: two owners make a failed camp spend 3 supplies", () => {
    const catalog = makeCatalog();
    const run = setupRun({
      seatIds: [...SEAT_IDS],
      seed: SEED,
      catalog,
      campNumber: 3 as CampNumber,
      bossTwists: { 3: "fake-fail", 6: null },
      loadouts: { p0: ["overclock"], p1: ["overclock"] },
    });

    let readied = run;
    for (const seatId of SEAT_IDS) {
      const result = applyRunAction(readied, seatId, { type: "ready" }, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      readied = result.state;
    }

    // fake-fail forces an immediate failure once dealt.
    expect(readied.history.at(-1)!.status).toBe("failed");
    expect(readied.history.at(-1)!.suppliesSpent).toBe(3);
    expect(readied.supplies).toBe(0);
    expect(runStatus(readied)).toBe("lost");
  });

  it("use-gear on the Tonic gives wrong_window with 'Passive gear is always active'", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber: 2 as CampNumber,
        loadouts: { p0: ["overclock"] },
      }),
      "between-tricks",
      catalog,
    );

    const check = checkUseGear(run, "p0", "overclock", [], catalog);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.error).toBe("wrong_window");
    expect(check.reason).toBe("Passive gear is always active");
  });

  it("overclock.apply is undefined", () => {
    expect(overclock.apply).toBeUndefined();
  });
});
