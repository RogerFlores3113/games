// The sources contract: every character, power, upgrade and item in the
// production catalogue, iterated from the registries, so a new entry is covered with no
// edit here. Usable states are found by a seeded random walk through the
// real dispatcher, never built by hand.

import { describe, expect, it } from "vitest";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import { abilityStatus, useAbility } from "../run/abilities";
import { CATALOG } from "../run/catalog";
import { attemptOf, withAttempt } from "../run/attempt";
import { driveRun, enumerateLegalRunActions, replayRun, setupRun } from "../run/run-test-support";
import { applyRunAction } from "../run/stages/registry";
import { TARGET_KINDS } from "../run/targets";
import { campCardIds } from "../run/toolkit";
import type { LedgerEntry, RunState } from "../run/types";
import { currentStamp, defIdOf, limitOf, liveSourceKeys, remaining } from "../run/usage";
import type { CharacterDef, ItemDef, ItemUses, SourceDef } from "./source-def";

const SOURCES: readonly SourceDef[] = Object.values(CATALOG.sources);
const ACTIVE_SOURCES = SOURCES.filter((def) => def.active !== undefined);
const ACTIVE_ITEMS = ACTIVE_SOURCES.filter((def): def is ItemDef & { uses: ItemUses } => def.kind === "item");
const SEATS = ["p0", "p1", "p2", "p3"] as const;
const ITEM_IDS = Object.keys(CATALOG.items);
/** p0's one instance of an item under test is minted first. */
const ITEM_UID = "it0";

/** The key p0 uses `def` through: the instance for an item, else the id. */
function keyFor(def: SourceDef): string {
  return def.kind === "item" ? ITEM_UID : def.id;
}

/** How many uses an item's instance has before it is spent (per-camp: per attempt). */
function declaredUses(uses: ItemUses): number {
  return uses.kind === "charges" ? uses.n : 1;
}

function characterFor(def: SourceDef): CharacterDef | null {
  if (def.kind === "character") return def;
  if (def.kind === "upgrade" || def.kind === "power") return CATALOG.characters[def.characterId]!;
  return null;
}

/** A seeded LCG, so the walk is reproducible. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

/** A crew where p0 holds `def`: its character, the upgrade itself, or the
 * item as instance it0 beside one more item; the other seats carry items
 * too, so whispers, failures and wins happen under several rule layers. */
function crewFor(def: SourceDef, seed: string, camp = 1): RunState {
  const character = characterFor(def);
  const others = Object.keys(CATALOG.characters).filter((id) => id !== character?.id);
  const characters: Record<string, string> = { p0: character?.id ?? others.shift()! };
  for (const seat of SEATS.slice(1)) characters[seat] = others.shift()!;
  const spare = ITEM_IDS.filter((id) => id !== def.id);
  const items: Record<string, string[]> = { p0: def.kind === "item" ? [def.id, spare[0]!] : [] };
  SEATS.slice(1).forEach((seat, i) => (items[seat] = [spare[i + 1]!, spare[i + 4]!]));
  return setupRun({
    seatIds: SEATS,
    seed,
    catalog: CATALOG,
    camp,
    supplies: 2,
    characters,
    upgrades: def.kind === "upgrade" ? { p0: def.id } : {},
    items,
  });
}

/** Walks random legal actions from a fresh crew until p0 can use `def`. p0
 * never uses that source on the walk, so the found state is its first use. */
function findUsable(def: SourceDef): RunState {
  const key = keyFor(def);
  for (let attempt = 0; attempt < 60; attempt++) {
    const next = lcg(attempt * 7919 + def.id.length);
    let state = crewFor(def, `${def.id}-${attempt}`, [1, 3, 4][attempt % 3]);
    for (let step = 0; step < 400 && state.stage.tag !== "ended"; step++) {
      const status = currentStamp(state) === null ? null : abilityStatus(state, "p0", key, CATALOG);
      if (status?.usable) return state;
      const legal = enumerateLegalRunActions(state, CATALOG).filter(
        (c) =>
          !(c.seatId === "p0" && c.action.type === "use-ability" && c.action.sourceKey === key) &&
          !(c.seatId === "p0" && (c.action.type === "equip" || c.action.type === "buy")),
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

/** Uses `key` for p0 with the first accepted choice combination. */
function useFirst(state: RunState, key: string): RunState {
  const status = abilityStatus(state, "p0", key, CATALOG);
  if (status === null || !status.usable) throw new Error(`"${key}" is not usable`);
  const combos = status.steps.reduce<string[][]>((acc, step) => acc.flatMap((prefix) => step.choices.map((c) => [...prefix, c])), [[]]);
  for (const targets of combos) {
    const result = useAbility(state, "p0", key, targets, CATALOG);
    if (result.ok) return result.state;
  }
  throw new Error(`every target combination for "${key}" was refused`);
}

/** `count` earlier uses of `key`, stamped now. */
function usedTimes(state: RunState, key: string, count: number): RunState {
  const at = currentStamp(state)!;
  return withLedger(state, "p0", Array.from({ length: count }, () => ({ kind: "used", sourceKey: key, at }) as const));
}

/** p0 has sent `count` more whispers this attempt. */
function whispered(state: RunState, count: number): RunState {
  const attempt = attemptOf(state)!;
  const entries = Array.from({ length: count }, () => ({ event: "whisper", actorSeatId: "p0", subjectSeatIds: ["p1"], sourceId: null, audience: "public" }) as const);
  return withAttempt(state, { ...attempt, log: [...attempt.log, ...entries] });
}

const effectsOf = (state: RunState) => attemptOf(state)?.effects ?? [];

function replayed(state: RunState): RunState {
  return withAttempt(state, { ...attemptOf(state)!, attemptNumber: currentStamp(state)!.attempt + 1 });
}

function withLedger(state: RunState, seatId: string, extra: readonly LedgerEntry[]): RunState {
  return { ...state, seats: state.seats.map((s) => (s.seatId === seatId ? { ...s, ledger: [...s.ledger, ...extra] } : s)) };
}

/** Target kinds only characters still to be registered use: the Howler
 * Call's board waits for the Perfumist, unit 12's kinds for the rest. */
const AWAITING_CHARACTERS = ["board", "item", "route-option", "fanned-card", "option"];

const USABLE = new Map<string, RunState>(ACTIVE_SOURCES.map((def) => [def.id, findUsable(def)]));

describe("source shape", () => {
  it("has 6 characters, 0 powers, 15 upgrades and 13 items with unique ids", () => {
    const kinds = SOURCES.map((def) => def.kind);
    expect(kinds.filter((k) => k === "character")).toHaveLength(6);
    expect(kinds.filter((k) => k === "power")).toHaveLength(0);
    expect(kinds.filter((k) => k === "upgrade")).toHaveLength(15);
    expect(kinds.filter((k) => k === "item")).toHaveLength(13);
    expect(new Set(SOURCES.map((def) => def.id)).size).toBe(34);
  });

  it.each(SOURCES.map((def) => [def.id, def] as const))("%s: text is one plain sentence about the effect", (_id, def) => {
    expect(def.text).toMatch(/^[A-Z][^.!?()—]*\.$/);
    expect(def.name.length).toBeGreaterThan(0);
  });

  it.each(Object.values(CATALOG.characters).map((def) => [def.id, def] as const))(
    "%s: two or three upgrades and every power name their character and carry its id as a prefix",
    (id, def) => {
      expect([2, 3]).toContain(def.upgrades.length);
      for (const source of [...def.powers, ...def.upgrades]) {
        expect(source.characterId).toBe(id);
        expect(source.id.startsWith(`${id}.`)).toBe(true);
      }
    },
  );

  it.each(Object.values(CATALOG.items).map((def) => [def.id, def] as const))("%s: uses with an active and no limit, or a passive alone; a rarity and a price", (_id, def) => {
    expect(def.active === undefined).toBe(def.uses === undefined);
    expect(def.active === undefined).toBe(def.passive !== undefined);
    if (def.active !== undefined) expect("limit" in def.active).toBe(false);
    expect(["common", "rare"]).toContain(def.rarity);
    expect(Number.isInteger(def.price) && def.price > 0).toBe(true);
  });

  it("the catalogue uses every target kind but those added for the nine characters", () => {
    const used = new Set(ACTIVE_SOURCES.flatMap((def) => def.active!.targets.map((spec) => spec.kind)));
    expect([...used].sort()).toEqual(Object.keys(TARGET_KINDS).filter((kind) => !AWAITING_CHARACTERS.includes(kind)).sort());
  });
});

describe("each active source in play", () => {
  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: has effect if and only if a use adds a modifier", (id, def) => {
    const before = USABLE.get(id)!;
    const after = useFirst(before, keyFor(def));
    const added = effectsOf(after).length - effectsOf(before).length;
    expect(added > 0).toBe(def.active!.effect !== undefined);
    for (const effect of effectsOf(after).slice(effectsOf(before).length)) expect(effect.origin).toEqual({ kind: "seat", seatId: "p0", sourceKey: keyFor(def), sourceId: id });
  });

  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: a use spends its limit", (id, def) => {
    const key = keyFor(def);
    const before = USABLE.get(id)!;
    const left = remaining(before, "p0", key, CATALOG);
    const after = useFirst(before, key);
    switch (left.kind) {
      case "uses":
        if (after.seats[0]!.items.some((item) => item.uid === key) || def.kind !== "item") {
          expect(remaining(after, "p0", key, CATALOG)).toEqual({ kind: "uses", left: left.left - 1, of: left.of });
        } else {
          expect(left.left).toBe(1);
        }
        break;
      case "supplies":
        expect(after.supplies).toBe(before.supplies - left.cost);
        break;
      case "whispers":
        expect(remaining(after, "p0", key, CATALOG)).toEqual({ kind: "whispers", left: left.left - 1 });
        break;
    }
  });

  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: the use after the limit is refused", (id, def) => {
    const key = keyFor(def);
    const state = USABLE.get(id)!;
    const left = remaining(state, "p0", key, CATALOG);
    const status = abilityStatus(state, "p0", key, CATALOG)!;
    const targets = status.usable ? status.steps.map((step) => step.choices[0]!) : [];
    switch (left.kind) {
      case "uses":
        expect(useAbility(usedTimes(state, key, left.left), "p0", key, targets, CATALOG)).toEqual({ ok: false, error: "ability_spent" });
        break;
      case "whispers":
        expect(useAbility(whispered(state, left.left), "p0", key, targets, CATALOG)).toEqual({ ok: false, error: "ability_spent" });
        break;
      case "supplies": {
        const short = { ...state, supplies: left.cost };
        expect(useAbility(short, "p0", key, targets, CATALOG)).toEqual({ ok: false, error: "cannot_afford" });
        break;
      }
    }
  });

  it.each(ACTIVE_SOURCES.map((def) => [def.id, def] as const))("%s: per-run uses survive a replay and per-camp uses reset", (id, def) => {
    const key = keyFor(def);
    const state = USABLE.get(id)!;
    const left = remaining(state, "p0", key, CATALOG);
    if (left.kind !== "uses") return;
    const perCamp = limitOf(state.seats[0]!, key, CATALOG).kind === "per-camp";
    expect(remaining(replayed(usedTimes(state, key, left.of)), "p0", key, CATALOG)).toEqual({ kind: "uses", left: perCamp ? left.of : 0, of: left.of });
  });
});

describe("each item with an active, through its instance", () => {
  const cases = ACTIVE_ITEMS.map((def) => [def.id, def] as const);

  it.each(cases)("%s: uses exhaust as declared", (id, def) => {
    const state = USABLE.get(id)!;
    expect(remaining(state, "p0", ITEM_UID, CATALOG)).toEqual({ kind: "uses", left: declaredUses(def.uses), of: declaredUses(def.uses) });
    const last = useFirst(usedTimes(state, ITEM_UID, declaredUses(def.uses) - 1), ITEM_UID);
    const status = def.uses.kind === "per-camp" ? abilityStatus(last, "p0", ITEM_UID, CATALOG) : null;
    if (status !== null) expect(status).toMatchObject({ usable: false, error: "ability_spent" });
    else expect(useAbility(last, "p0", ITEM_UID, [], CATALOG)).toEqual({ ok: false, error: "not_owned" });
  });

  it.each(cases)("%s: a per-camp item resets on replay, and charges do not", (id, def) => {
    const spent = usedTimes(USABLE.get(id)!, ITEM_UID, declaredUses(def.uses));
    const left = def.uses.kind === "per-camp" ? 1 : 0;
    expect(remaining(replayed(spent), "p0", ITEM_UID, CATALOG)).toEqual({ kind: "uses", left, of: declaredUses(def.uses) });
  });

  it.each(cases)("%s: a spent instance leaves its owner, and only a per-camp item never does", (id, def) => {
    const state = USABLE.get(id)!;
    const after = useFirst(usedTimes(state, ITEM_UID, declaredUses(def.uses) - 1), ITEM_UID);
    const seat = after.seats[0]!;
    const kept = def.uses.kind === "per-camp";
    expect(seat.items.some((item) => item.uid === ITEM_UID)).toBe(kept);
    expect(seat.equipped.includes(ITEM_UID)).toBe(kept);
    expect(seat.items.map((item) => item.uid).filter((uid) => uid !== ITEM_UID)).toEqual(state.seats[0]!.items.map((item) => item.uid).filter((uid) => uid !== ITEM_UID));
  });
});

describe("random runs with the whole catalogue", () => {
  const RUN_SEEDS = ["contract-a", "contract-b", "contract-c"];
  const CHOICES = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9];

  /** Each run seats the next four characters round the catalogue, each
   * with one of its upgrades in turn, and a quarter of the items: two
   * equipped, the rest in the backpack. Three runs reach every character. */
  function fullKitRun(seed: string, run: number): RunState {
    const characters = Object.keys(CATALOG.characters);
    const characterAt = (i: number) => characters[(run * SEATS.length + i) % characters.length]!;
    return setupRun({
      seatIds: SEATS,
      seed,
      catalog: CATALOG,
      characters: Object.fromEntries(SEATS.map((seat, i) => [seat, characterAt(i)])),
      upgrades: Object.fromEntries(
        SEATS.map((seat, i) => {
          const upgrades = CATALOG.characters[characterAt(i)]!.upgrades;
          return [seat, upgrades[run % upgrades.length]!.id];
        }),
      ),
      items: Object.fromEntries(SEATS.map((seat, i) => [seat, ITEM_IDS.filter((_, j) => j % SEATS.length === i)])),
    });
  }

  const DRIVEN = RUN_SEEDS.map((seed, run) => {
    const initial = fullKitRun(seed, run);
    return { initial, ...driveRun(initial, CHOICES, CATALOG, 4000) };
  });

  it("uses abilities along the way", () => {
    const uses = DRIVEN.flatMap((d) => d.log).filter((entry) => entry.action.type === "use-ability");
    expect(new Set(uses.map((u) => (u.action as { sourceKey: string }).sourceKey)).size).toBeGreaterThan(5);
  });

  it("replays to identical states (determinism)", () => {
    for (const driven of DRIVEN) {
      expect(replayRun(driven.initial, driven.log, CATALOG)).toEqual(driven.states);
    }
  });

  it("conserves every card within an attempt", () => {
    for (const driven of DRIVEN) {
      for (let i = 1; i < driven.states.length; i++) {
        const before = attemptOf(driven.states[i - 1]!);
        const after = attemptOf(driven.states[i]!);
        if (before && after && before.attemptNumber === after.attemptNumber) {
          expect(campCardIds(after.camp)).toEqual(campCardIds(before.camp));
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
        for (const key of liveSourceKeys(seat, CATALOG)) expect(CATALOG.sources[defIdOf(seat, key)]).toBeDefined();
      }
    }
  });
});
