// Boss catalogue registry (Plan 10-14, ENG-01, BOSS-01).
//
// ENG-01 recipe: to add a new boss twist, add one file under boss/
// exporting a BossDef, then add one entry here — boss.contract.test.ts
// iterates Object.entries(BOSS_REGISTRY) automatically, so a newly
// registered twist is contract-checked with no test-file edit required.
//
// The four twists below are the v1 PROVISIONAL placeholders (10-CONTEXT.md,
// owner note): they are too close to The Crew's own boss twists and will be
// replaced. Replacing any one of them later touches only its own file plus
// its one line here — nothing else names a boss id.

import { radioSilence } from "./radio-silence";
import { eclipse } from "./eclipse";
import { blindOrders } from "./blind-orders";
import { mutiny } from "./mutiny";
import type { BossDef } from "./boss-def";

export const BOSS_REGISTRY = {
  "radio-silence": radioSilence,
  eclipse,
  "blind-orders": blindOrders,
  mutiny,
} satisfies Readonly<Record<string, BossDef>>;

export type BossId = keyof typeof BOSS_REGISTRY;
