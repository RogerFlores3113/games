// The production CATALOG (Plan 10-16, RUN-06/ENG-01). This is the single
// Catalog value Phase 11's adapter passes to every applyRunAction/createRun
// call — the real ten-item gear catalogue (gear/registry.ts's
// GEAR_REGISTRY) plus the four provisional boss twists (boss/registry.ts's
// BOSS_REGISTRY), and nothing else.
//
// Tests may extend this with local fakes (spread CATALOG.gear/CATALOG.bosses
// into a wider object literal) rather than importing a second production
// catalog — replay-reset.test.ts's fail-then-replay fixture does exactly
// this to add a deterministic "fails the camp on demand" fixture gear
// alongside the real ten items.

import { GEAR_REGISTRY } from "../gear/registry";
import { BOSS_REGISTRY } from "../boss/registry";
import type { Catalog } from "./types";

export const CATALOG: Catalog = { gear: GEAR_REGISTRY, bosses: BOSS_REGISTRY };
