// Folds over a seat's ledger: how much of each limit is left, what a
// character's pool holds, and which sources are live. Nothing here is stored;
// a replay needs no reset because per-camp counts filter by stamp.
//
// Abilities are keyed by SourceKey: the character id, the upgrade id, an
// item instance's uid, or the id of a camp modifier that grants every seat
// an ability. Effects, logs and reveals carry the def id instead (defIdOf),
// since a spent instance is gone by the time they are read.

import { resolveTuned, type CoinCost, type ItemAbility, type ItemUses, type Owner, type SourceDef, type SourceId, type UsageLimit } from "../content/source-def";
import type { Grant } from "../content/mods/mod-def";
import { nextAttemptNumber } from "./attempt";
import { rulesFor } from "./compose";
import { campStack } from "./stack";
import type { Catalog, ItemInstance, LedgerEntry, RunState, SeatRun, SourceKey, Stamp } from "./types";

export type Remaining =
  | { readonly kind: "uses"; readonly left: number; readonly of: number } // per-camp, per-run, item uses
  | { readonly kind: "pool"; readonly balance: number; readonly max: number; readonly cost: number }
  | { readonly kind: "supplies"; readonly cost: number }
  | { readonly kind: "crew"; readonly left: number; readonly earned: number; readonly locked: string }
  | { readonly kind: "coins"; readonly cost: number }; // the least a use costs, before targets

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

/** The latest attempt recorded at a camp the run has left. */
function lastAttemptAt(run: RunState, camp: number): number {
  return Math.max(1, ...run.history.filter((entry) => entry.camp === camp).map((entry) => entry.attempt));
}

/** The stamp a ledger entry written now would carry. A stage window stamps
 * the camp it belongs to at trick 0: the loadout the attempt it will deal,
 * the draft and the route the attempt that cleared. null in muster, the
 * event and once the run has ended. */
export function currentStamp(run: RunState): Stamp | null {
  const stage = run.stage;
  switch (stage.tag) {
    case "camp":
      return { camp: stage.camp.index, attempt: stage.attempt.attemptNumber, trick: stage.attempt.camp.completedTricks.length };
    case "loadout":
      return { camp: stage.camp.index, attempt: nextAttemptNumber(run, stage.camp.index), trick: 0 };
    case "draft":
      return { camp: stage.cleared, attempt: lastAttemptAt(run, stage.cleared), trick: 0 };
    case "route":
      return { camp: stage.from, attempt: lastAttemptAt(run, stage.from), trick: 0 };
    default:
      return null;
  }
}

/** Whether the seat used `key` in the attempt its stamp names. */
export function usedThisAttempt(run: RunState, seat: SeatRun, key: SourceKey): boolean {
  const stamp = currentStamp(run);
  return stamp !== null && seat.ledger.some((entry) => entry.kind === "used" && entry.sourceKey === key && entry.at.camp === stamp.camp && entry.at.attempt === stamp.attempt);
}

export function sameStamp(a: Stamp, b: Stamp): boolean {
  return a.camp === b.camp && a.attempt === b.attempt && a.trick === b.trick;
}

/** [character, upgrade?, ...equipped uids]: every key of the seat's own that contributes passives and abilities. */
export function liveSourceKeys(seat: SeatRun): readonly SourceKey[] {
  return [...(seat.characterId === null ? [] : [seat.characterId]), ...(seat.upgradeId === null ? [] : [seat.upgradeId]), ...seat.equipped];
}

/** The ability a camp modifier in play grants every seat under `key` (its id). */
export function grantOf(run: RunState, key: SourceKey, catalog: Catalog): Grant | undefined {
  return campStack(run, catalog).find((layer) => layer.def.id === key)?.body.grants;
}

/** [...liveSourceKeys, ...granted mod ids]: every key a seat may use an ability through. */
export function abilityKeys(run: RunState, seat: SeatRun, catalog: Catalog): readonly SourceKey[] {
  const granted = campStack(run, catalog).flatMap((layer) => (layer.body.grants === undefined ? [] : [layer.def.id]));
  return [...liveSourceKeys(seat), ...granted];
}

/** The ability behind any of the seat's ability keys; undefined for a passive. */
export function abilityOf(run: RunState, seat: SeatRun, key: SourceKey, catalog: Catalog): ItemAbility | undefined {
  return grantOf(run, key, catalog) ?? activeOfKey(seat, key, catalog);
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
  const item = itemOf(seat, key);
  if (item === undefined) return false;
  const def = sourceDef(catalog, item.itemId);
  return def.kind === "item" && def.uses !== undefined && def.uses.kind !== "per-camp";
}

/** The `used` entries that count against `key`'s limit: free uses never
 * do. An item instance's are counted on every seat's ledger, since an
 * instance given away keeps the uses it has spent. */
export function countedUses(run: RunState, seat: SeatRun, key: SourceKey): readonly LedgerEntry[] {
  const ledgers = itemOf(seat, key) === undefined ? [seat.ledger] : run.seats.map((s) => s.ledger);
  return ledgers.flat().filter((entry) => entry.kind === "used" && entry.sourceKey === key && entry.free !== true);
}

function sameAttempt(entry: LedgerEntry, stamp: Stamp | null): boolean {
  return stamp !== null && entry.kind !== "regained" && entry.at.camp === stamp.camp && entry.at.attempt === stamp.attempt;
}

/** A coins limit's price for this seat now; `targets` null before they are picked. */
export function coinCost(run: RunState, seat: SeatRun, key: SourceKey, limit: Extract<UsageLimit, { kind: "coins" }>, targets: CoinCost["targets"]): number {
  const uses = countedUses(run, seat, key);
  const stamp = currentStamp(run);
  const cost = limit.cost({ run, seatId: seat.seatId, uses: { thisCamp: uses.filter((entry) => sameAttempt(entry, stamp)).length, thisRun: uses.length }, targets });
  if (!Number.isInteger(cost) || cost < 0) throw new Error(`usage: "${key}" costs ${cost} coins`);
  return cost;
}

/** crew-tokens: earned this attempt minus every seat's `used` entries
 * stamped (camp, attempt). per-camp: times minus `used` entries stamped (camp, attempt). per-run:
 * times minus all `used` entries. pool: the character's balance. supplies:
 * the crew's, which a use never spends to zero. coins: the least a use
 * costs. Counted per key, so two instances of one item have separate uses;
 * free uses count for nothing. */
export function remaining(run: RunState, seatId: string, key: SourceKey, catalog: Catalog): Remaining {
  const seat = seatOf(run, seatId);
  const grant = grantOf(run, key, catalog);
  const limit = grant === undefined ? limitOf(seat, key, catalog) : resolveTuned(grant.limit, ownerOf(seat));
  const uses = countedUses(run, seat, key);
  switch (limit.kind) {
    case "crew-tokens": {
      const stamp = currentStamp(run);
      if (stamp === null) return { kind: "crew", left: 0, earned: 0, locked: limit.locked };
      const earned = limit.earned(run, rulesFor(run, catalog));
      const spent = run.seats
        .flatMap((s) => s.ledger)
        .filter((e) => e.kind === "used" && e.sourceKey === key && e.free !== true && sameAttempt(e, stamp)).length;
      return { kind: "crew", left: Math.max(0, earned - spent), earned, locked: limit.locked };
    }
    case "per-camp": {
      const stamp = currentStamp(run);
      const thisCamp = uses.filter((entry) => sameAttempt(entry, stamp)).length;
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
    case "coins":
      return { kind: "coins", cost: coinCost(run, seat, key, limit, null) };
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
    case "crew":
      return left.left > 0 ? null : { error: "ability_spent", reason: left.earned === 0 ? left.locked : "The crew has used it" };
    case "coins":
      return run.purse >= left.cost ? null : { error: "cannot_afford", reason: `Needs ${left.cost} coins, the crew has ${run.purse}` };
  }
}
