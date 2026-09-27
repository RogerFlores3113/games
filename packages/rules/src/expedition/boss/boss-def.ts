// Phase 10 boss-definition type contract (Plan 02).
//
// A boss twist is expressed purely as a RuleModifier — it participates in
// the same base -> boss -> gear composition order as any gear passive, with
// no separate application mechanism. Boss twists are explicitly PROVISIONAL
// placeholders (owner note, 10-CONTEXT.md): replacing them later must touch
// only catalogue files (Plan 10-14's registry), never this type.

import type { RuleModifier } from "../run/run-rules";

export type BossDef = { readonly id: string; readonly name: string; readonly text: string; readonly modifiers: RuleModifier };
