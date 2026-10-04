// Whole-run fast-check simulation properties (RUN-07): arbitrary seeds, 3/4/5
// players, short/standard/long runs, random starting camps,
// random characters, upgrades and items drawn from the production CATALOG, driven by
// random bots through driveRun, which applies every step through the real
// applyRunAction transition (the only dispatcher in the run layer).
//
// The safety property also runs the per-seat leak checker (COMM-03/ENG-03)
// at EVERY recorded state, spectator included (the live seed-substring scan
// lives in adapter/view.property.test.ts, which uses 32-hex seeds; arbitrary
// strings here would match it by accident). A second property drives runs
// from muster, through drafts, with no hand-built crew.
//
// Never uses the platform's non-seeded random API: every random choice comes
// from fast-check's own seeded generation; the run itself draws exclusively
// from run/rng.ts's seeded streams (A1).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import { checkRunState } from "../dev/check";
import { DEV_SHORTCUTS } from "../dev/shortcuts";
import { CATALOG } from "./catalog";
import { rulesFor } from "./compose";
import { attemptOf } from "./attempt";
import { RUN_LENGTHS, SUPPLIES_MAX } from "./balance";
import { createRun, runStatus } from "./lifecycle";
import { advanceTo, driveRun, enumerateLegalRunActions, replayRun, setupRun } from "./run-test-support";
import { campStack, specOf } from "./stack";
import { applyRunAction } from "./stages/registry";
import { campCardIds } from "./toolkit";
import type { RunLength, RunState } from "./types";
import { defIdOf } from "./usage";
import { currentWindow } from "./windows";

const CHARACTER_IDS = Object.keys(CATALOG.characters);
const ITEM_IDS = Object.keys(CATALOG.items);

let leakViewsChecked = 0;

// Whole random runs, shop and draft moves included, can pass the 5 s default
// when the full suite shares the machine.
const WHOLE_RUN_TIMEOUT_MS = 30_000;

function seatIdsFor(seatCount: number): string[] {
  return Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
}

type RunInput = {
  seatIds: string[];
  seed: string;
  choices: number[];
  length: RunLength;
  startCamp: number;
  characters: Record<string, string>;
  upgrades: Record<string, string>;
  items: Record<string, string[]>;
};

const choicesArb = fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 64 });

const lengthArb = fc.constantFrom<RunLength>("short", "standard", "long");

const runInputArb: fc.Arbitrary<RunInput> = fc.tuple(fc.constantFrom(3, 4, 5), lengthArb).chain(([seatCount, length]) => {
  const seatIds = seatIdsFor(seatCount);
  return fc
    .record({
      seed: fc.string({ minLength: 1 }),
      choices: choicesArb,
      length: fc.constant(length),
      startCamp: fc.integer({ min: 1, max: RUN_LENGTHS[length].camps }),
      crew: fc.shuffledSubarray(CHARACTER_IDS, { minLength: seatCount, maxLength: seatCount }),
      upgradePicks: fc.tuple(...seatIds.map(() => fc.constantFrom(-1, 0, 1))),
      picks: fc.tuple(...seatIds.map(() => fc.array(fc.constantFrom(...ITEM_IDS), { maxLength: 4 }))),
    })
    .map(({ crew, upgradePicks, picks, ...rest }) => {
      const characters = Object.fromEntries(seatIds.map((seatId, i) => [seatId, crew[i]!]));
      // An upgrade is only a legal pick for a seat whose character it belongs to.
      const upgrades = Object.fromEntries(
        seatIds.flatMap((seatId, i) => (upgradePicks[i] === -1 ? [] : [[seatId, CATALOG.characters[crew[i]!]!.upgrades[upgradePicks[i]!]!.id]])),
      );
      const items = Object.fromEntries(seatIds.map((seatId, i) => [seatId, picks[i]!]));
      return { seatIds, characters, upgrades, items, ...rest };
    });
});

function build(input: RunInput): RunState {
  return setupRun({
    seatIds: input.seatIds,
    seed: input.seed,
    catalog: CATALOG,
    length: input.length,
    camp: input.startCamp,
    characters: input.characters,
    upgrades: input.upgrades,
    items: input.items,
  });
}

function checkRun(states: readonly RunState[]): void {
  const firstDealtIdsByAttempt = new Map<string, readonly string[]>();

  for (const state of states) {
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);

    expect(state.supplies).toBeGreaterThanOrEqual(0);
    expect(state.supplies).toBeLessThanOrEqual(SUPPLIES_MAX);

    // Instances, equipped sets, offers, upgrades and cards are all ones the engine could produce.
    expect(checkRunState(state, CATALOG)).toEqual([]);

    for (const id of [...state.seatIds, "spectator"]) {
      const view = toExpeditionPlayerView(state, id, CATALOG);
      const secrets = secretsForExpeditionSeat(state, id, CATALOG);
      expect(checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets })).toEqual([]);
      leakViewsChecked++;
    }

    const attempt = attemptOf(state);
    if (attempt !== null && state.stage.tag === "camp") {
      const ids = campCardIds(attempt.camp);
      expect(new Set(ids).size).toBe(ids.length);
      const key = `${state.stage.camp.index}:${attempt.attemptNumber}`;
      const first = firstDealtIdsByAttempt.get(key);
      if (first === undefined) firstDealtIdsByAttempt.set(key, ids);
      else expect(ids).toEqual(first);
    }
  }

  for (const entry of states[states.length - 1]!.history) {
    if (entry.status === "failed") expect(entry.suppliesSpent).toBeGreaterThanOrEqual(1);
    else expect(entry.suppliesSpent).toBe(0);
  }
}

describe("property: whole-run simulation (RUN-07)", () => {
  it("replays byte-for-byte from seed + action log, ends, and holds every whole-run safety invariant at every step", () => {
    fc.assert(
      fc.property(runInputArb, (input) => {
        const initial = build(input);
        const { states, log } = driveRun(initial, input.choices, CATALOG);

        expect(replayRun(initial, log, CATALOG)).toEqual(states);
        expect(runStatus(states[states.length - 1]!)).not.toBe("in_progress");
        checkRun(states);
      }),
      { numRuns: 30 },
    );
    expect(leakViewsChecked).toBeGreaterThan(0);
  }, WHOLE_RUN_TIMEOUT_MS);

  it("drives a run from muster through the length vote, drafts and routes to the end without throwing, replaying identically", () => {
    fc.assert(
      fc.property(fc.constantFrom(3, 4, 5), fc.string({ minLength: 1 }), choicesArb, (seatCount, seed, choices) => {
        const initial = createRun({ seatIds: seatIdsFor(seatCount), seed });
        const { states, log } = driveRun(initial, choices, CATALOG);

        expect(runStatus(states[states.length - 1]!)).not.toBe("in_progress");
        expect(replayRun(initial, log, CATALOG)).toEqual(states);
        for (const state of states) expect(JSON.parse(JSON.stringify(state))).toEqual(state);
        // Every seat holds a distinct character once past muster.
        const crew = states[states.length - 1]!.seats.map((s) => s.characterId);
        expect(new Set(crew).size).toBe(seatCount);
        const last = states[states.length - 1]!;
        expect(last.plan).not.toBeNull();
        expect(last.history.every((entry) => entry.camp <= RUN_LENGTHS[last.plan!.length].camps)).toBe(true);
      }),
      { numRuns: 10 },
    );
  });

  it("gives deep-equal state arrays for two independently built runs from identical input", () => {
    fc.assert(
      fc.property(runInputArb, (input) => {
        expect(driveRun(build(input), input.choices, CATALOG).states).toEqual(driveRun(build(input), input.choices, CATALOG).states);
      }),
      { numRuns: 10 },
    );
  });

  it("gives different attempt-1 camp-1 hands for at least one of 20 distinct seed pairs (seed sensitivity, A1)", () => {
    const seatIds = seatIdsFor(4);
    const handsFor = (seed: string) => attemptOf(advanceTo(setupRun({ seatIds, seed, catalog: CATALOG }), "objective-pick", CATALOG))!.camp.hands;

    let sawDifference = false;
    for (let i = 0; i < 20 && !sawDifference; i++) {
      sawDifference = JSON.stringify(handsFor(`seed-a-${i}`)) !== JSON.stringify(handsFor(`seed-b-${i}`));
    }
    expect(sawDifference).toBe(true);
  });

  it("with rescue and in-trick sources in the crew, every run ends, replays, round-trips JSON and visits rescue", () => {
    let rescueStates = 0;
    let rescueUses = 0;
    let inTrickUses = 0;
    const RESCUE_AND_IN_TRICK = new Set(["medic", "rope-ladder", "bait", "jd.rule-breaker"]);
    fc.assert(
      fc.property(fc.constantFrom(3, 4, 5), fc.string({ minLength: 1 }), choicesArb, (seatCount, seed, choices) => {
        const seatIds = seatIdsFor(seatCount);
        const characters = Object.fromEntries(seatIds.map((seatId, i) => [seatId, ["medic", "jd", "explorer", "leader", "cartographer"][i]!]));
        const items = Object.fromEntries(seatIds.map((seatId, i) => [seatId, i % 2 === 0 ? ["rope-ladder", "bait"] : []]));
        const initial = setupRun({ seatIds, seed, catalog: CATALOG, characters, upgrades: { [seatIds[1]!]: "jd.rule-breaker" }, items });

        const { states, log } = driveRun(initial, choices, CATALOG);

        expect(runStatus(states[states.length - 1]!)).not.toBe("in_progress");
        expect(replayRun(initial, log, CATALOG)).toEqual(states);
        for (const state of states) {
          expect(JSON.parse(JSON.stringify(state))).toEqual(state);
          if (currentWindow(state, rulesFor(state, CATALOG)) === "rescue") rescueStates++;
        }
        log.forEach((entry, i) => {
          if (entry.action.type !== "use-ability") return;
          const defId = defIdOf(states[i]!.seats.find((s) => s.seatId === entry.seatId)!, entry.action.sourceKey);
          if (!RESCUE_AND_IN_TRICK.has(defId)) return;
          if (defId === "bait") inTrickUses++;
          else rescueUses++;
        });
      }),
      { numRuns: 20 },
    );
    expect(rescueStates).toBeGreaterThan(0);
    expect(rescueUses).toBeGreaterThan(0);
    expect(inTrickUses).toBeGreaterThan(0);
  }, WHOLE_RUN_TIMEOUT_MS);

  it("plays a Long run camp by camp to the temple, where both earlier bosses return at half strength, and the run ends", () => {
    let temples = 0;
    fc.assert(
      fc.property(fc.constantFrom(3, 4, 5), fc.string({ minLength: 1 }), choicesArb, (seatCount, seed, choices) => {
        const states = playLongRun(setupRun({ seatIds: seatIdsFor(seatCount), seed, catalog: CATALOG, length: "long" }), choices);
        const last = states.at(-1)!;
        expect(runStatus(last)).not.toBe("in_progress");
        checkRun(states);

        const [animal, disaster] = last.plan!.bosses;
        const temple = states.find((state) => state.stage.tag === "camp" && state.stage.camp.index === 8);
        expect(temple).toBeDefined();
        expect(campStack(temple!, CATALOG).slice(-3).map((layer) => `${layer.def.id}:${layer.strength}`)).toEqual(["temple:full", `${animal!.modId}:half`, `${disaster!.modId}:half`]);
        expect(last.history.map((h) => h.camp).filter((camp, i, all) => all.indexOf(camp) === i)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        temples++;
      }),
      { numRuns: 4 },
    );
    expect(temples).toBe(4);
  }, 120_000);
});

/** Random legal play through every camp of a Long run. Before the temple a
 * camp failed twice, or a failure that would end the run, is cleared by the
 * dev shortcut instead, so the run always reaches the temple; the temple is
 * played until the run ends. */
function playLongRun(initial: RunState, choices: readonly number[]): RunState[] {
  const states = [initial];
  let state = initial;
  const forceClear = (run: RunState) => DEV_SHORTCUTS["force-camp"].apply(run, { outcome: "cleared" }, CATALOG);
  for (let step = 0; runStatus(state) === "in_progress"; step++) {
    if (step > 20_000) throw new Error("playLongRun exceeded its step bound");
    const spec = specOf(state);
    const beforeTemple = spec !== null && spec.index < 8;
    if (state.stage.tag === "loadout" && beforeTemple && state.history.filter((h) => h.camp === spec.index && h.status === "failed").length >= 2) {
      state = forceClear(state);
    } else {
      const legal = enumerateLegalRunActions(state, CATALOG);
      if (legal.length === 0) throw new Error(`playLongRun: no legal action at ${state.stage.tag}`);
      const picked = legal[choices[step % choices.length]! % legal.length]!;
      const result = applyRunAction(state, picked.seatId, picked.action, CATALOG);
      if (!result.ok) throw new Error(`playLongRun: enumerated action refused: ${result.error}`);
      state = beforeTemple && runStatus(result.state) === "lost" ? forceClear(state) : result.state;
    }
    states.push(state);
  }
  return states;
}
