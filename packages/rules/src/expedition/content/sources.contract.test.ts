// The sources contract: every character, upgrade and item in the production
// catalogue, iterated from the registries, so a new entry is covered with no
// edit here. Usable states are found by a seeded random walk through the
// real dispatcher, never built by hand.

import { describe, expect, it } from "vitest";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import { abilityStatus, useAbility } from "../run/abilities";
import { CATALOG } from "../run/catalog";
import { runPhase } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
import { driveRun, enumerateLegalRunActions, replayRun, setupRun } from "../run/run-test-support";
import { TARGET_KINDS } from "../run/targets";
import { campCardIds } from "../run/toolkit";
import type { CampNumber, LedgerEntry, RunState } from "../run/types";
import { currentStamp, liveSourceIds, remaining } from "../run/usage";
import { resolveTuned, type CharacterDef, type Owner, type SourceDef } from "./source-def";

const SOURCES: readonly SourceDef[] = Object.values(CATALOG.sources);
const ACTIVE_SOURCES = SOURCES.filter((def) => def.active !== undefined);
const SEATS = ["p0", "p1", "p2", "p3"] as const;
const ITEM_IDS = Object.keys(CATALOG.items);

function characterFor(def: SourceDef): CharacterDef | null {
  if (def.kind === "character") return def;
  if (def.kind === "upgrade") return CATALOG.characters[def.characterId]!;
  return null;
}

function owners(def: SourceDef): Owner[] {
  const upgrades = characterFor(def)?.upgrades.map((u) => u.id) ?? [];
  return [
    { seatId: "p0", hasUpgrade: () => false },
    { seatId: "p0", hasUpgrade: (id) => upgrades.includes(id) },
  ];
}

/** A seeded LCG, so the walk is reproducible. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

/** A crew where p0 holds `def` (its character and upgrades, or the item)
 * and every seat carries every item, so whispers, failures and wins happen
 * under as many rule layers as possible. */
function crewFor(def: SourceDef, seed: string, campNumber: CampNumber = 1): RunState {
  const character = characterFor(def);
  const others = Object.keys(CATALOG.characters).filter((id) => id !== character?.id);
  const characters: Record<string, string> = { p0: character?.id ?? others.shift()! };
  for (const seat of SEATS.slice(1)) characters[seat] = others.shift()!;
  const kits: Record<string, string[]> = {};
  for (const seat of SEATS) kits[seat] = seat === "p0" ? [...(character?.upgrades.map((u) => u.id) ?? []), ...ITEM_IDS] : [];
  return setupRun({
    seatIds: SEATS,
    seed,
    catalog: CATALOG,
    campNumber,
    supplies: 2,
    characters,
    kits,
    bossTwists: { 3: "radio-silence", 6: "mutiny" },
  });
}

/** Walks random legal actions from a fresh crew until p0 can use `def`. p0
 * never uses that source on the walk, so the found state is its first use. */
function findUsable(def: SourceDef): RunState {
  for (let attempt = 0; attempt < 60; attempt++) {
    const next = lcg(attempt * 7919 + def.id.length);
    let state = crewFor(def, `${def.id}-${attempt}`, attempt % 2 === 0 ? 1 : 3);
    for (let step = 0; step < 400 && runPhase(state) !== "ended"; step++) {
      const status = state.attempt === null ? null : abilityStatus(state, "p0", def.id, CATALOG);
      if (status?.usable) return state;
      const legal = enumerateLegalRunActions(state, CATALOG).filter(
        (c) => !(c.seatId === "p0" && c.action.type === "use-ability" && c.action.sourceId === def.id),
      );
      if (legal.length === 0) break;
      const picked = legal[next() % legal.length]!;
      const result = applyRunAction(state, picked.seatId, picked.action, CATALOG);
      if (!result.ok) throw new Error(`walk: enumerated action refused: ${result.error}`);
      state = result.state;
    }
  }
  throw new Error(`no usable state found for "${def.id}"`);
}

/** Uses `sourceId` for p0 with the first accepted choice combination. */
function useFirst(state: RunState, sourceId: string): RunState {
  const status = abilityStatus(state, "p0", sourceId, CATALOG);
  if (status === null || !status.usable) throw new Error(`"${sourceId}" is not usable`);
  const combos = status.steps.reduce<string[][]>((acc, step) => acc.flatMap((prefix) => step.choices.map((c) => [...prefix, c])), [[]]);
  for (const targets of combos) {
    const result = useAbility(state, "p0", sourceId, targets, CATALOG);
    if (result.ok) return result.state;
  }
  throw new Error(`every target combination for "${sourceId}" was refused`);
}

function withLedger(state: RunState, seatId: string, extra: readonly LedgerEntry[]): RunState {
  return { ...state, seats: state.seats.map((s) => (s.seatId === seatId ? { ...s, ledger: [...s.ledger, ...extra] } : s)) };
}

const USABLE = new Map<string, RunState>(ACTIVE_SOURCES.map((def) => [def.id, findUsable(def)]));

describe("source shape", () => {
  it("has 6 characters, 12 upgrades and 13 items with unique ids", () => {
    const kinds = SOURCES.map((def) => def.kind);
    expect(kinds.filter((k) => k === "character")).toHaveLength(6);
    expect(kinds.filter((k) => k === "upgrade")).toHaveLength(12);
    expect(kinds.filter((k) => k === "item")).toHaveLength(13);
    expect(new Set(SOURCES.map((def) => def.id)).size).toBe(31);
  });

  it.each(SOURCES.map((def) => [def.id, def] as const))("%s: text is one plain sentence about the effect", (_id, def) => {
    expect(def.text).toMatch(/^[A-Z][^.!?()—]*\.$/);
    expect(def.name.length).toBeGreaterThan(0);
  });

  it.each(Object.values(CATALOG.characters).map((def) => [def.id, def] as const))(
    "%s: both upgrades name their character and carry its id as a prefix",
    (id, def) => {
      for (const upgrade of def.upgrades) {
        expect(upgrade.characterId).toBe(id);
        expect(upgrade.id.startsWith(`${id}.`)).toBe(true);
      }
    },
  );

  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: a pool limit only on a pooled character's own sources", (_id, def) => {
    for (const owner of owners(def)) {
      if (resolveTuned(def.active!.limit, owner).kind === "pool") {
        expect(def.kind).not.toBe("item");
        expect(characterFor(def)?.pool).toBeDefined();
      }
    }
  });

  it("the catalogue uses every one of the twelve target kinds", () => {
    const used = new Set(ACTIVE_SOURCES.flatMap((def) => def.active!.targets.map((spec) => spec.kind)));
    expect([...used].sort()).toEqual(Object.keys(TARGET_KINDS).sort());
  });
});

describe("each active source in play", () => {
  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: has effect if and only if a use adds a modifier", (id, def) => {
    const before = USABLE.get(id)!;
    const after = useFirst(before, id);
    const added = after.attempt!.effects.length - before.attempt!.effects.length;
    expect(added > 0).toBe(def.active!.effect !== undefined);
  });

  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: a use spends its limit", (id) => {
    const before = USABLE.get(id)!;
    const left = remaining(before, "p0", id, CATALOG);
    const after = useFirst(before, id);
    const owned = (state: RunState) => state.seats[0]!.kit.includes(id) || state.seats[0]!.characterId === id;
    switch (left.kind) {
      case "single-use":
        expect(owned(after)).toBe(false);
        expect(useAbility(after, "p0", id, [], CATALOG)).toEqual({ ok: false, error: "not_owned" });
        break;
      case "uses":
        expect(remaining(after, "p0", id, CATALOG)).toEqual({ kind: "uses", left: left.left - 1, of: left.of });
        break;
      case "pool":
        expect(remaining(after, "p0", id, CATALOG)).toMatchObject({ kind: "pool", balance: left.balance - left.cost });
        break;
      case "supplies":
        expect(after.supplies).toBe(before.supplies - left.cost);
        break;
    }
  });

  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: the use after the limit is refused", (id) => {
    const state = USABLE.get(id)!;
    const left = remaining(state, "p0", id, CATALOG);
    const at = currentStamp(state)!;
    const status = abilityStatus(state, "p0", id, CATALOG)!;
    const targets = status.usable ? status.steps.map((step) => step.choices[0]!) : [];
    switch (left.kind) {
      case "uses": {
        const spent = withLedger(state, "p0", Array.from({ length: left.left }, () => ({ kind: "used", sourceId: id, at, poolCost: 0 }) as const));
        expect(useAbility(spent, "p0", id, targets, CATALOG)).toEqual({ ok: false, error: "ability_spent" });
        break;
      }
      case "pool": {
        const drained = withLedger(state, "p0", [{ kind: "used", sourceId: id, at, poolCost: left.balance - left.cost + 1 }]);
        expect(useAbility(drained, "p0", id, targets, CATALOG)).toEqual({ ok: false, error: "cannot_afford" });
        break;
      }
      case "supplies": {
        const short = { ...state, supplies: left.cost };
        expect(useAbility(short, "p0", id, targets, CATALOG)).toEqual({ ok: false, error: "cannot_afford" });
        break;
      }
      case "single-use":
        expect(useAbility(useFirst(state, id), "p0", id, targets, CATALOG)).toEqual({ ok: false, error: "not_owned" });
        break;
    }
  });

  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: per-run uses survive a replay and per-camp uses reset", (id) => {
    const state = USABLE.get(id)!;
    const left = remaining(state, "p0", id, CATALOG);
    if (left.kind !== "uses") return;
    const at = currentStamp(state)!;
    const replayed = withLedger(
      { ...state, attempt: { ...state.attempt!, attemptNumber: at.attempt + 1 } },
      "p0",
      Array.from({ length: left.of }, () => ({ kind: "used", sourceId: id, at, poolCost: 0 }) as const),
    );
    const owner: Owner = { seatId: "p0", hasUpgrade: (u) => state.seats[0]!.kit.includes(u) };
    const perCamp = resolveTuned(CATALOG.sources[id]!.active!.limit, owner).kind === "per-camp";
    expect(remaining(replayed, "p0", id, CATALOG)).toEqual({ kind: "uses", left: perCamp ? left.of : 0, of: left.of });
  });
});

describe("random runs with the whole catalogue", () => {
  const RUN_SEEDS = ["contract-a", "contract-b", "contract-c"];
  const CHOICES = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9];

  function fullKitRun(seed: string): RunState {
    const characters = Object.keys(CATALOG.characters);
    const kits: Record<string, string[]> = {};
    SEATS.forEach((seat, i) => {
      const character = CATALOG.characters[characters[i]!]!;
      kits[seat] = [...character.upgrades.map((u) => u.id), ...ITEM_IDS];
    });
    return setupRun({
      seatIds: SEATS,
      seed,
      catalog: CATALOG,
      characters: Object.fromEntries(SEATS.map((seat, i) => [seat, characters[i]!])),
      kits,
    });
  }

  const DRIVEN = RUN_SEEDS.map((seed) => {
    const initial = fullKitRun(seed);
    return { initial, ...driveRun(initial, CHOICES, CATALOG, 4000) };
  });

  it("uses abilities along the way", () => {
    const uses = DRIVEN.flatMap((d) => d.log).filter((entry) => entry.action.type === "use-ability");
    expect(new Set(uses.map((u) => (u.action as { sourceId: string }).sourceId)).size).toBeGreaterThan(5);
  });

  it("replays to identical states (determinism)", () => {
    for (const driven of DRIVEN) {
      expect(replayRun(driven.initial, driven.log, CATALOG)).toEqual(driven.states);
    }
  });

  it("conserves every card within an attempt", () => {
    for (const driven of DRIVEN) {
      for (let i = 1; i < driven.states.length; i++) {
        const before = driven.states[i - 1]!.attempt?.camp;
        const after = driven.states[i]!.attempt?.camp;
        if (before && after && driven.states[i - 1]!.attempt!.attemptNumber === driven.states[i]!.attempt!.attemptNumber) {
          expect(campCardIds(after)).toEqual(campCardIds(before));
        }
      }
    }
  });

  it("round-trips every state through JSON", () => {
    for (const driven of DRIVEN) {
      for (const state of driven.states) expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    }
  });

  it("projects every state leak-free for every seat", () => {
    for (const driven of DRIVEN) {
      for (const state of driven.states) {
        for (const seatId of [...SEATS, "spectator"]) {
          const view = toExpeditionPlayerView(state, seatId, CATALOG);
          const serialized = JSON.stringify(view);
          const secrets = secretsForExpeditionSeat(state, seatId, CATALOG, state.seed);
          expect(checkExpeditionViewForLeaks({ view, serialized, secrets })).toEqual([]);
        }
      }
    }
  });

  it("keeps every live source a catalogue entry", () => {
    for (const driven of DRIVEN) {
      for (const seat of driven.states.at(-1)!.seats) {
        for (const id of liveSourceIds(seat)) expect(CATALOG.sources[id]).toBeDefined();
      }
    }
  });
});
