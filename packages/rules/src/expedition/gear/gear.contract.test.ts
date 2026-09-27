// Gear catalogue contract (Plan 10-15, ENG-02, GEAR-01..06). Iterates
// Object.entries(GEAR_REGISTRY) ONLY — never a hand list — so an eleventh
// gear item registered later (ENG-01: one file plus one registry line) is
// covered automatically with zero edits to this file. Mirrors
// boss/boss.contract.test.ts's own ENG-02 shape (Plan 10-14, same wave).
//
// The per-seat leak check below (spec §8 "no view leak after apply") calls
// the real toExpeditionPlayerView/checkExpeditionViewForLeaks
// (adapter/view-leak-check.ts, Plan 11-04) for every seat plus an unseated
// "spectator" viewer after every accepted use, proving a registered gear's
// applied ToolkitOps never leak a card through the actual per-seat
// projection — not merely a structural RunState-level shape check.
//
// The contract catalog's "contract-boss" twist (a no-op BossDef) lets Rain
// Poncho (jam.ts's canUse checks activeBossId) find an active twist to
// cancel without depending on Plan 10-14's BOSS_REGISTRY (same wave, per
// this plan's own <interfaces> note).

import { describe, expect, it } from "vitest";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { applyToolkitOps, campCardIds } from "../run/toolkit";
import { checkUseGear } from "../run/use-gear";
import { HOOK_NAMES } from "../run/run-rules";
import { evaluateObjective } from "../objectives";
import { GEAR_REGISTRY } from "./registry";
import { GEAR_WINDOWS, TARGET_KINDS } from "./gear-def";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import type { GearDef, TargetSpec } from "./gear-def";
import type { CampState } from "../state";
import type { Catalog, CampNumber, RunState } from "../run/types";

function makeCatalog(): Catalog {
  return {
    gear: GEAR_REGISTRY,
    bosses: { "contract-boss": { id: "contract-boss", name: "Contract", text: "no-op", modifiers: {} } },
  };
}

/** Pure shape checks for a GearDef: an integer size >= 0, a known
 * GearWindow, every target's kind a known TargetKind, and passive <=> no
 * apply/no targets. Used both per-entry against every real registered gear
 * and, in the non-vacuity test below, against a deliberately broken fake
 * def — this is what proves the check itself is not vacuous. */
function checkGearDef(def: GearDef): string[] {
  const violations: string[] = [];

  if (!Number.isInteger(def.size) || def.size < 0) {
    violations.push(`${def.id}: size must be a non-negative integer, got ${JSON.stringify(def.size)}`);
  }

  const knownWindows: readonly string[] = GEAR_WINDOWS;
  if (!knownWindows.includes(def.window)) {
    violations.push(`${def.id}: window "${def.window}" is not a known GearWindow`);
  }

  const knownTargetKinds: readonly string[] = TARGET_KINDS;
  for (const spec of def.targets) {
    if (!knownTargetKinds.includes(spec.kind)) {
      violations.push(`${def.id}: target kind "${spec.kind}" is not a known TargetKind`);
    }
  }

  const isPassive = def.window === "passive";
  if (isPassive) {
    if (def.apply !== undefined) violations.push(`${def.id}: passive gear must not define apply`);
    if (def.targets.length !== 0) violations.push(`${def.id}: passive gear must not declare targets`);
  } else if (def.apply === undefined) {
    violations.push(`${def.id}: non-passive gear must define apply`);
  }

  return violations;
}

/** The cartesian product of `pools`, preserving pool order. `[]` in ->
 * `[[]]` out (one empty combination), matching a zero-target GearDef —
 * mirrors run-test-support.ts's own (unexported) helper of the same name. */
function cartesian(pools: readonly (readonly string[])[]): string[][] {
  return pools.reduce<string[][]>(
    (acc, pool) => acc.flatMap((prefix) => pool.map((item) => [...prefix, item])),
    [[]],
  );
}

/** Per-TargetSpec candidate pools for `specs`, in declaration order: every
 * teammate (self excluded); the actor's first 3 own cards; every face-up
 * objective; the actor's own pending objectives — mirrors
 * run-test-support.ts's own (unexported) targetOptionsFor. */
function targetOptionsFor(
  specs: readonly TargetSpec[],
  run: RunState,
  camp: CampState,
  selfSeatId: string,
): string[][] {
  return specs.map((spec) => {
    if (spec.kind === "teammate") {
      return run.seatIds.filter((id) => id !== selfSeatId);
    }
    if (spec.kind === "own-card") {
      const hand = camp.hands.find((h) => h.seatId === selfSeatId);
      return hand ? hand.cards.slice(0, 3).map((c) => c.id) : [];
    }
    if (spec.kind === "face-up-objective") {
      return camp.objectives.filter((o) => o.ownerSeatId === null).map((o) => o.id);
    }
    // own-objective
    return camp.objectives
      .filter((o) => o.ownerSeatId === selfSeatId && evaluateObjective(camp, o) === "pending")
      .map((o) => o.id);
  });
}

/** Every candidate target combination for `def` at `selfSeatId`: `[[]]` for
 * a zero-target def (still one, empty, combination); `[]` when the def
 * declares targets but there is no camp to draw candidates from (never
 * happens for a non-passive def whose window has a camp — pre-deal is the
 * only camp-less window, and every v1 pre-deal gear is zero-target). */
function candidateTargetsFor(def: GearDef, run: RunState, selfSeatId: string): string[][] {
  if (def.targets.length === 0) return [[]];
  const camp = run.attempt?.camp ?? null;
  if (camp === null) return [];
  return cartesian(targetOptionsFor(def.targets, run, camp, selfSeatId));
}

/** Searches seats in `run.seatIds` order, then target combinations in
 * `candidateTargetsFor` order, collecting EVERY (seatId, targets) pair
 * `checkUseGear` accepts (WR-01: not just the first). `[]` when no legal
 * combination exists in this fixture (a non-vacuity failure the calling test
 * asserts against). */
function findUsableFixtures(
  run: RunState,
  def: GearDef,
  catalog: Catalog,
): Array<{ seatId: string; targets: string[] }> {
  const fixtures: Array<{ seatId: string; targets: string[] }> = [];
  for (const seatId of run.seatIds) {
    for (const targets of candidateTargetsFor(def, run, seatId)) {
      if (checkUseGear(run, seatId, def.id, targets, catalog).ok) {
        fixtures.push({ seatId, targets });
      }
    }
  }
  return fixtures;
}

/** setupRun with every seat equipped with only `id`, at campNumber 6 (the
 * final camp — a success settles with no campNumber/seats change, per this
 * plan's own <interfaces> note), with camp 6's twist fixed to the no-op
 * "contract-boss" def. */
function fixtureFor(id: string, playerCount: number, catalog: Catalog): RunState {
  const seatIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  const loadouts = Object.fromEntries(seatIds.map((seatId) => [seatId, [id]]));
  return setupRun({
    seatIds,
    seed: `contract-${id}-${playerCount}`,
    catalog,
    campNumber: 6 as CampNumber,
    loadouts,
    bossTwists: { 3: null, 6: "contract-boss" },
  });
}

/** The run-scoped fields (everything on RunState but `readySeatIds` and
 * `attempt`) a legal gear use must leave untouched, except that `history`
 * may grow by exactly one entry (D-01/D-02-independent: a camp settling
 * during the action). */
function runScopedSnapshot(run: RunState) {
  return {
    seed: run.seed,
    seatIds: run.seatIds,
    campNumber: run.campNumber,
    supplies: run.supplies,
    seats: run.seats,
    bossTwists: run.bossTwists,
    history: run.history,
  };
}

/** Applies one accepted (seatId, targets) use of gear `id` against `dealt`
 * and asserts the full per-use contract: applies without throwing or
 * rejecting (WR-01: checkUseGear(...).ok implies the use applies),
 * determinism across JSON-cloned inputs, card conservation, JSON
 * round-tripping, run-scoped-field stability (except a one-entry `history`
 * growth), GEAR-05 finality (gear_already_used on a second use), and the
 * real per-seat leak check (spec §8 "no view leak after apply") for every
 * seat plus an unseated viewer. `dealt` is never mutated — every fixture
 * starts from the same unmodified state. */
function assertLegalUseContract(
  dealt: RunState,
  id: string,
  seatId: string,
  targets: string[],
  catalog: Catalog,
): void {
  const beforeCardIds = dealt.attempt!.camp ? campCardIds(dealt.attempt!.camp) : null;
  const before = runScopedSnapshot(dealt);

  let result;
  try {
    result = applyRunAction(dealt, seatId, { type: "use-gear", gearId: id, targets }, catalog);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `gear.contract: ${id} checkUseGear accepted ${JSON.stringify({ seatId, targets })} but applyRunAction threw: ${message}`,
    );
  }
  if (!result.ok) {
    throw new Error(
      `gear.contract: ${id} use-gear rejected for fixture (${JSON.stringify({ seatId, targets })}): ${result.error}`,
    );
  }
  const applied = result.state;

  // determinism: two independent JSON-cloned inputs give deep-equal outputs
  // (RunState is plain JSON data).
  const cloneA: RunState = JSON.parse(JSON.stringify(dealt));
  const cloneB: RunState = JSON.parse(JSON.stringify(dealt));
  let resultA;
  let resultB;
  try {
    resultA = applyRunAction(cloneA, seatId, { type: "use-gear", gearId: id, targets }, catalog);
    resultB = applyRunAction(cloneB, seatId, { type: "use-gear", gearId: id, targets }, catalog);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `gear.contract: ${id} checkUseGear accepted ${JSON.stringify({ seatId, targets })} but applyRunAction threw: ${message}`,
    );
  }
  if (!resultA.ok || !resultB.ok) {
    throw new Error("gear.contract: determinism check: a cloned application was rejected");
  }
  expect(resultA).toEqual(resultB);

  // conservation
  if (beforeCardIds !== null && applied.attempt !== null && applied.attempt.camp !== null) {
    expect(campCardIds(applied.attempt.camp)).toEqual(beforeCardIds);
  }

  // round-trips through JSON
  expect(JSON.parse(JSON.stringify(applied))).toEqual(applied);

  // attempt-scoped-only fields: everything but `history` is untouched;
  // `history` either holds or grows by exactly one entry (a camp settling
  // during the action, as Camouflage's remove-objective can, is also
  // acceptable).
  const after = runScopedSnapshot(applied);
  if (after.history.length === before.history.length + 1) {
    expect({ ...after, history: before.history }).toEqual(before);
  } else {
    expect(after).toEqual(before);
  }

  // marks the gear used (GEAR-05 finality) — only meaningful while the
  // attempt this use happened in is still open. A use that itself settles
  // the camp (history grew above) leaves no attempt to re-check against.
  if (applied.attempt !== null) {
    expect(checkUseGear(applied, seatId, id, targets, catalog)).toEqual({
      ok: false,
      error: "gear_already_used",
      reason: "Already used this camp",
    });
  }

  // Real per-seat leak check (spec §8 "no view leak after apply") — runs
  // for every seat plus an unseated viewer regardless of whether this use
  // also settled the camp at the fireside (a settling use must not leak
  // there either).
  for (const id_ of [...applied.seatIds, "spectator"]) {
    const view = toExpeditionPlayerView(applied, id_, catalog);
    const secrets = secretsForExpeditionSeat(applied, id_, catalog, applied.seed);
    const reasons = checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
    expect(reasons).toEqual([]);
  }
}

describe("GEAR_REGISTRY (ENG-01)", () => {
  it("has exactly the ten v1 ids, each key equal to its def's own id", () => {
    expect(Object.keys(GEAR_REGISTRY).sort()).toEqual(
      ["broadcast", "chatter", "commandeer", "ghost", "jam", "overclock", "peek", "pickpocket", "reassign", "reroll"].sort(),
    );
    for (const [key, def] of Object.entries(GEAR_REGISTRY)) {
      expect(def.id).toBe(key);
    }
  });
});

for (const [id, def] of Object.entries(GEAR_REGISTRY)) {
  describe(`gear catalogue contract: ${id}`, () => {
    it("passes checkGearDef with no violations", () => {
      expect(checkGearDef(def)).toEqual([]);
    });

    if (def.window === "passive") {
      it("use-gear on passive gear is refused with wrong_window (always active)", () => {
        const catalog = makeCatalog();
        const run = advanceTo(
          setupRun({
            seatIds: ["p0", "p1", "p2"],
            seed: `contract-${id}-passive`,
            catalog,
            campNumber: 6 as CampNumber,
            loadouts: { p0: [id] },
            bossTwists: { 3: null, 6: "contract-boss" },
          }),
          "between-tricks",
          catalog,
        );
        expect(checkUseGear(run, "p0", id, [], catalog)).toEqual({
          ok: false,
          error: "wrong_window",
          reason: "Passive gear is always active",
        });
      });

      it("passiveModifier's returned RuleModifier keys are all known HookNames", () => {
        expect(def.passiveModifier).toBeDefined();
        const modifier = def.passiveModifier!("p0");
        const knownHookNames: readonly string[] = HOOK_NAMES;
        for (const key of Object.keys(modifier)) {
          expect(knownHookNames).toContain(key);
        }
      });
    } else {
      for (const playerCount of [3, 4, 5] as const) {
        it(`playerCount=${playerCount}: every usable target combination applies deterministically, conserves cards, round-trips through JSON, changes only attempt-scoped fields, marks the gear used, and leaks nothing`, () => {
          const catalog = makeCatalog();
          const dealt = advanceTo(
            fixtureFor(id, playerCount, catalog),
            def.window as "pre-deal" | "objective-pick" | "between-tricks",
            catalog,
          );

          const fixtures = findUsableFixtures(dealt, def, catalog);
          expect(fixtures.length).toBeGreaterThan(0);

          for (const { seatId, targets } of fixtures) {
            assertLegalUseContract(dealt, id, seatId, targets, catalog);
          }
        });
      }
    }
  });
}

describe("non-vacuity", () => {
  it("every real registered gear def is violation-free", () => {
    for (const def of Object.values(GEAR_REGISTRY)) {
      expect(checkGearDef(def)).toEqual([]);
    }
  });

  it("a fake def with size -1, window \"sometimes\" and target kind \"player-pair\" is flagged (the check is not vacuous)", () => {
    const fakeDef = {
      id: "fake",
      name: "Fake Gear",
      size: -1,
      window: "sometimes",
      text: "Fake gear for the non-vacuity check.",
      targets: [{ kind: "player-pair" }],
      apply: () => [],
    } as unknown as GearDef;

    const violations = checkGearDef(fakeDef);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes("size"))).toBe(true);
    expect(violations.some((v) => v.includes("window"))).toBe(true);
    expect(violations.some((v) => v.includes("target kind"))).toBe(true);
  });

  it("applyToolkitOps throws on a reveal to nobody (empty audience)", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: ["p0", "p1", "p2"],
        seed: "contract-nonvacuity-reveal",
        catalog,
        campNumber: 6 as CampNumber,
        bossTwists: { 3: null, 6: "contract-boss" },
      }),
      "between-tricks",
      catalog,
    );
    expect(() =>
      applyToolkitOps(run, "p0", "fake-gear", [{ op: "reveal", cardId: "does-not-matter", audience: [] }]),
    ).toThrow();
  });

  it("applyToolkitOps throws on a move-card of a card not in the from-hand", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: ["p0", "p1", "p2"],
        seed: "contract-nonvacuity-move",
        catalog,
        campNumber: 6 as CampNumber,
        bossTwists: { 3: null, 6: "contract-boss" },
      }),
      "between-tricks",
      catalog,
    );
    expect(() =>
      applyToolkitOps(run, "p0", "fake-gear", [
        { op: "move-card", cardId: "not-a-real-card-id", fromSeatId: "p0", toSeatId: "p1" },
      ]),
    ).toThrow();
  });
});
