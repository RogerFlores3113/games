// Test-only run-level simulation helpers. Test-only support placed in src,
// like Phase 9's test-support.ts, so it is covered automatically by
// purity.test.ts's directory scan (no Node/Worker imports, no
// Math.random/Date.now, no Hanabi imports).
//
// CONSTRAINT (T-03-24, restated for the run layer): enumerateLegalRunActions
// builds CANDIDATE actions and filters them through applyRunAction ITSELF
// ONLY. Ability targets come from the engine's own step choices; legality is
// always the real dispatcher's call. If a rule in the real engine is wrong,
// this helper must reproduce that same wrongness, not silently correct it.
//
// setupRun is a deliberate TEST SEAM: it assigns characters, upgrades and
// items directly and opens a camp's loadout, skipping muster, votes and
// drafts, so content/contract/property tests can start a fixture already
// built.

import { currentActorSeatId } from "../camp";
import { rulesFor } from "./compose";
import { buildCatalog } from "./catalog";
import { abilityStatus } from "./abilities";
import { mintItems } from "./items";
import { createRun, openLoadout, runStatus } from "./lifecycle";
import { campIndex, drawPlan } from "./plan";
import { campSpecAt } from "./route";
import { applyRunAction } from "./stages/registry";
import { attemptOf } from "./attempt";
import { RUN_LENGTHS } from "./balance";
import { abilityKeys } from "./usage";
import { upgradeOffers } from "./shop";
import { currentWindow, WINDOWS } from "./windows";
import { defineCharacter, defineItem, defineUpgrade, type CharacterDef, type ItemDef, type Rarity } from "../content/source-def";
import { MODS } from "../content/mods/registry";
import { PAIRINGS, type PairingRule } from "../content/mods/pairings";
import type { ModDef } from "../content/mods/mod-def";
import type { Catalog, RunAction, RunLength, RunState } from "./types";

function plainCharacter(n: number): CharacterDef {
  return defineCharacter({
    id: `plain-${n}`,
    name: `Plain ${n}`,
    theme: "No powers",
    power: "Nothing",
    text: "Nothing happens.",
    upgrades: [
      defineUpgrade({ id: `plain-${n}.a`, name: `Plain ${n} A`, text: "Nothing happens." }),
      defineUpgrade({ id: `plain-${n}.b`, name: `Plain ${n} B`, text: "Nothing happens." }),
    ],
  });
}

/** Five characters with no abilities, so a fixture's crew changes no rule
 * unless the test gives it a source. */
export const PLAIN_CHARACTERS: Readonly<Record<string, CharacterDef>> = Object.fromEntries(
  [1, 2, 3, 4, 5].map((n) => {
    const def = plainCharacter(n);
    return [def.id, def];
  }),
);

/** An item that does nothing: a no-op passive. */
export function plainItem(id: string, opts: { readonly rarity?: Rarity; readonly price?: number } = {}): ItemDef {
  return defineItem({ id, name: id, rarity: opts.rarity ?? "common", price: opts.price ?? 2, text: "Nothing happens.", passive: { modifier: () => ({}) } });
}

/** A catalogue of plain characters (unless given) plus the given items and
 * extra characters, over the production camp modifiers plus any given. */
export function testCatalog(parts: {
  readonly characters?: Readonly<Record<string, CharacterDef>>;
  readonly items?: Readonly<Record<string, ItemDef>>;
  readonly mods?: Readonly<Record<string, ModDef>>;
  readonly pairings?: readonly PairingRule[];
} = {}): Catalog {
  return buildCatalog({
    characters: { ...PLAIN_CHARACTERS, ...parts.characters },
    items: parts.items ?? {},
    mods: { ...MODS, ...parts.mods },
    pairings: parts.pairings ?? PAIRINGS,
  });
}

/** Characters whose powers change nothing until used: an unnamed seat gets
 * these first, so a test's counts (whispers, slots, coins, routes) are the
 * base rules'. */
const QUIET_CHARACTERS = ["explorer", "magician", "hermit", "cartographer", "jd"];

/** Builds a run at the loadout of camp `camp` (default 1) of a `length`
 * (default standard) run: each seat gets `characters[seat]` or the
 * catalogue's next unclaimed character, quiet ones first, `upgrades[seat]` as its
 * upgrade, and one instance per id of `items[seat]`, minted in seat order as
 * the draft mints them (it0, it1, ...; equipped while a slot is free), so a
 * test can call `ready` at once. `supplies` and `purse` default to
 * createRun's. */
export function setupRun(opts: {
  seatIds: readonly string[];
  seed: string;
  catalog: Catalog;
  length?: RunLength;
  camp?: number;
  supplies?: number;
  purse?: number;
  characters?: Readonly<Record<string, string>>;
  upgrades?: Readonly<Record<string, string>>;
  items?: Readonly<Record<string, readonly string[]>>;
}): RunState {
  const run = createRun({ seatIds: opts.seatIds, seed: opts.seed });
  const chosen = Object.values(opts.characters ?? {});
  const quietFirst = (id: string) => (QUIET_CHARACTERS.includes(id) ? QUIET_CHARACTERS.indexOf(id) : QUIET_CHARACTERS.length);
  const spare = Object.keys(opts.catalog.characters)
    .filter((id) => !chosen.includes(id))
    .sort((a, b) => quietFirst(a) - quietFirst(b));

  const seats = run.seats.map((seat) => {
    const characterId = opts.characters?.[seat.seatId] ?? spare.shift();
    if (characterId === undefined) throw new Error("setupRun: not enough characters in the catalogue");
    return { ...seat, characterId, upgradeId: opts.upgrades?.[seat.seatId] ?? null };
  });

  const length = opts.length ?? "standard";
  const crewed = opts.seatIds.reduce<RunState>(
    (acc, seatId) => mintItems(acc, seatId, opts.items?.[seatId] ?? [], opts.catalog),
    { ...run, plan: drawPlan(opts.seed, length, opts.catalog), supplies: opts.supplies ?? run.supplies, purse: opts.purse ?? run.purse, seats },
  );
  return openLoadout(crewed, campSpecAt(opts.seed, length, campIndex(opts.camp ?? 1), opts.catalog), opts.catalog);
}

/** Drives `run` forward through applyRunAction ONLY until `target` is
 * reached: from a loadout, readies every seat, which deals the camp; for
 * "between-tricks" the current actor then picks their first unowned
 * objective, repeatedly, until the window opens. Throws on any rejected
 * action or if the run ends first. */
export function advanceTo(run: RunState, target: "objective-pick" | "between-tricks", catalog: Catalog): RunState {
  let next = run;

  for (const seatId of next.seatIds) {
    if (next.stage.tag !== "loadout") break;
    const result = applyRunAction(next, seatId, { type: "ready" }, catalog);
    if (!result.ok) {
      throw new Error(`advanceTo: ready rejected for seat "${seatId}": ${result.error}`);
    }
    next = result.state;
  }

  if (target === "objective-pick") {
    if (next.stage.tag !== "camp") {
      throw new Error(`advanceTo: expected a camp for "objective-pick", got stage ${next.stage.tag}`);
    }
    return next;
  }

  // target === "between-tricks": pick the current actor's first unowned
  // objective, repeatedly, until the window opens.
  for (;;) {
    const rules = rulesFor(next, catalog);
    if (currentWindow(next, rules) === "between-tricks") return next;
    const attempt = attemptOf(next);
    if (attempt === null) {
      throw new Error("advanceTo: run left the camp before reaching between-tricks");
    }
    const camp = attempt.camp;
    const actorSeatId = currentActorSeatId(camp, rules);
    if (actorSeatId === null) {
      throw new Error("advanceTo: camp was decided before reaching between-tricks");
    }
    const firstUnowned = camp.objectives.find((o) => o.ownerSeatId === null);
    if (firstUnowned === undefined) {
      throw new Error("advanceTo: no unowned objective left, but the window is still not between-tricks");
    }
    const result = applyRunAction(
      next,
      actorSeatId,
      { type: "pick-objective", objectiveId: firstUnowned.id },
      catalog,
    );
    if (!result.ok) {
      throw new Error(`advanceTo: pick-objective rejected for seat "${actorSeatId}": ${result.error}`);
    }
    next = result.state;
  }
}

/** The cartesian product of `pools`, preserving pool order. `[]` in ->
 * `[[]]` out (one empty combination), matching a target-free ability. */
function cartesian(pools: readonly (readonly string[])[]): string[][] {
  return pools.reduce<string[][]>(
    (acc, pool) => acc.flatMap((prefix) => pool.map((item) => [...prefix, item])),
    [[]],
  );
}

/** Candidate use-ability actions for every seat's live sources usable now,
 * built from the engine's own step choices (the first few per step). */
function abilityCandidates(run: RunState, catalog: Catalog): Array<{ seatId: string; action: RunAction }> {
  return run.seats.flatMap((seat) =>
    abilityKeys(run, seat, catalog).flatMap((sourceKey) => {
      const status = abilityStatus(run, seat.seatId, sourceKey, catalog);
      if (status === null || !status.usable) return [];
      return cartesian(status.steps.map((step) => step.choices.slice(0, 4))).map((targets) => ({
        seatId: seat.seatId,
        action: { type: "use-ability" as const, sourceKey, targets },
      }));
    }),
  );
}

/** Loadout candidates past ready: every buy, and equipping the newest items
 * when that changes the set. Equip moves one way only, so a deterministic
 * driver cannot toggle forever. */
function loadoutCandidates(run: RunState, catalog: Catalog): Array<{ seatId: string; action: RunAction }> {
  if (run.stage.tag !== "loadout") return [];
  const stock = run.stage.stock;
  return run.seats.flatMap((seat) => {
    const out: Array<{ seatId: string; action: RunAction }> = [];
    const newest = seat.items.slice(-rulesFor(run, catalog).itemSlots(run, seat.seatId)).map((item) => item.uid);
    if (newest.join() !== seat.equipped.join()) out.push({ seatId: seat.seatId, action: { type: "equip", itemUids: newest } });
    if (stock !== null) {
      for (const stockId of [...stock.map((e) => e.stockId), ...upgradeOffers(seat, catalog).map((o) => o.stockId)]) {
        out.push({ seatId: seat.seatId, action: { type: "buy", stockId } });
      }
    }
    return out;
  });
}

/** Every candidate action for every seat at `run`'s current stage, kept
 * only if `applyRunAction` itself accepts it (T-03-24 discipline: legality
 * is decided ONLY by the real transition, never re-derived here). Votes are
 * offered only to seats without a ballot, so a random driver cannot change
 * its mind forever. */
export function enumerateLegalRunActions(
  run: RunState,
  catalog: Catalog,
): Array<{ seatId: string; action: RunAction }> {
  const stage = run.stage;
  const candidates: Array<{ seatId: string; action: RunAction }> = [];
  const votes = (ballots: Readonly<Record<string, unknown>>, choices: readonly string[]): void => {
    for (const seat of run.seats) {
      if (Object.hasOwn(ballots, seat.seatId)) continue;
      for (const choice of [...choices, null]) candidates.push({ seatId: seat.seatId, action: { type: "vote", choice } });
    }
  };

  if (stage.tag === "muster") {
    for (const seat of run.seats) {
      for (const characterId of Object.keys(catalog.characters)) {
        candidates.push({ seatId: seat.seatId, action: { type: "pick-character", characterId } });
      }
    }
    votes(stage.ballots, Object.keys(RUN_LENGTHS));
  } else if (stage.tag === "route") {
    votes(stage.ballots, stage.options.map((o) => o.id));
  } else if (stage.tag === "draft") {
    for (const seat of run.seats) {
      (seat.offers[0]?.bundles ?? []).forEach((_, bundle) => candidates.push({ seatId: seat.seatId, action: { type: "pick-bundle", bundle } }));
    }
  } else if (stage.tag === "loadout" || stage.tag === "event") {
    for (const seat of run.seats) candidates.push({ seatId: seat.seatId, action: { type: "ready" } });
    candidates.push(...loadoutCandidates(run, catalog));
  } else if (stage.tag === "camp") {
    const camp = stage.attempt.camp;
    const rules = rulesFor(run, catalog);
    const actorSeatId = currentActorSeatId(camp, rules);

    if (actorSeatId !== null) {
      for (const objective of camp.objectives) {
        if (objective.ownerSeatId === null) {
          candidates.push({ seatId: actorSeatId, action: { type: "pick-objective", objectiveId: objective.id } });
        }
      }
      const ownHand = camp.hands.find((h) => h.seatId === actorSeatId);
      for (const card of ownHand?.cards ?? []) {
        candidates.push({ seatId: actorSeatId, action: { type: "play-card", cardId: card.id } });
      }
    }

    const window = currentWindow(run, rules);
    if (window !== null && WINDOWS[window].gated) {
      for (const seat of run.seats) candidates.push({ seatId: seat.seatId, action: { type: "skip-window" } });
    }

    if (window === "between-tricks") {
      for (const seat of run.seats) {
        const ownCards = camp.hands.find((h) => h.seatId === seat.seatId)?.cards.slice(0, 2) ?? [];
        for (const teammateId of run.seatIds) {
          if (teammateId === seat.seatId) continue;
          for (const card of ownCards) {
            candidates.push({ seatId: seat.seatId, action: { type: "whisper", targetSeatId: teammateId, cardId: card.id } });
          }
        }
      }
    }

    candidates.push(...abilityCandidates(run, catalog));
  }

  return candidates.filter((candidate) => applyRunAction(run, candidate.seatId, candidate.action, catalog).ok);
}

/** Drives `initial` forward by repeatedly enumerating legal actions and
 * applying `legal[choices[step % choices.length] % legal.length]` through
 * the real applyRunAction, until no legal action remains or runStatus leaves
 * "in_progress". Throws past `maxSteps`, and throws if an enumerated action
 * is rejected — the enumerator and the transition disagreeing is a bug in
 * one of them. */
export function driveRun(
  initial: RunState,
  choices: readonly number[],
  catalog: Catalog,
  maxSteps = 20000,
): { states: RunState[]; log: Array<{ seatId: string; action: RunAction }> } {
  const states: RunState[] = [initial];
  const log: Array<{ seatId: string; action: RunAction }> = [];

  let state = initial;
  let step = 0;

  for (;;) {
    if (runStatus(state) !== "in_progress") break;

    const legal = enumerateLegalRunActions(state, catalog);

    if (legal.length === 0) break;
    if (step >= maxSteps) {
      throw new Error("driveRun exceeded step bound");
    }

    const choice = choices.length === 0 ? 0 : choices[step % choices.length]!;
    const picked = legal[choice % legal.length]!;

    const result = applyRunAction(state, picked.seatId, picked.action, catalog);
    if (!result.ok) {
      throw new Error(
        `driveRun: enumerated action rejected by applyRunAction (${JSON.stringify(picked)}): ${result.error}`,
      );
    }

    state = result.state;
    states.push(state);
    log.push(picked);
    step++;
  }

  return { states, log };
}

/** Re-applies every logged action in order through applyRunAction, throwing
 * on any rejection, returning every state including `initial`. A
 * determinism smoke test — the full RUN-07 property (identical replay of a
 * whole run from its seed and action log) is Plan 10-17's job. */
export function replayRun(
  initial: RunState,
  log: readonly { seatId: string; action: RunAction }[],
  catalog: Catalog,
): RunState[] {
  const states: RunState[] = [initial];
  let state = initial;

  for (const { seatId, action } of log) {
    const result = applyRunAction(state, seatId, action, catalog);
    if (!result.ok) {
      throw new Error(`replayRun: rejected action for seat "${seatId}" (${JSON.stringify(action)}): ${result.error}`);
    }
    state = result.state;
    states.push(state);
  }

  return states;
}
