// Boss catalogue contract (Plan 10-14, ENG-02, BOSS-01). Iterates
// Object.entries(BOSS_REGISTRY) ONLY — never a hand list — so a new boss
// registered later (ENG-01: one file plus one registry line) is covered
// automatically with zero edits to this file.
//
// The per-seat leak check below (spec §8 "no view leak after apply") calls
// the real toExpeditionPlayerView/checkExpeditionViewForLeaks
// (adapter/view-leak-check.ts, Plan 11-04) for every seat plus an unseated
// "spectator" viewer at every step of the driven camp, proving a registered
// boss twist never leaks a card through the actual per-seat projection.

import { describe, expect, it } from "vitest";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, enumerateLegalRunActions, setupRun } from "../run/run-test-support";
import { campCardIds } from "../run/toolkit";
import { HOOK_NAMES } from "../run/run-rules";
import { BOSS_REGISTRY } from "./registry";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import type { BossDef } from "./boss-def";
import type { Catalog, CampNumber, RunAction, RunState } from "../run/types";

function makeCatalog(): Catalog {
  return { gear: {}, bosses: BOSS_REGISTRY };
}

/** Pure shape checks for a BossDef: non-empty name/text, and every
 * modifiers key is a known RunRules HookName mapping to a function. Used
 * both per-entry against every real registered boss and, in the
 * non-vacuity test below, against a deliberately broken fake def — this is
 * what proves the check itself is not vacuous. */
function checkBossDef(def: BossDef): string[] {
  const violations: string[] = [];
  if (def.name.trim().length === 0) violations.push(`${def.id}: name is empty`);
  if (def.text.trim().length === 0) violations.push(`${def.id}: text is empty`);

  const knownHookNames: readonly string[] = HOOK_NAMES;
  for (const [hookName, fn] of Object.entries(def.modifiers)) {
    if (!knownHookNames.includes(hookName)) {
      violations.push(`${def.id}: modifiers key "${hookName}" is not a known HookName`);
      continue;
    }
    if (typeof fn !== "function") {
      violations.push(`${def.id}: modifiers["${hookName}"] is not a function`);
    }
  }

  return violations;
}

/** Drives `run` (already dealt) through the current actor's first
 * pick-objective or play-card action ONLY — never whisper or gear-use — via
 * applyRunAction alone, until run.history grows past
 * `startingHistoryLength` (the camp settles, succeeded or failed). */
function driveOneCamp(
  run: RunState,
  catalog: Catalog,
  startingHistoryLength: number,
  maxSteps = 500,
): { states: RunState[]; log: Array<{ seatId: string; action: RunAction }> } {
  const states: RunState[] = [run];
  const log: Array<{ seatId: string; action: RunAction }> = [];
  let state = run;
  let step = 0;

  while (state.history.length === startingHistoryLength) {
    if (step >= maxSteps) {
      throw new Error("driveOneCamp: exceeded step bound");
    }

    const candidates = enumerateLegalRunActions(state, catalog);
    const picked =
      candidates.find((c) => c.action.type === "pick-objective") ??
      candidates.find((c) => c.action.type === "play-card");
    if (picked === undefined) {
      throw new Error("driveOneCamp: no pick-objective or play-card action available");
    }

    const result = applyRunAction(state, picked.seatId, picked.action, catalog);
    if (!result.ok) {
      throw new Error(`driveOneCamp: rejected (${JSON.stringify(picked)}): ${result.error}`);
    }

    state = result.state;
    states.push(state);
    log.push(picked);
    step++;
  }

  return { states, log };
}

function dealtRun(id: string, seatIds: readonly string[], seed: string, catalog: Catalog): RunState {
  return advanceTo(
    setupRun({
      seatIds,
      seed,
      catalog,
      campNumber: 3 as CampNumber,
      bossTwists: { 3: id, 6: null },
    }),
    "objective-pick",
    catalog,
  );
}

describe("BOSS_REGISTRY (ENG-01)", () => {
  it("has exactly the four provisional ids, each key equal to its def's own id", () => {
    expect(Object.keys(BOSS_REGISTRY).sort()).toEqual(
      ["blind-orders", "eclipse", "mutiny", "radio-silence"].sort(),
    );
    for (const [key, def] of Object.entries(BOSS_REGISTRY)) {
      expect(def.id).toBe(key);
    }
  });
});

for (const [id, def] of Object.entries(BOSS_REGISTRY)) {
  describe(`boss catalogue contract: ${id}`, () => {
    it("passes checkBossDef with no violations", () => {
      expect(checkBossDef(def)).toEqual([]);
    });

    it("name and text are non-empty", () => {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.text.length).toBeGreaterThan(0);
    });

    for (const playerCount of [3, 4, 5] as const) {
      it(`playerCount=${playerCount}: a driven camp-3 attempt deals, settles, conserves cards, round-trips through JSON, is deterministic, and leaks nothing`, () => {
        const catalog = makeCatalog();
        const seatIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
        const seed = `boss-contract-${id}-${playerCount}`;

        const dealt = dealtRun(id, seatIds, seed, catalog);
        const historyLen = dealt.history.length;
        const initialCardIds = campCardIds(dealt.attempt!.camp!);

        const { states, log } = driveOneCamp(dealt, catalog, historyLen);
        expect(states.length).toBeGreaterThan(1);

        for (const state of states) {
          // round-trips through JSON at every step
          expect(JSON.parse(JSON.stringify(state))).toEqual(state);

          // Real per-seat leak check (spec §8) — every seat plus an
          // unseated viewer, at every step, regardless of attempt state.
          for (const seatOrSpectator of [...state.seatIds, "spectator"]) {
            const view = toExpeditionPlayerView(state, seatOrSpectator, catalog);
            const secrets = secretsForExpeditionSeat(state, seatOrSpectator, catalog, seed);
            const reasons = checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
            expect(reasons).toEqual([]);
          }

          if (state.attempt !== null) {
            // bosses create no reveals (a real boss property, not a leak
            // check — the per-seat checker above already proves no leak).
            expect(state.attempt.reveals).toEqual([]);

            if (state.attempt.camp !== null) {
              // card conservation at every step with a camp
              expect(campCardIds(state.attempt.camp)).toEqual(initialCardIds);
            }
          }
        }

        // determinism: replaying the whole pipeline from the same seed
        // gives the same step-by-step action sequence
        const replayDealt = dealtRun(id, seatIds, seed, catalog);
        const replay = driveOneCamp(replayDealt, catalog, replayDealt.history.length);
        expect(replay.log).toEqual(log);
      });
    }
  });
}

describe("non-vacuity", () => {
  it("every real registered boss def is violation-free", () => {
    for (const def of Object.values(BOSS_REGISTRY)) {
      expect(checkBossDef(def)).toEqual([]);
    }
  });

  it("a fake def with a modifiers key that is not a HookName is flagged (the check is not vacuous)", () => {
    const fakeDef = {
      id: "x",
      name: "Fake Boss",
      text: "Fake boss for the non-vacuity check.",
      modifiers: { notAHook: () => () => true },
    } as unknown as BossDef;

    const violations = checkBossDef(fakeDef);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes("notAHook"))).toBe(true);
  });
});
