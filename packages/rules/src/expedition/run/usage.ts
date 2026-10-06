// Folds over a seat's ledger: how much of each limit is left and which
// sources are live. Nothing here is stored;
// a replay needs no reset because per-camp counts filter by stamp.
//
// Abilities are keyed by SourceKey: the character id, a power's id, the
// upgrade id, an item instance's uid, or the id of a camp modifier that grants every seat
// an ability. Effects, logs and reveals carry the def id instead (defIdOf),
// since a spent instance is gone by the time they are read.

import { resolveTuned, type CoinCost, type ItemAbility, type ItemUses, type Owner, type SourceDef, type SourceId, type UsageLimit } from "../content/source-def";
import type { Grant } from "../content/mods/mod-def";
import { nextAttemptNumber } from "./attempt";
import { campIndex } from "./plan";
import { rulesFor } from "./compose";
import type { RunRules } from "./run-rules";
import { campStack } from "./stack";
import type { CampIndex, Catalog, ItemInstance, RunState, SeatRun, SourceKey, Stamp } from "./types";
import { whispersUsedBy } from "./whisper";

export type Remaining =
  | { readonly kind: "uses"; readonly left: number; readonly of: number } // per-camp, per-run, item uses
  | { readonly kind: "supplies"; readonly cost: number }
  | { readonly kind: "crew"; readonly left: number; readonly earned: number; readonly locked: string }
  | { readonly kind: "coins"; readonly cost: number } // the least a use costs, before targets
  | { readonly kind: "unlimited" }
  | { readonly kind: "whispers"; readonly left: number };

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

function comingAttempt(run: RunState, camp: CampIndex): Stamp {
  return { camp, attempt: nextAttemptNumber(run, camp), trick: 0 };
}

/** The stamp a ledger entry written now would carry. A stage window stamps
 * the camp it belongs to at trick 0: the shop and the loadout the attempt
 * they lead to, the draft and the route the attempt that cleared (the draft
 * before camp 1, camp 1's first). null in muster, the event and once the run
 * has ended. */
export function currentStamp(run: RunState): Stamp | null {
  const stage = run.stage;
  switch (stage.tag) {
    case "camp":
      return { camp: stage.camp.index, attempt: stage.attempt.attemptNumber, trick: stage.attempt.camp.completedTricks.length };
    case "loadout":
      return comingAttempt(run, stage.camp.index);
    case "shop":
      return comingAttempt(run, stage.next);
    case "draft": {
      if (stage.next === 1) return comingAttempt(run, stage.next);
      const cleared = campIndex(stage.next - 1);
      return { camp: cleared, attempt: lastAttemptAt(run, cleared), trick: 0 };
    }
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

/** [character, ...its powers, upgrade?, ...equipped uids]: every key of the seat's own that contributes passives and abilities. */
export function liveSourceKeys(seat: SeatRun, catalog: Catalog): readonly SourceKey[] {
  const character = seat.characterId === null ? undefined : catalog.characters[seat.characterId];
  const powers = character?.powers.map((power) => power.id) ?? [];
  return [...(seat.characterId === null ? [] : [seat.characterId]), ...powers, ...(seat.upgradeId === null ? [] : [seat.upgradeId]), ...seat.equipped];
}

/** The ability a camp modifier in play grants every seat under `key` (its id). */
export function grantOf(run: RunState, key: SourceKey, catalog: Catalog): Grant | undefined {
  return campStack(run, catalog).find((layer) => layer.def.id === key)?.body.grants;
}

/** [...liveSourceKeys, ...granted mod ids]: every key a seat may use an ability through. */
export function abilityKeys(run: RunState, seat: SeatRun, catalog: Catalog): readonly SourceKey[] {
  const granted = campStack(run, catalog).flatMap((layer) => (layer.body.grants === undefined ? [] : [layer.def.id]));
  return [...liveSourceKeys(seat, catalog), ...granted];
}

/** The ability behind any of the seat's ability keys; undefined for a passive. */
export function abilityOf(run: RunState, seat: SeatRun, key: SourceKey, catalog: Catalog): ItemAbility | undefined {
  return grantOf(run, key, catalog) ?? activeOfKey(seat, key, catalog);
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

/** A source's declared limit, a shares limit included. */
function declaredLimit(seat: SeatRun, key: SourceKey, catalog: Catalog): UsageLimit {
  const def = defOfKey(seat, key, catalog);
  if (def.kind === "item" && def.uses !== undefined) return limitOfUses(def.uses);
  if (def.kind === "item" || def.active === undefined) throw new Error(`usage: source "${key}" has no active ability`);
  return resolveTuned(def.active.limit, ownerOf(seat));
}

/** The key whose limit a use of `key` counts against, and how many uses
 * one use takes: a shares limit names another of the seat's sources. */
export function shareOf(seat: SeatRun, key: SourceKey, catalog: Catalog): { readonly key: SourceKey; readonly spends: number } {
  if (itemOf(seat, key) !== undefined || !Object.hasOwn(catalog.sources, key) || catalog.sources[key]!.active === undefined) return { key, spends: 1 };
  const limit = declaredLimit(seat, key, catalog);
  return limit.kind === "shares" ? { key: limit.of, spends: limit.spends } : { key, spends: 1 };
}

/** The limit a use of `key` counts against: its own, or the one it shares. */
export function limitOf(seat: SeatRun, key: SourceKey, catalog: Catalog): UsageLimit {
  const limit = declaredLimit(seat, key, catalog);
  if (limit.kind !== "shares") return limit;
  const shared = declaredLimit(seat, limit.of, catalog);
  if (shared.kind === "shares") throw new Error(`usage: "${key}" shares "${limit.of}", which shares another`);
  return shared;
}

/** True when the key is an item instance that leaves its owner once its uses run out. */
export function spendsInstance(seat: SeatRun, key: SourceKey, catalog: Catalog): boolean {
  const item = itemOf(seat, key);
  if (item === undefined) return false;
  const def = sourceDef(catalog, item.itemId);
  return def.kind === "item" && def.uses !== undefined && def.uses.kind !== "per-camp";
}

/** The counted uses of `key`'s limit, each with how many uses it took: free
 * uses never count, and a source sharing the limit counts its `spends`. An
 * item instance's are counted on every seat's ledger, since an instance
 * given away keeps the uses it has spent. */
function countedUses(run: RunState, seat: SeatRun, key: SourceKey, catalog: Catalog): readonly { readonly at: Stamp; readonly weight: number }[] {
  const ledgers = itemOf(seat, key) === undefined ? [seat.ledger] : run.seats.map((s) => s.ledger);
  return ledgers.flat().flatMap((entry) => {
    if (entry.kind !== "used" || entry.free === true) return [];
    const share = shareOf(seat, entry.sourceKey, catalog);
    return share.key === key ? [{ at: entry.at, weight: share.spends }] : [];
  });
}

function sameAttempt(at: Stamp, stamp: Stamp | null): boolean {
  return stamp !== null && at.camp === stamp.camp && at.attempt === stamp.attempt;
}

function total(uses: readonly { readonly weight: number }[]): number {
  return uses.reduce((sum, use) => sum + use.weight, 0);
}

/** A coins limit's price for this seat now; `targets` null before they are picked. */
export function coinCost(
  run: RunState,
  seat: SeatRun,
  key: SourceKey,
  limit: Extract<UsageLimit, { kind: "coins" }>,
  targets: CoinCost["targets"],
  rules: RunRules,
  catalog: Catalog,
): number {
  const uses = countedUses(run, seat, key, catalog);
  const stamp = currentStamp(run);
  const cost = limit.cost({ run, rules, catalog, seatId: seat.seatId, uses: { thisCamp: total(uses.filter((use) => sameAttempt(use.at, stamp))), thisRun: total(uses) }, targets });
  if (!Number.isInteger(cost) || cost < 0) throw new Error(`usage: "${key}" costs ${cost} coins`);
  return cost;
}

/** crew-tokens: earned this attempt minus every seat's `used` entries
 * stamped (camp, attempt). per-camp: times minus the uses stamped (camp,
 * attempt). per-run: times minus every use. supplies: the crew's, which a
 * use never spends to zero. coins: the least a use costs. whispers: the
 * seat's whispers left this camp. A shares limit reads the source it
 * shares. Counted per key, so two instances of one item have separate uses;
 * free uses count for nothing. */
export function remaining(run: RunState, seatId: string, key: SourceKey, catalog: Catalog): Remaining {
  const seat = seatOf(run, seatId);
  const grant = grantOf(run, key, catalog);
  const counted = grant === undefined ? shareOf(seat, key, catalog).key : key;
  const limit = grant === undefined ? limitOf(seat, key, catalog) : resolveTuned(grant.limit, ownerOf(seat));
  const stamp = currentStamp(run);
  switch (limit.kind) {
    case "crew-tokens": {
      if (stamp === null) return { kind: "crew", left: 0, earned: 0, locked: limit.locked };
      const earned = limit.earned(run, rulesFor(run, catalog));
      const spent = run.seats
        .flatMap((s) => s.ledger)
        .filter((e) => e.kind === "used" && e.sourceKey === key && e.free !== true && sameAttempt(e.at, stamp)).length;
      return { kind: "crew", left: Math.max(0, earned - spent), earned, locked: limit.locked };
    }
    case "per-camp": {
      const thisCamp = total(countedUses(run, seat, counted, catalog).filter((use) => sameAttempt(use.at, stamp)));
      return { kind: "uses", left: Math.max(0, limit.times - thisCamp), of: limit.times };
    }
    case "per-run":
      return { kind: "uses", left: Math.max(0, limit.times - total(countedUses(run, seat, counted, catalog))), of: limit.times };
    case "supplies":
      return { kind: "supplies", cost: limit.cost };
    case "coins":
      return { kind: "coins", cost: coinCost(run, seat, key, limit, null, rulesFor(run, catalog), catalog) };
    case "unlimited":
      return { kind: "unlimited" };
    case "whispers":
      return { kind: "whispers", left: Math.max(0, rulesFor(run, catalog).whispersPerCamp(run, seatId) - whispersUsedBy(run, seatId)) };
    case "shares":
      throw new Error(`usage: "${key}" resolved to a shares limit`);
  }
}

/** null when the limit allows a use taking `spends` uses now, else why not. */
export function limitBlock(run: RunState, left: Remaining, spends = 1): { readonly error: "ability_spent" | "cannot_afford"; readonly reason: string } | null {
  switch (left.kind) {
    case "uses":
      if (left.left === 0) return { error: "ability_spent", reason: left.of === 1 ? "Already used" : `Already used ${left.of} times` };
      return left.left >= spends ? null : { error: "ability_spent", reason: `Needs ${spends} uses, ${left.left} left` };
    case "supplies":
      return run.supplies > left.cost ? null : { error: "cannot_afford", reason: "The crew can't spare the supplies" };
    case "crew":
      return left.left > 0 ? null : { error: "ability_spent", reason: left.earned === 0 ? left.locked : "The crew has used it" };
    case "coins":
      return run.purse >= left.cost ? null : { error: "cannot_afford", reason: `Needs ${left.cost} coins, the crew has ${run.purse}` };
    case "unlimited":
      return null;
    case "whispers":
      return left.left > 0 ? null : { error: "ability_spent", reason: "No whispers left" };
  }
}
