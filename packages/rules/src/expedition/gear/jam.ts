// Rain Poncho (Plan 10-11, spec §5.1, GEAR-04, D-04, D-12). The pre-deal gear
// item that cancels the current camp's boss twist for this attempt only.
//
// D-04 exactly: `apply` returns `cancel-boss-twist` (toolkit.ts sets
// `attempt.bossCancelled = true`, only legal pre-deal) alongside the usual
// `add-modifier`, so activeBossId (compose.ts) reads null for the rest of
// THIS attempt only — attempt.bossCancelled lives on AttemptState, so a
// fresh attempt (a replay, RUN-06) resets it to false structurally and the
// twist returns unless someone uses the Poncho again.
//
// D-12 exactly: `canUse` refuses "There is no boss twist this camp" whenever
// activeBossId(ctx.run) is already null (no boss camp, or the twist is
// already cancelled) — this is what keeps preDealPendingSeatIds
// (lifecycle.ts) from ever waiting on a Poncho owner at a non-boss camp,
// since gearAvailability calls the same canUse to decide "currently
// available" before counting a seat as pending.
//
// The downside applies for the WHOLE camp, not just the current attempt:
// effectModifier sets whisperAllowed to false unconditionally (ignoring the
// ActiveEffect argument), matching spec §5.1's "nobody may Whisper this
// camp" and GEAR-06's "gear that whispers is blocked too" (any gear whose
// canUse checks rules.whisperAllowed, e.g. chatter.ts/broadcast.ts, is
// blocked the same way a plain whisper action is).

import { activeBossId } from "../run/compose";
import type { GearDef } from "./gear-def";

export const jam: GearDef = {
  id: "jam",
  name: "Rain Poncho",
  size: 2,
  window: "pre-deal",
  text: "Cancel this camp's boss twist.",
  downside: "Nobody may Whisper this camp (gear that whispers is blocked too).",
  targets: [],
  canUse(ctx) {
    if (activeBossId(ctx.run) === null) {
      return "There is no boss twist this camp";
    }
    return true;
  },
  apply(_ctx) {
    return [{ op: "cancel-boss-twist" }, { op: "add-modifier", lasts: "attempt", params: {}, audience: "public" }];
  },
  effectModifier(_effect) {
    return {
      whisperAllowed(_prev) {
        return () => false;
      },
    };
  },
};
