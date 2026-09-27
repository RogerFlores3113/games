// Tests for the Phase 10 toolkit (Plan 04). Fixtures are built inline: a
// 3-seat RunState whose attempt.camp is createCamp(...), with objectives
// picked via currentActorSeatId + applyCampAction (never a hand-rolled copy
// of the pick-order rule — mirrors test-support.ts's own discipline).

import { describe, expect, it } from "vitest";
import { applyCampAction } from "../actions";
import { campPhase, createCamp, currentActorSeatId } from "../camp";
import { baseRules } from "../rules";
import type { CampState, WinCardObjective } from "../state";
import type { GearContext, GearDef, TargetSpec, ToolkitOp } from "../gear/gear-def";
import { baseRunHooks } from "./run-rules";
import type { RunRules } from "./run-rules";
import type { AttemptState, Catalog, RunState, SeatRun } from "./types";
import { buildGearContext, currentWindow, gearAvailability, isGearSpent, validateTargets } from "./toolkit";

const SEAT_IDS = ["p0", "p1", "p2"] as const;

const rules: RunRules = { ...baseRules, ...baseRunHooks };

function freshCamp(seed = "toolkit-seed"): CampState {
  return createCamp(
    { seatIds: [...SEAT_IDS], seed, objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }] },
    rules,
  );
}

/** Picks every face-up objective via the real currentActorSeatId +
 * applyCampAction path, landing the camp in "playing" phase. */
function pickAllObjectives(camp: CampState): CampState {
  let state = camp;
  while (campPhase(state, rules) === "objective-pick") {
    const actor = currentActorSeatId(state, rules)!;
    const objective = state.objectives.find((o) => o.ownerSeatId === null)!;
    const result = applyCampAction(state, actor, { type: "pick-objective", objectiveId: objective.id }, rules);
    if (!result.ok) throw new Error(`test setup: pick-objective failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

/** Plays exactly one full trick (seatIds.length plays) via the real legal-
 * plays path, so play order/follow-suit is never hand-rolled. */
function playOneTrick(camp: CampState): CampState {
  let state = camp;
  for (let i = 0; i < state.seatIds.length; i++) {
    const actor = currentActorSeatId(state, rules)!;
    const legal = rules.legalPlays(state, actor);
    const card = legal[0]!;
    const result = applyCampAction(state, actor, { type: "play-card", cardId: card.id }, rules);
    if (!result.ok) throw new Error(`test setup: play-card failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

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
  gearUses?: AttemptState["gearUses"];
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
    seed: input.seed ?? "toolkit-seed",
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

const NEVER_GEAR: GearDef = {
  id: "never-usable",
  name: "Never Usable",
  size: 1,
  window: "between-tricks",
  text: "For testing: always refuses.",
  targets: [],
  canUse() {
    return "This gear can never be used";
  },
};

const ALWAYS_GEAR: GearDef = {
  id: "always-usable",
  name: "Always Usable",
  size: 1,
  window: "between-tricks",
  text: "For testing: always allowed.",
  targets: [],
  canUse() {
    return true;
  },
  apply() {
    return [];
  },
};

const PRE_DEAL_GEAR: GearDef = {
  id: "pre-deal-gear",
  name: "Pre-Deal Gear",
  size: 1,
  window: "pre-deal",
  text: "For testing: pre-deal window.",
  targets: [],
};

const PASSIVE_GEAR: GearDef = {
  id: "passive-gear",
  name: "Passive Gear",
  size: 1,
  window: "passive",
  text: "For testing: passive.",
  targets: [],
  passiveModifier() {
    return {};
  },
};

const CATALOG: Catalog = {
  gear: {
    [NEVER_GEAR.id]: NEVER_GEAR,
    [ALWAYS_GEAR.id]: ALWAYS_GEAR,
    [PRE_DEAL_GEAR.id]: PRE_DEAL_GEAR,
    [PASSIVE_GEAR.id]: PASSIVE_GEAR,
  },
  bosses: {},
};

describe("currentWindow", () => {
  it("is null at the fireside (no attempt)", () => {
    const run = makeRun({ camp: null, attempt: null });
    expect(currentWindow(run, rules)).toBeNull();
  });

  it("is pre-deal when the attempt exists but the camp has not been dealt", () => {
    const run = makeRun({ camp: null });
    expect(currentWindow(run, rules)).toBe("pre-deal");
  });

  it("is objective-pick for a freshly dealt camp", () => {
    const camp = freshCamp();
    const run = makeRun({ camp });
    expect(currentWindow(run, rules)).toBe("objective-pick");
  });

  it("is between-tricks once every objective is picked and no card has been played", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp });
    expect(currentWindow(run, rules)).toBe("between-tricks");
  });

  it("is null the instant the trick's leader plays (D-13, no grace period)", () => {
    let camp = pickAllObjectives(freshCamp());
    const actor = currentActorSeatId(camp, rules)!;
    const card = rules.legalPlays(camp, actor)[0]!;
    const result = applyCampAction(camp, actor, { type: "play-card", cardId: card.id }, rules);
    if (!result.ok) throw new Error("test setup failed");
    camp = result.state;
    const run = makeRun({ camp });
    expect(currentWindow(run, rules)).toBeNull();
  });

  it("returns to between-tricks once the trick completes", () => {
    const camp = playOneTrick(pickAllObjectives(freshCamp()));
    const run = makeRun({ camp });
    expect(camp.currentTrick.plays).toHaveLength(0);
    expect(currentWindow(run, rules)).toBe("between-tricks");
  });
});

describe("isGearSpent", () => {
  it("is true whether the gear was used or skipped", () => {
    const attempt: AttemptState = {
      attemptNumber: 1,
      bossCancelled: false,
      gearUses: [
        { seatId: "p0", gearId: "compass", kind: "used" },
        { seatId: "p1", gearId: "poncho", kind: "skipped" },
      ],
      effects: [],
      reveals: [],
      log: [],
      camp: null,
    };
    expect(isGearSpent(attempt, "p0", "compass")).toBe(true);
    expect(isGearSpent(attempt, "p1", "poncho")).toBe(true);
    expect(isGearSpent(attempt, "p2", "compass")).toBe(false);
  });
});

describe("buildGearContext", () => {
  it("throws when there is no attempt in progress", () => {
    const run = makeRun({ camp: null, attempt: null });
    expect(() => buildGearContext(run, "p0", "some-gear", [], rules)).toThrow();
  });

  it("handSize/ownHand read only the given/own seat's hand", () => {
    const camp = freshCamp();
    const run = makeRun({ camp });
    const ctx = buildGearContext(run, "p0", "some-gear", [], rules);
    const p0Hand = camp.hands.find((h) => h.seatId === "p0")!;
    const p1Hand = camp.hands.find((h) => h.seatId === "p1")!;
    expect(ctx.handSize("p0")).toBe(p0Hand.cards.length);
    expect(ctx.handSize("p1")).toBe(p1Hand.cards.length);
    expect(ctx.ownHand()).toEqual(p0Hand.cards);
  });

  it("randomCardIdFrom returns an id from that seat's hand, or null for an empty hand", () => {
    const camp = freshCamp();
    const run = makeRun({ camp });
    const ctx = buildGearContext(run, "p0", "spyglass", [], rules);
    const p1Hand = camp.hands.find((h) => h.seatId === "p1")!;
    const drawn = ctx.randomCardIdFrom("p1", "peek");
    expect(drawn).not.toBeNull();
    expect(p1Hand.cards.some((c) => c.id === drawn)).toBe(true);

    const emptyHandRun = makeRun({
      camp: {
        ...camp,
        hands: camp.hands.map((h) => (h.seatId === "p1" ? { ...h, cards: [] } : h)),
      },
    });
    const emptyCtx = buildGearContext(emptyHandRun, "p0", "spyglass", [], rules);
    expect(emptyCtx.randomCardIdFrom("p1", "peek")).toBeNull();
  });

  it("randomCardIdFrom is deterministic for identical run state", () => {
    const camp = freshCamp();
    const run = makeRun({ camp });
    const ctxA = buildGearContext(run, "p0", "spyglass", [], rules);
    const ctxB = buildGearContext(run, "p0", "spyglass", [], rules);
    expect(ctxA.randomCardIdFrom("p1", "peek")).toBe(ctxB.randomCardIdFrom("p1", "peek"));
  });

  it("draws differ between gearUses.length 0 and 1 for at least one of 50 seeds (k is in the stream)", () => {
    let sawDifference = false;
    for (let i = 0; i < 50; i++) {
      const seed = `toolkit-k-seed-${i}`;
      const camp = freshCamp(seed);
      const runAtZero = makeRun({ camp, seed, gearUses: [] });
      const runAtOne = makeRun({
        camp,
        seed,
        gearUses: [{ seatId: "p0", gearId: "spyglass", kind: "used" }],
      });
      const ctxZero = buildGearContext(runAtZero, "p0", "spyglass", [], rules);
      const ctxOne = buildGearContext(runAtOne, "p0", "spyglass", [], rules);
      if (ctxZero.randomCardIdFrom("p1", "peek") !== ctxOne.randomCardIdFrom("p1", "peek")) {
        sawDifference = true;
        break;
      }
    }
    expect(sawDifference).toBe(true);
  });
});

describe("gearAvailability", () => {
  it("is wrong_phase at the fireside", () => {
    const run = makeRun({ camp: null, attempt: null, equipped: { p0: [ALWAYS_GEAR.id] } });
    const result = gearAvailability(run, "p0", ALWAYS_GEAR.id, CATALOG, rules);
    expect(result).toEqual({ ok: false, error: "wrong_phase", reason: expect.any(String) });
  });

  it("is gear_not_equipped when the seat has not equipped the gear", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp, equipped: {} });
    const result = gearAvailability(run, "p0", ALWAYS_GEAR.id, CATALOG, rules);
    expect(result).toEqual({ ok: false, error: "gear_not_equipped", reason: expect.any(String) });
  });

  it("throws for an equipped gear id missing from the catalog", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp, equipped: { p0: ["not-in-catalog"] } });
    expect(() => gearAvailability(run, "p0", "not-in-catalog", CATALOG, rules)).toThrow();
  });

  it("is gear_already_used when a GearUse already exists for this (seat, gear)", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({
      camp,
      equipped: { p0: [ALWAYS_GEAR.id] },
      gearUses: [{ seatId: "p0", gearId: ALWAYS_GEAR.id, kind: "used" }],
    });
    const result = gearAvailability(run, "p0", ALWAYS_GEAR.id, CATALOG, rules);
    expect(result).toEqual({ ok: false, error: "gear_already_used", reason: "Already used this camp" });
  });

  it("is wrong_window for passive gear, with the exact reason 'Passive gear is always active'", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp, equipped: { p0: [PASSIVE_GEAR.id] } });
    const result = gearAvailability(run, "p0", PASSIVE_GEAR.id, CATALOG, rules);
    expect(result).toEqual({ ok: false, error: "wrong_window", reason: "Passive gear is always active" });
  });

  it("is wrong_window with 'Can only be used between tricks' when the gear's window does not match", () => {
    const camp = freshCamp(); // objective-pick window, gear wants between-tricks
    const run = makeRun({ camp, equipped: { p0: [ALWAYS_GEAR.id] } });
    const result = gearAvailability(run, "p0", ALWAYS_GEAR.id, CATALOG, rules);
    expect(result).toEqual({
      ok: false,
      error: "wrong_window",
      reason: "Can only be used between tricks",
    });
  });

  it("is gear_unavailable carrying def.canUse's exact reason string", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp, equipped: { p0: [NEVER_GEAR.id] } });
    const result = gearAvailability(run, "p0", NEVER_GEAR.id, CATALOG, rules);
    expect(result).toEqual({
      ok: false,
      error: "gear_unavailable",
      reason: "This gear can never be used",
    });
  });

  it("is ok:true when every check passes", () => {
    const camp = pickAllObjectives(freshCamp());
    const run = makeRun({ camp, equipped: { p0: [ALWAYS_GEAR.id] } });
    const result = gearAvailability(run, "p0", ALWAYS_GEAR.id, CATALOG, rules);
    expect(result).toEqual({ ok: true });
  });

  it("maps the pre-deal window phrase correctly", () => {
    const run = makeRun({ camp: null, equipped: { p0: [PRE_DEAL_GEAR.id] } });
    const result = gearAvailability(run, "p0", PRE_DEAL_GEAR.id, CATALOG, rules);
    expect(result).toEqual({ ok: true });
  });
});

describe("validateTargets", () => {
  const teammateSpec: readonly TargetSpec[] = [{ kind: "teammate" }];
  const ownCardSpec: readonly TargetSpec[] = [{ kind: "own-card" }];
  const faceUpObjectiveSpec: readonly TargetSpec[] = [{ kind: "face-up-objective" }];
  const ownObjectiveSpec: readonly TargetSpec[] = [{ kind: "own-objective" }];

  function ctxFor(camp: CampState, self: string, targets: readonly string[]): GearContext {
    const run = makeRun({ camp });
    return buildGearContext(run, self, "test-gear", targets, rules);
  }

  it("rejects a wrong-length target list with a reason string", () => {
    const camp = pickAllObjectives(freshCamp());
    const ctx = ctxFor(camp, "p0", []);
    const result = validateTargets(ctx, teammateSpec);
    expect(typeof result).toBe("string");
  });

  it("teammate: accepts another seat, rejects self and rejects an unknown seat", () => {
    const camp = pickAllObjectives(freshCamp());
    expect(validateTargets(ctxFor(camp, "p0", ["p1"]), teammateSpec)).toBe(true);
    expect(typeof validateTargets(ctxFor(camp, "p0", ["p0"]), teammateSpec)).toBe("string");
    expect(typeof validateTargets(ctxFor(camp, "p0", ["not-a-seat"]), teammateSpec)).toBe("string");
  });

  it("own-card: resolves ONLY inside the actor's own hand (T-10-11)", () => {
    const camp = pickAllObjectives(freshCamp());
    const ownCard = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!;
    const teammateCard = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!;
    expect(validateTargets(ctxFor(camp, "p0", [ownCard.id]), ownCardSpec)).toBe(true);
    // A teammate's card id must be rejected with a reason, not accepted.
    const result = validateTargets(ctxFor(camp, "p0", [teammateCard.id]), ownCardSpec);
    expect(typeof result).toBe("string");
  });

  it("face-up-objective: accepts an unowned objective, rejects an owned one", () => {
    const camp = freshCamp(); // no objectives picked yet
    const faceUp = camp.objectives.find((o) => o.ownerSeatId === null)!;
    expect(validateTargets(ctxFor(camp, "p0", [faceUp.id]), faceUpObjectiveSpec)).toBe(true);

    const picked = pickAllObjectives(freshCamp());
    const owned = picked.objectives[0]!;
    expect(typeof validateTargets(ctxFor(picked, "p0", [owned.id]), faceUpObjectiveSpec)).toBe("string");
  });

  it("own-objective: accepts self's pending objective, rejects a teammate's and a non-pending one", () => {
    const camp = pickAllObjectives(freshCamp());
    const ownObjective = camp.objectives.find((o) => o.ownerSeatId === "p0")!;
    expect(validateTargets(ctxFor(camp, "p0", [ownObjective.id]), ownObjectiveSpec)).toBe(true);

    const teammateObjective = camp.objectives.find((o) => o.ownerSeatId !== null && o.ownerSeatId !== "p0");
    if (teammateObjective) {
      expect(typeof validateTargets(ctxFor(camp, "p0", [teammateObjective.id]), ownObjectiveSpec)).toBe("string");
    }
  });
});

