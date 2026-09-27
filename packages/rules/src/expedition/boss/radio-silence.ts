// Monsoon boss twist (Plan 10-12, BOSS-01). PROVISIONAL placeholder (owner
// note, 10-CONTEXT.md, 2026-09-26): too close to The Crew's own "no comms"
// twist. Replacing it later touches only this file plus the Plan 10-14
// catalogue registry line — nothing else names "radio-silence".
//
// Pure catalogue data: a single whisperAllowed override, composed exactly
// like any other boss/gear RuleModifier (run/compose.ts's ruleLayersFor).

import type { BossDef } from "./boss-def";

export const radioSilence: BossDef = {
  id: "radio-silence",
  name: "Monsoon",
  text: "No Whispers this camp.",
  modifiers: {
    whisperAllowed: () => () => false,
  },
};
