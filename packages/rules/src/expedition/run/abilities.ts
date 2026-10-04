// The ability pipeline. A use runs window, limit, canUse and target checks,
// hands the def's ops to the toolkit (the only mutation surface), then
// spends: a ledger entry keyed by the source key, supplies for a supplies
// limit, coins for a coins limit, and the item instance whose last charge
// this use spent.

import type { AdapterResult } from "../../adapter";
import { shuffleWithSeed } from "../../shuffle";
import { checkCampOutcome } from "../camp";
import { resolveTuned, windowsOf, type AbilityContext, type ItemAbility } from "../content/source-def";
import { attemptOf, withAttempt } from "./attempt";
import { rulesFor } from "./compose";
import { drawOffer } from "./draft";
import { STREAMS, seededIndex } from "./rng";
import type { RunRules } from "./run-rules";
import { resolveTargets, stepsFor, type AbilityStep, type SeatScope, type Target, type TargetSpec } from "./targets";
import { applyToolkitOps, type ToolkitOp } from "./toolkit";
import type { Catalog, LedgerEntry, LogEntry, RunError, RunState, SeatRun, SourceKey } from "./types";
import { abilityKeys, abilityOf, coinCost, currentStamp, defIdOf, grantOf, limitBlock, limitOf, ownerOf, remaining, sameStamp, seatOf, shareOf, spendsInstance, type Remaining } from "./usage";
import { WINDOWS, currentWindow, type ActiveWindow } from "./windows";

export type AbilityStatus =
  | { readonly usable: true; readonly steps: readonly AbilityStep[]; readonly remaining: Remaining }
  | { readonly usable: false; readonly error: RunError; readonly reason: string; readonly remaining: Remaining };

function abilityContext<S extends readonly TargetSpec[]>(
  run: RunState,
  seat: SeatRun,
  key: SourceKey,
  rules: RunRules,
  catalog: Catalog,
  targets: readonly Target[],
  drawsAllowed: boolean,
): AbilityContext<S> {
  const stamp = currentStamp(run);
  if (stamp === null) throw new Error("abilities: no window can be open at this stage");
  const camp = attemptOf(run)?.camp ?? null;
  const self = seat.seatId;
  let draw = 0;
  const nextDraw = (): number => {
    if (!drawsAllowed) throw new Error(`abilities: "${key}" drew randomness outside apply`);
    return draw++;
  };
  const nextStream = (): string => STREAMS.ability(stamp.camp, stamp.attempt, self, seat.ledger.length, nextDraw());
  const handOf = (seatId: string) => camp?.hands.find((h) => h.seatId === seatId)?.cards ?? [];
  return {
    self,
    sourceId: defIdOf(seat, key),
    owner: ownerOf(seat),
    run,
    camp,
    rules,
    catalog,
    // The one widening cast: resolveTargets produced these positionally from S.
    targets: targets as AbilityContext<S>["targets"],
    ownHand: () => handOf(self),
    handSize: (seatId) => handOf(seatId).length,
    randomCards: (seatId, n) => shuffleWithSeed(handOf(seatId).map((card) => card.id), run.seed, nextStream()).slice(0, n),
    randomIndex: (n) => seededIndex(run.seed, nextStream(), n),
    drawOffer: (seatId, shape) => {
      const j = nextDraw();
      const character = run.seats.find((s) => s.seatId === seatId)?.characterId ?? null;
      return drawOffer(run.seed, (bundle, item, part) => STREAMS.abilityItem(stamp.camp, stamp.attempt, self, seat.ledger.length, j, bundle, item, part), character, catalog, shape, "special");
    },
  };
}

function statusWith(run: RunState, seat: SeatRun, key: SourceKey, active: ItemAbility, catalog: Catalog, rules: RunRules): AbilityStatus {
  const left = remaining(run, seat.seatId, key, catalog);
  const window = currentWindow(run, rules);
  const windows = windowsOf(active);
  if (window === null || !windows.includes(window) || !WINDOWS[window].mayAct(run, rules, seat.seatId)) {
    return { usable: false, error: "wrong_window", reason: `Usable ${windows.map((w) => WINDOWS[w].phrase.toLowerCase()).join(" or ")}`, remaining: left };
  }
  const blocked = limitBlock(run, left, shareOf(seat, key, catalog).spends);
  if (blocked !== null) return { usable: false, error: blocked.error, reason: blocked.reason, remaining: left };
  const canUse = active.canUse ? active.canUse(abilityContext<readonly []>(run, seat, key, rules, catalog, [], false)) : true;
  if (canUse !== true) return { usable: false, error: "ability_unavailable", reason: canUse, remaining: left };
  const steps = stepsFor(scopeOf(run, seat.seatId, rules, catalog), active.targets);
  if (steps.some((step) => step.choices.length === 0)) {
    return { usable: false, error: "ability_unavailable", reason: "Nothing to pick", remaining: left };
  }
  return { usable: true, steps, remaining: left };
}

function scopeOf(run: RunState, seatId: string, rules: RunRules, catalog: Catalog): SeatScope {
  return { run, seatId, camp: attemptOf(run)?.camp ?? null, rules, catalog };
}

/** null for a source with no active ability. `key` must be live for the
 * seat. Order: window open and mayAct (wrong_window) -> limit (ability_spent
 * / cannot_afford) -> canUse (ability_unavailable) -> every step has a
 * choice (ability_unavailable). */
export function abilityStatus(run: RunState, seatId: string, key: SourceKey, catalog: Catalog): AbilityStatus | null {
  const seat = seatOf(run, seatId);
  if (!abilityKeys(run, seat, catalog).includes(key)) throw new Error(`abilityStatus: "${key}" is not live for "${seatId}"`);
  const active = abilityOf(run, seat, key, catalog);
  if (active === undefined) return null;
  return statusWith(run, seat, key, active, catalog, rulesFor(run, catalog));
}

/** The camp's failed objective ids right now; [] with no attempt or no failure. */
function failedObjectiveIds(run: RunState, rules: RunRules): readonly string[] {
  const camp = attemptOf(run)?.camp;
  if (camp === undefined) return [];
  const outcome = checkCampOutcome(camp, rules);
  return outcome.status === "failed" ? outcome.failedObjectiveIds : [];
}

/** The seat's live sources it could fire in `window` right now and has not
 * passed. A pass covers its stamp and only the failures it saw, so a new
 * failure in the same gap between tricks asks the seat again. */
export function pendingSourceKeys(run: RunState, seatId: string, window: ActiveWindow, catalog: Catalog, rules: RunRules): readonly SourceKey[] {
  const seat = seatOf(run, seatId);
  const stamp = currentStamp(run);
  const failed = failedObjectiveIds(run, rules);
  return abilityKeys(run, seat, catalog).filter((key) => {
    const active = abilityOf(run, seat, key, catalog);
    if (active === undefined || !windowsOf(active).includes(window)) return false;
    const passed = seat.ledger.some(
      (entry) =>
        entry.kind === "passed" &&
        entry.sourceKey === key &&
        stamp !== null &&
        sameStamp(entry.at, stamp) &&
        failed.every((id) => entry.failedObjectiveIds.includes(id)),
    );
    return !passed && statusWith(run, seat, key, active, catalog, rules).usable;
  });
}

function subjectSeatIds(targets: readonly Target[]): string[] {
  return targets.flatMap((target) => (target.kind === "player" || target.kind === "self" || target.kind === "hand" || target.kind === "fanned-card" ? [target.seatId] : []));
}

/** abilityStatus -> resolveTargets (invalid_target) -> canTarget
 * (invalid_target) -> a coins price at the picked targets (cannot_afford)
 * -> apply with a ctx built from the run before the use -> applyToolkitOps
 * -> spend (ledger, supplies, coins, the instance on its last charge) ->
 * in a camp, a public log entry (actor and subject seats, never a card). A
 * use the composed freeUse names spends nothing and counts against no
 * limit. */
export function useAbility(
  run: RunState,
  seatId: string,
  key: SourceKey,
  targetIds: unknown,
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  const seat = seatOf(run, seatId);
  if (!abilityKeys(run, seat, catalog).includes(key)) return { ok: false, error: "not_owned" };
  const active = abilityOf(run, seat, key, catalog);
  if (active === undefined) return { ok: false, error: "ability_unavailable" };

  const rules = rulesFor(run, catalog);
  const status = statusWith(run, seat, key, active, catalog, rules);
  if (!status.usable) return { ok: false, error: status.error };

  const resolved = resolveTargets(scopeOf(run, seatId, rules, catalog), active.targets, targetIds);
  if (!resolved.ok) return { ok: false, error: "invalid_target" };
  const canTarget = active.canTarget ? active.canTarget(abilityContext(run, seat, key, rules, catalog, resolved.targets, false)) : true;
  if (canTarget !== true) return { ok: false, error: "invalid_target" };

  const free = rules.freeUse(run, seatId, key);
  const limit = status.remaining;
  const grant = grantOf(run, key, catalog);
  const declared = grant === undefined ? limitOf(seat, key, catalog) : resolveTuned(grant.limit, ownerOf(seat));
  const coins = declared.kind === "coins" && !free ? coinCost(run, seat, key, declared, resolved.targets, rules, catalog) : 0;
  if (run.purse < coins) return { ok: false, error: "cannot_afford" };

  const sourceId = defIdOf(seat, key);
  const ops: ToolkitOp[] = [...active.apply(abilityContext(run, seat, key, rules, catalog, resolved.targets, true))];
  if (limit.kind === "supplies" && !free) ops.push({ op: "adjust-supplies", delta: -limit.cost });
  if (coins > 0) ops.push({ op: "adjust-coins", delta: -coins });
  const applied = applyToolkitOps(run, { kind: "seat", seatId, sourceKey: key, sourceId }, ops, rules, catalog);

  const at = currentStamp(run)!;
  const used: LedgerEntry = free ? { kind: "used", sourceKey: key, at, free: true } : { kind: "used", sourceKey: key, at };
  const spent = !free && spendsInstance(seat, key, catalog) && limit.kind === "uses" && limit.left === 1;
  const seats = applied.seats.map((s) => {
    if (s.seatId !== seatId) return s;
    if (!spent) return { ...s, ledger: [...s.ledger, used] };
    return { ...s, items: s.items.filter((item) => item.uid !== key), equipped: s.equipped.filter((uid) => uid !== key), ledger: [...s.ledger, used] };
  });
  const attempt = attemptOf(applied);
  if (attempt === null) return { ok: true, state: { ...applied, seats } };
  const logEntry: LogEntry = { event: "use-ability", actorSeatId: seatId, subjectSeatIds: subjectSeatIds(resolved.targets), sourceId, audience: "public" };
  return { ok: true, state: withAttempt({ ...applied, seats }, { ...attempt, log: [...attempt.log, logEntry] }) };
}

/** skip-window: in the open gated window, appends `passed` for each of the
 * seat's pending sources. nothing_to_skip when the seat is not pending. */
export function passWindow(run: RunState, seatId: string, catalog: Catalog): AdapterResult<RunState, RunError> {
  const rules = rulesFor(run, catalog);
  const window = currentWindow(run, rules);
  if (window === null || !WINDOWS[window].gated) return { ok: false, error: "wrong_window" };
  const pending = pendingSourceKeys(run, seatId, window, catalog, rules);
  if (pending.length === 0) return { ok: false, error: "nothing_to_skip" };
  const at = currentStamp(run)!;
  const failed = failedObjectiveIds(run, rules);
  const passes: LedgerEntry[] = pending.map((sourceKey) => ({ kind: "passed", sourceKey, at, failedObjectiveIds: failed }));
  const seats = run.seats.map((s) => (s.seatId === seatId ? { ...s, ledger: [...s.ledger, ...passes] } : s));
  return { ok: true, state: { ...run, seats } };
}
