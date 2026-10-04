// The run's plan: its length and its boss camps, drawn once at the length
// vote. A tier whose pool is empty (the temple until it lands) plans null,
// and its camp plays plain.

import { RUN_LENGTHS } from "./balance";
import { STREAMS, seededIndex } from "./rng";
import type { Catalog, CampIndex, RunLength, RunState } from "./types";

export type BossTier = "animal" | "disaster" | "temple";
export type PlannedBoss = { readonly at: CampIndex; readonly tier: BossTier; readonly modId: string | null };
export type RunPlan = { readonly length: RunLength; readonly bosses: readonly PlannedBoss[] };

export function campIndex(n: number): CampIndex {
  if (!Number.isInteger(n) || n < 1) throw new Error(`campIndex: must be a whole number from 1, got ${n}`);
  return n as CampIndex;
}

/** The drawable bosses of a tier, ids sorted. */
export function bossPool(tier: BossTier, catalog: Catalog): readonly string[] {
  return Object.values(catalog.mods)
    .filter((def) => def.kind === tier && def.weight > 0)
    .map((def) => def.id)
    .sort();
}

function drawBoss(seed: string, tier: BossTier, catalog: Catalog): string | null {
  if (tier === "temple") return null;
  const pool = bossPool(tier, catalog);
  return pool.length === 0 ? null : pool[seededIndex(seed, STREAMS.plannedBoss(tier), pool.length)]!;
}

/** Once, at the length vote: each boss camp's boss from its tier's pool. */
export function drawPlan(seed: string, length: RunLength, catalog: Catalog): RunPlan {
  return { length, bosses: RUN_LENGTHS[length].bossCamps.map(({ at, tier }) => ({ at: campIndex(at), tier, modId: drawBoss(seed, tier, catalog) })) };
}

export function campCount(plan: RunPlan): number {
  return RUN_LENGTHS[plan.length].camps;
}

export function bossAt(plan: RunPlan, at: CampIndex): PlannedBoss | null {
  return plan.bosses.find((boss) => boss.at === at) ?? null;
}

export function isFinalCamp(plan: RunPlan, at: CampIndex): boolean {
  return at === campCount(plan);
}

/** The furthest camp the crew has seen previewed. A planned boss is public
 * once its camp is within it. */
export function horizon(run: RunState): number {
  const stage = run.stage;
  switch (stage.tag) {
    case "muster":
      return 0;
    case "loadout":
    case "camp":
      return stage.camp.index;
    case "draft":
      return stage.cleared;
    case "route":
      return stage.from + 1;
    case "event":
      return stage.route.next.index;
    case "ended":
      return Infinity;
  }
}

/** The boss id the crew may see: null beyond the horizon. */
export function visibleBossId(run: RunState, boss: PlannedBoss): string | null {
  return boss.at <= horizon(run) ? boss.modId : null;
}
