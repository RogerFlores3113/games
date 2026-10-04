// Folds over a seat's ledger: how much of each limit is left, what a
// character's pool holds, and which sources are live. Nothing here is stored;
// a replay needs no reset because per-camp counts filter by stamp.

import { resolveTuned, type Owner, type SourceDef, type SourceId, type UsageLimit } from "../content/source-def";
import type { Catalog, RunState, SeatRun, Stamp } from "./types";

export type Remaining =
  | { readonly kind: "uses"; readonly left: number; readonly of: number } // per-camp, per-run
  | { readonly kind: "single-use" } // held means available
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
  return { seatId: seat.seatId, hasUpgrade: (upgradeId) => seat.kit.includes(upgradeId) };
}

/** The stamp a ledger entry written now would carry; null with no attempt. */
export function currentStamp(run: RunState): Stamp | null {
  if (run.attempt === null) return null;
  return { camp: run.campNumber, attempt: run.attempt.attemptNumber, trick: run.attempt.camp.completedTricks.length };
}

export function sameStamp(a: Stamp, b: Stamp): boolean {
  return a.camp === b.camp && a.attempt === b.attempt && a.trick === b.trick;
}

/** [characterId, ...kit]: every source that contributes passives and abilities. */
export function liveSourceIds(seat: SeatRun): readonly SourceId[] {
  return seat.characterId === null ? seat.kit : [seat.characterId, ...seat.kit];
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

export function limitOf(seat: SeatRun, sourceId: SourceId, catalog: Catalog): UsageLimit {
  const active = sourceDef(catalog, sourceId).active;
  if (active === undefined) throw new Error(`usage: source "${sourceId}" has no active ability`);
  return resolveTuned(active.limit, ownerOf(seat));
}

/** per-camp: times minus `used` entries stamped (camp, attempt). per-run:
 * times minus all `used` entries. pool: the character's balance. supplies:
 * the crew's, which a use never spends to zero. */
export function remaining(run: RunState, seatId: string, sourceId: SourceId, catalog: Catalog): Remaining {
  const seat = seatOf(run, seatId);
  const limit = limitOf(seat, sourceId, catalog);
  const uses = seat.ledger.filter((entry) => entry.kind === "used" && entry.sourceId === sourceId);
  switch (limit.kind) {
    case "per-camp": {
      const stamp = currentStamp(run);
      const thisCamp =
        stamp === null ? 0 : uses.filter((entry) => entry.at.camp === stamp.camp && entry.at.attempt === stamp.attempt).length;
      return { kind: "uses", left: Math.max(0, limit.times - thisCamp), of: limit.times };
    }
    case "per-run":
      return { kind: "uses", left: Math.max(0, limit.times - uses.length), of: limit.times };
    case "single-use":
      return { kind: "single-use" };
    case "pool": {
      const balance = poolBalance(seat, catalog);
      const pool = seat.characterId === null ? undefined : catalog.characters[seat.characterId]?.pool;
      if (balance === null || pool === undefined) {
        throw new Error(`usage: source "${sourceId}" spends a pool its holder's character lacks`);
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
    case "single-use":
      return null;
    case "pool":
      return left.balance >= left.cost ? null : { error: "cannot_afford", reason: `Needs ${left.cost}, you have ${left.balance}` };
    case "supplies":
      return run.supplies > left.cost ? null : { error: "cannot_afford", reason: "The crew can't spare the supplies" };
  }
}
