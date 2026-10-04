// The camp-modifier contract: every registered def, iterated from MODS, so
// a new entry is covered with no edit here. Each body's channels are
// checked against the engine's hook and event lists, and each def is forced
// into the stack of a camp played by a seeded random walk through the real
// dispatcher at 3, 4 and 5 players.

import { describe, expect, it } from "vitest";
import { toExpeditionPlayerView } from "../../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../../adapter/view-leak-check";
import { attemptOf } from "../../run/attempt";
import { CATALOG } from "../../run/catalog";
import { campIndex } from "../../run/plan";
import { ENGINE_EVENT_TYPES } from "../../run/react";
import { HOOK_NAMES } from "../../run/run-rules";
import { enumerateLegalRunActions, replayRun, setupRun, testCatalog } from "../../run/run-test-support";
import { campStack, modCtx, specOf } from "../../run/stack";
import { applyRunAction } from "../../run/stages/registry";
import { campCardIds } from "../../run/toolkit";
import type { Catalog, RunAction, RunAt, RunState } from "../../run/types";
import { bodyOf, type ModBody, type ModCtx, type ModDef, type ModKind } from "./mod-def";
import { MODS } from "./registry";

const DEFS: readonly ModDef[] = Object.values(MODS);
const KINDS: readonly ModKind[] = ["location", "weather", "pairing", "animal", "disaster", "temple"];
const isBoss = (def: ModDef) => def.kind === "animal" || def.kind === "disaster";

function bodies(def: ModDef): ModBody[] {
  return isBoss(def) ? [bodyOf(def, "full"), bodyOf(def, "half")] : [def.full];
}

/** A catalogue whose pairing table adds `def` to the jungle in fair weather. */
function catalogFor(def: ModDef): Catalog {
  return def.kind === "pairing" ? testCatalog({ characters: CATALOG.characters, items: CATALOG.items, pairings: [{ location: "jungle", weathers: ["fair"], result: { cancels: [], adds: def.id } }] }) : CATALOG;
}

/** Camp 2's loadout with `def` in its stack: as its location or weather,
 * through a pairing, or as its planned boss. */
function forced(def: ModDef, players: number, seed: string): RunAt<"loadout"> {
  const seatIds = ["p0", "p1", "p2", "p3", "p4"].slice(0, players);
  const run = setupRun({ seatIds, seed, catalog: catalogFor(def), camp: 2, characters: {} }) as RunAt<"loadout">;
  const spec = run.stage.camp;
  const camp =
    def.kind === "location"
      ? { ...spec, location: def.id }
      : def.kind === "weather"
        ? { ...spec, weather: def.id }
        : { ...spec, location: "jungle", weather: "fair" };
  const plan = isBoss(def) || def.kind === "temple" ? { ...run.plan!, bosses: [{ at: campIndex(2), tier: def.kind === "temple" ? ("temple" as const) : (def.kind as "animal" | "disaster"), modId: def.id }] } : run.plan;
  return { ...run, plan, stage: { ...run.stage, camp } };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

/** Plays the forced camp's first attempt to its settle with random legal
 * actions, readies included. */
function playCamp(start: RunState, catalog: Catalog, seed: number): { states: RunState[]; log: { seatId: string; action: RunAction }[] } {
  const next = lcg(seed);
  const states = [start];
  const log: { seatId: string; action: RunAction }[] = [];
  let state = start;
  for (let step = 0; step < 600 && state.history.length === start.history.length && state.stage.tag !== "ended"; step++) {
    const legal = enumerateLegalRunActions(state, catalog).filter((c) => c.action.type !== "equip" && c.action.type !== "buy");
    if (legal.length === 0) break;
    const picked = legal[next() % legal.length]!;
    const result = applyRunAction(state, picked.seatId, picked.action, catalog);
    if (!result.ok) throw new Error(`walk: enumerated action refused: ${result.error}`);
    state = result.state;
    states.push(state);
    log.push(picked);
  }
  return { states, log };
}

/** The layer for `def` in the run's stack. */
function layerOf(state: RunState, def: ModDef, catalog: Catalog) {
  return campStack(state, catalog).find((layer) => layer.def.id === def.id);
}

/** `ctx` with every roll for a trick after the current one moved by one. */
function laterRollsMoved(ctx: ModCtx): ModCtx {
  const current = ctx.camp?.currentTrick.index ?? -1;
  return {
    ...ctx,
    roll: (label, n) => {
      const trick = /t(\d+)/.exec(label);
      const real = ctx.roll(label, n);
      return trick !== null && Number(trick[1]) > current ? (real + 1) % n : real;
    },
  };
}

describe.each(DEFS.map((def) => [def.id, def] as const))("camp modifier %s", (id, def) => {
  it("is registered under its id, with a known kind, a name, one sentence and a whole weight", () => {
    expect(MODS[id as keyof typeof MODS]).toBe(def);
    expect(KINDS).toContain(def.kind);
    expect(def.name.trim()).not.toBe("");
    expect(def.text).toMatch(/^[A-Z][^.]*\.$/);
    expect(Number.isInteger(def.weight) && def.weight >= 0).toBe(true);
    if (def.kind === "location" && def.normalWeatherChance !== undefined) {
      expect(def.normalWeatherChance).toBeGreaterThanOrEqual(0);
      expect(def.normalWeatherChance).toBeLessThanOrEqual(100);
    }
  });

  it("has a half body if and only if it is a boss", () => {
    expect("half" in def).toBe(isBoss(def));
  });

  it("names only engine hooks in rules and engine events in on, and has effect only beside on", () => {
    const run = forced(def, 3, `${id}-shape`);
    for (const [i, body] of bodies(def).entries()) {
      const ctx = modCtx(run, run.stage.camp, { def, strength: i === 0 ? "full" : "half" });
      for (const hook of Object.keys(body.rules?.(ctx) ?? {})) expect(HOOK_NAMES).toContain(hook);
      for (const event of Object.keys(body.on ?? {})) expect(ENGINE_EVENT_TYPES).toContain(event);
      if (body.effect !== undefined) expect(body.on).toBeDefined();
    }
  });

  it.each([3, 4, 5])("plays a camp at %i players: conserved, JSON-safe, deterministic, leak-free, with a stable status", (players) => {
    const catalog = catalogFor(def);
    for (const seed of [1, 2]) {
      const start = forced(def, players, `${id}-${players}-${seed}`);
      expect(campStack(start, catalog).map((layer) => layer.def.id)).toContain(id);
      const { states, log } = playCamp(start, catalog, seed * 7919 + players);
      expect(states.at(-1)!.history.length).toBe(1);

      expect(replayRun(start, log, catalog)).toEqual(states);
      let dealt: string[] | null = null;
      for (const state of states) {
        expect(JSON.parse(JSON.stringify(state))).toEqual(state);
        const attempt = attemptOf(state);
        if (attempt !== null) {
          dealt ??= campCardIds(attempt.camp);
          expect(campCardIds(attempt.camp)).toEqual(dealt);
          for (const effect of attempt.effects) {
            if (effect.origin.kind === "mod" && effect.origin.modId === id) expect(bodyOf(def, effect.origin.strength).effect).toBeDefined();
          }
        }
        for (const seatId of state.seatIds) {
          const view = toExpeditionPlayerView(state, seatId, catalog);
          const secrets = secretsForExpeditionSeat(state, seatId, catalog, state.seed);
          expect(checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets })).toEqual([]);
        }
        const layer = layerOf(state, def, catalog);
        const spec = specOf(state);
        if (layer === undefined || spec === null || layer.body.status === undefined) continue;
        const ctx = modCtx(state, spec, layer);
        const status = layer.body.status(ctx);
        expect(layer.body.status(laterRollsMoved(ctx))).toEqual(status);
        const ids = attempt === null ? [] : campCardIds(attempt.camp);
        const serialized = JSON.stringify(status);
        for (const cardId of ids) expect(serialized.includes(cardId)).toBe(false);
      }
    }
  });
});
