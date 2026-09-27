// Tests for run/use-gear.ts (Plan 10-06: the generic checkUseGear/
// applyUseGear pipeline). Fixtures mirror whisper.test.ts's discipline: a
// hand-built 3-seat RunState whose attempt.camp is createCamp(...), with
// objectives picked via the real currentActorSeatId + applyCampAction path.
// Fake gear is declared inline per the plan's behavior list.

import { describe, expect, it } from "vitest";
import { applyCampAction } from "../actions";
import { campPhase, createCamp, currentActorSeatId } from "../camp";
import { baseRules } from "../rules";
import type { CampState } from "../state";
import type { GearDef } from "../gear/gear-def";
import { baseRunHooks, type RunRules } from "./run-rules";
import type { AttemptState, Catalog, GearUse, RunState, SeatRun } from "./types";
import { applyUseGear, checkUseGear } from "./use-gear";

const SEAT_IDS = ["p0", "p1", "p2"] as const;

const CORE_RULES: RunRules = { ...baseRules, ...baseRunHooks };

function freshCamp(seed = "use-gear-seed"): CampState {
  return createCamp(
    { seatIds: [...SEAT_IDS], seed, objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }] },
    CORE_RULES,
  );
}

function pickAllObjectives(camp: CampState): CampState {
  let state = camp;
  while (campPhase(state, CORE_RULES) === "objective-pick") {
    const actor = currentActorSeatId(state, CORE_RULES)!;
    const objective = state.objectives.find((o) => o.ownerSeatId === null)!;
    const result = applyCampAction(state, actor, { type: "pick-objective", objectiveId: objective.id }, CORE_RULES);
    if (!result.ok) throw new Error(`test setup: pick-objective failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

function betweenTricksCamp(seed?: string): CampState {
  return pickAllObjectives(freshCamp(seed));
}

const FAKE_PEEK: GearDef = {
  id: "fake-peek",
  name: "Fake Peek",
  size: 1,
  window: "between-tricks",
  text: "",
  targets: [{ kind: "teammate" }],
  apply(ctx) {
    const target = ctx.targets[0]!;
    const cardId = ctx.randomCardIdFrom(target, "peek");
    if (cardId === null) return [];
    return [{ op: "reveal", cardId, audience: [ctx.self] }];
  },
};

const FAKE_LEAD: GearDef = {
  id: "fake-lead",
  name: "Fake Lead",
  size: 1,
  window: "between-tricks",
  text: "",
  targets: [],
  apply(ctx) {
    return [{ op: "set-next-leader", seatId: ctx.self }];
  },
};

const FAKE_PRE: GearDef = {
  id: "fake-pre",
  name: "Fake Pre",
  size: 1,
  window: "pre-deal",
  text: "",
  targets: [],
  apply() {
    return [{ op: "cancel-boss-twist" }];
  },
};

const FAKE_BLOCKED: GearDef = {
  id: "fake-blocked",
  name: "Fake Blocked",
  size: 1,
  window: "between-tricks",
  text: "",
  targets: [],
  canUse() {
    return "Not now";
  },
  apply() {
    return [];
  },
};

const FAKE_PASSIVE: GearDef = {
  id: "fake-passive",
  name: "Fake Passive",
  size: 1,
  window: "passive",
  text: "",
  targets: [],
  passiveModifier() {
    return {};
  },
};

const FAKE_INVALID: GearDef = {
  id: "fake-invalid",
  name: "Fake Invalid",
  size: 1,
  window: "between-tricks",
  text: "",
  targets: [],
  apply() {
    return [{ op: "reveal", cardId: "does-not-matter", audience: ["ghost-seat"] }];
  },
};

function catalogWith(...defs: readonly GearDef[]): Catalog {
  const gear: Record<string, GearDef> = {};
  for (const def of defs) gear[def.id] = def;
  return { gear, bosses: {} };
}

const FULL_CATALOG = catalogWith(FAKE_PEEK, FAKE_LEAD, FAKE_PRE, FAKE_BLOCKED, FAKE_PASSIVE, FAKE_INVALID);

function makeSeats(equipped: Readonly<Record<string, readonly string[]>> = {}): readonly SeatRun[] {
  return SEAT_IDS.map((seatId) => ({
    seatId,
    ownedGearIds: equipped[seatId] ?? [],
    equippedGearIds: equipped[seatId] ?? [],
    draftOffer: null,
  }));
}

function makeRun(input: {
  camp: CampState | null;
  attempt?: AttemptState | null;
  equipped?: Readonly<Record<string, readonly string[]>>;
  gearUses?: readonly GearUse[];
  seed?: string;
}): RunState {
  const attempt: AttemptState | null =
    input.attempt !== undefined
      ? input.attempt
      : {
          attemptNumber: 1,
          bossCancelled: false,
          gearUses: input.gearUses ?? [],
          effects: [],
          reveals: [],
          log: [],
          camp: input.camp,
        };

  return {
    seed: input.seed ?? "use-gear-seed",
    seatIds: [...SEAT_IDS],
    campNumber: 1,
    supplies: 10,
    seats: makeSeats(input.equipped),
    bossTwists: { 3: null, 6: null },
    readySeatIds: [],
    attempt,
    history: [],
  };
}

describe("checkUseGear / applyUseGear", () => {
  it("p0 with fake-peek equipped, between tricks, targets [p1] succeeds", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-peek"] } });

    const result = applyUseGear(run, "p0", { gearId: "fake-peek", targets: ["p1"] }, FULL_CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const attempt = result.state.attempt!;
    expect(attempt.reveals).toHaveLength(1);
    const reveal = attempt.reveals[0]!;
    expect(reveal.audience).toEqual(["p0"]);
    expect(reveal.source).toBe("fake-peek");
    const p1CardIds = camp.hands.find((h) => h.seatId === "p1")!.cards.map((c) => c.id);
    expect(p1CardIds).toContain(reveal.cardId);
    expect(attempt.gearUses).toContainEqual({ seatId: "p0", gearId: "fake-peek", kind: "used" });
    expect(attempt.log).toContainEqual({
      event: "use-gear",
      actorSeatId: "p0",
      subjectSeatIds: ["p1"],
      gearId: "fake-peek",
      audience: "public",
    });
  });

  it("the same use again is rejected with gear_already_used (GEAR-05 finality)", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-peek"] } });
    const first = applyUseGear(run, "p0", { gearId: "fake-peek", targets: ["p1"] }, FULL_CATALOG);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyUseGear(first.state, "p0", { gearId: "fake-peek", targets: ["p1"] }, FULL_CATALOG);
    expect(second).toEqual({ ok: false, error: "gear_already_used" });
  });

  it("not equipped is rejected with gear_not_equipped", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: {} });
    const result = checkUseGear(run, "p0", "fake-peek", ["p1"], FULL_CATALOG);
    expect(result).toEqual({ ok: false, error: "gear_not_equipped", reason: "Not equipped" });
  });

  it("the wrong window (fake-peek during objective-pick) is rejected with wrong_window", () => {
    const camp = freshCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-peek"] } });
    const actor = currentActorSeatId(camp, CORE_RULES)!;
    const result = checkUseGear(run, actor, "fake-peek", ["p1"], FULL_CATALOG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("wrong_window");
  });

  it("fake-blocked is rejected with gear_unavailable and reason 'Not now' (GEAR-06)", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-blocked"] } });
    const result = checkUseGear(run, "p0", "fake-blocked", [], FULL_CATALOG);
    expect(result).toEqual({ ok: false, error: "gear_unavailable", reason: "Not now" });
  });

  it("fake-passive is rejected with wrong_window and reason 'Passive gear is always active'", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-passive"] } });
    const result = checkUseGear(run, "p0", "fake-passive", [], FULL_CATALOG);
    expect(result).toEqual({ ok: false, error: "wrong_window", reason: "Passive gear is always active" });
  });

  it("targets [p0] (self as teammate) is rejected with invalid_target", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-peek"] } });
    const result = checkUseGear(run, "p0", "fake-peek", ["p0"], FULL_CATALOG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_target");
  });

  it("a targets value that is not an array of strings is rejected with invalid_target", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-peek"] } });
    const result = checkUseGear(run, "p0", "fake-peek", { not: "an array" }, FULL_CATALOG);
    expect(result).toEqual({ ok: false, error: "invalid_target", reason: "Invalid targets" });
  });

  it("is deterministic: applying the same action to two structuredClone copies gives deep-equal results", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-peek"] } });
    const copyA = structuredClone(run);
    const copyB = structuredClone(run);

    const resultA = applyUseGear(copyA, "p0", { gearId: "fake-peek", targets: ["p1"] }, FULL_CATALOG);
    const resultB = applyUseGear(copyB, "p0", { gearId: "fake-peek", targets: ["p1"] }, FULL_CATALOG);

    expect(resultA).toEqual(resultB);
  });

  it("replacing the attempt with a fresh AttemptState makes fake-peek usable again (RUN-06)", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-peek"] } });
    const first = applyUseGear(run, "p0", { gearId: "fake-peek", targets: ["p1"] }, FULL_CATALOG);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const replayCamp = betweenTricksCamp("replay-seed");
    const freshAttempt: AttemptState = {
      attemptNumber: 2,
      bossCancelled: false,
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      camp: replayCamp,
    };
    const replayRun: RunState = { ...first.state, attempt: freshAttempt };

    const second = applyUseGear(replayRun, "p0", { gearId: "fake-peek", targets: ["p1"] }, FULL_CATALOG);
    expect(second.ok).toBe(true);
  });

  it("also covers fake-lead (no targets) and fake-pre (pre-deal window) as legal uses", () => {
    const camp = betweenTricksCamp();
    const leadRun = makeRun({ camp, equipped: { p0: ["fake-lead"] } });
    const leadResult = applyUseGear(leadRun, "p0", { gearId: "fake-lead", targets: [] }, FULL_CATALOG);
    expect(leadResult.ok).toBe(true);
    if (leadResult.ok) {
      expect(leadResult.state.attempt!.camp!.currentTrick.leaderSeatId).toBe("p0");
    }

    const preRun = makeRun({
      camp: null,
      equipped: { p0: ["fake-pre"] },
    });
    const preResult = applyUseGear(preRun, "p0", { gearId: "fake-pre", targets: [] }, FULL_CATALOG);
    expect(preResult.ok).toBe(true);
    if (preResult.ok) {
      expect(preResult.state.attempt!.bossCancelled).toBe(true);
    }
  });

  it("a gear whose apply returns an invariant-violating op throws, and the input state is untouched", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp, equipped: { p0: ["fake-invalid"] } });
    const before = structuredClone(run);

    expect(() => applyUseGear(run, "p0", { gearId: "fake-invalid", targets: [] }, FULL_CATALOG)).toThrow();
    expect(run).toEqual(before);
  });
});
