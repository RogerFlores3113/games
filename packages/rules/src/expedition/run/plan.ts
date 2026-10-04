// The run's plan: its length and its boss camps, drawn once at the length
// vote. Boss pools are empty until the bosses land, so every planned boss is
// null and its camp plays plain.

import { RUN_LENGTHS } from "./balance";
import type { CampIndex, RunLength } from "./types";

export type BossTier = "animal" | "disaster" | "temple";
export type PlannedBoss = { readonly at: CampIndex; readonly tier: BossTier; readonly modId: string | null };
export type RunPlan = { readonly length: RunLength; readonly bosses: readonly PlannedBoss[] };

export function campIndex(n: number): CampIndex {
  if (!Number.isInteger(n) || n < 1) throw new Error(`campIndex: must be a whole number from 1, got ${n}`);
  return n as CampIndex;
}

export function drawPlan(length: RunLength): RunPlan {
  return { length, bosses: RUN_LENGTHS[length].bossCamps.map(({ at, tier }) => ({ at: campIndex(at), tier, modId: null })) };
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
