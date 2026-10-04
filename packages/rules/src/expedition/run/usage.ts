// Folds over a seat's ledger: how much of each limit is left, what a
// character's pool holds, and which sources are live. Nothing here is stored;
// a replay needs no reset because per-camp counts filter by stamp.
//
// Abilities are keyed by SourceKey: the character id, the upgrade id, or an
// item instance's uid. Effects, logs and reveals carry the def id instead
// (defIdOf), since a spent instance is gone by the time they are read.

import { resolveTuned, type ItemAbility, type ItemUses, type Owner, type SourceDef, type SourceId, type UsageLimit } from "../content/source-def";
import type { Catalog, ItemInstance, RunState, SeatRun, SourceKey, Stamp } from "./types";

export type Remaining =
  | { readonly kind: "uses"; readonly left: number; readonly of: number } // per-camp, per-run, item uses
  | { readonly kind: "pool"; readonly balance: number; readonly max: number; readonly cost: number }
  | { readonly kind: "supplies"; readonly cost: number };

export function seatOf(run: RunState, seatId: string): SeatRun {
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (seat === undefined) throw new Error(`usage: unknown seat "${seatId}"`);
  return seat;
}

export function sourceDef(catalog: Catalog, sourceId: SourceId): SourceDef {
  if (!Object.hasOwn(catalog.sources, sourceId)) throw new Error(`usage: unknown source id "${sourceId}"`);
  return catalog.sources[sourceId]!;
}

export function ownerOf(seat: SeatRun): Owner {
  return { seatId: seat.seatId, hasUpgrade: (upgradeId) => seat.upgradeId === upgradeId };
}

export function itemOf(seat: SeatRun, uid: string): ItemInstance | undefined {
  return seat.items.find((item) => item.uid === uid);
}

/** The def id behind a key: an instance's item id, else the key itself. */
export function defIdOf(seat: SeatRun, key: SourceKey): SourceId {
  return itemOf(seat, key)?.itemId ?? key;
}

export function defOfKey(seat: SeatRun, key: SourceKey, catalog: Catalog): SourceDef {
  return sourceDef(catalog, defIdOf(seat, key));
}

/** The ability behind a key, without its limit; undefined for a passive. */
export function activeOfKey(seat: SeatRun, key: SourceKey, catalog: Catalog): ItemAbility | undefined {
  return defOfKey(seat, key, catalog).active;
}

/** Owned items not equipped. They give no passive and no ability. */
export function backpackOf(seat: SeatRun): readonly ItemInstance[] {
  return seat.items.filter((item) => !seat.equipped.includes(item.uid));
}

/** The stamp a ledger entry written now would carry; null outside a camp. */
export function currentStamp(run: RunState): Stamp | null {
  if (run.stage.tag !== "camp") return null;
  const attempt = run.stage.attempt;
  return { camp: run.stage.camp.index, attempt: attempt.attemptNumber, trick: attempt.camp.completedTricks.length };
}

/** Whether the seat used `key` in the attempt being played; false outside a camp. */
export function usedThisAttempt(run: RunState, seat: SeatRun, key: SourceKey): boolean {
  const stamp = currentStamp(run);
  return stamp !== null && seat.ledger.some((entry) => entry.kind === "used" && entry.sourceKey === key && entry.at.camp === stamp.camp && entry.at.attempt === stamp.attempt);
}

export function sameStamp(a: Stamp, b: Stamp): boolean {
  return a.camp === b.camp && a.attempt === b.attempt && a.trick === b.trick;
}

/** [character, upgrade?, ...equipped uids]: every key that contributes passives and abilities. */
export function liveSourceKeys(seat: SeatRun): readonly SourceKey[] {
  return [...(seat.characterId === null ? [] : [seat.characterId]), ...(seat.upgradeId === null ? [] : [seat.upgradeId]), ...seat.equipped];
}

/** start, then in ledger order: minus poolCost, plus regained capped at max. */
export function poolBalance(seat: SeatRun, catalog: Catalog): number | null {
  if (seat.characterId === null) return null;
  const pool = catalog.characters[seat.characterId]?.pool;
  if (pool === undefined) return null;
  return seat.ledger.reduce((balance, entry) => {
    if (entry.kind === "used") return balance - entry.poolCost;
    if (entry.kind === "regained") return Math.min(pool.max, balance + entry.amount);
    return balance;
  }, pool.start);
}

/** An item's uses as a limit: per-camp is once per attempt, charges count
 * all time, single-use is one charge. */
function limitOfUses(uses: ItemUses): UsageLimit {
  switch (uses.kind) {
    case "per-camp":
      return { kind: "per-camp", times: 1 };
    case "charges":
      return { kind: "per-run", times: uses.n };
    case "single-use":
      return { kind: "per-run", times: 1 };
  }
}

export function limitOf(seat: SeatRun, key: SourceKey, catalog: Catalog): UsageLimit {
  const def = defOfKey(seat, key, catalog);
  if (def.kind === "item" && def.uses !== undefined) return limitOfUses(def.uses);
  if (def.kind === "item" || def.active === undefined) throw new Error(`usage: source "${key}" has no active ability`);
  return resolveTuned(def.active.limit, ownerOf(seat));
}

/** True when the key is an item instance that leaves its owner once its uses run out. */
export function spendsInstance(seat: SeatRun, key: SourceKey, catalog: Catalog): boolean {
  const def = defOfKey(seat, key, catalog);
  return def.kind === "item" && def.uses !== undefined && def.uses.kind !== "per-camp";
}

/** per-camp: times minus `used` entries stamped (camp, attempt). per-run:
 * times minus all `used` entries. pool: the character's balance. supplies:
 * the crew's, which a use never spends to zero. Counted per key, so two
 * instances of one item have separate uses. */
export function remaining(run: RunState, seatId: string, key: SourceKey, catalog: Catalog): Remaining {
  const seat = seatOf(run, seatId);
  const limit = limitOf(seat, key, catalog);
  const uses = seat.ledger.filter((entry) => entry.kind === "used" && entry.sourceKey === key);
  switch (limit.kind) {
    case "per-camp": {
      const stamp = currentStamp(run);
      const thisCamp =
        stamp === null ? 0 : uses.filter((entry) => entry.at.camp === stamp.camp && entry.at.attempt === stamp.attempt).length;
      return { kind: "uses", left: Math.max(0, limit.times - thisCamp), of: limit.times };
    }
    case "per-run":
      return { kind: "uses", left: Math.max(0, limit.times - uses.length), of: limit.times };
    case "pool": {
      const balance = poolBalance(seat, catalog);
      const pool = seat.characterId === null ? undefined : catalog.characters[seat.characterId]?.pool;
      if (balance === null || pool === undefined) {
        throw new Error(`usage: source "${key}" spends a pool its holder's character lacks`);
      }
      return { kind: "pool", balance, max: pool.max, cost: limit.cost };
    }
    case "supplies":
      return { kind: "supplies", cost: limit.cost };
  }
}

/** null when the limit allows a use now, else why not. */
export function limitBlock(run: RunState, left: Remaining): { readonly error: "ability_spent" | "cannot_afford"; readonly reason: string } | null {
  switch (left.kind) {
    case "uses":
      return left.left > 0 ? null : { error: "ability_spent", reason: left.of === 1 ? "Already used" : `Already used ${left.of} times` };
    case "pool":
      return left.balance >= left.cost ? null : { error: "cannot_afford", reason: `Needs ${left.cost}, you have ${left.balance}` };
    case "supplies":
      return run.supplies > left.cost ? null : { error: "cannot_afford", reason: "The crew can't spare the supplies" };
  }
}
