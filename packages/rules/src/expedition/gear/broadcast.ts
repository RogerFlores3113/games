// Signal Flare (Plan 10-08, spec §5.1, GEAR-01, D-08). Must be armed BEFORE
// whispering; it then widens the audience of the owner's very NEXT Whisper
// to every seat, and is spent.
//
// D-08 exactly:
//   - `canUse` refuses "You have already whispered this camp" once
//     `whispersUsedBy(ctx.run, ctx.self) > 0` — the Flare can only be armed
//     before the owner's first Whisper this camp, never after.
//   - `apply` returns `add-modifier`, the same activated-effect mechanism
//     every other mid-camp gear item uses (see chatter.ts's header for why).
//   - `effectModifier` widens `whisperAudience` to `[...run.seatIds]` ONLY
//     while `whispersUsedBy(run, seatId) === 0` for the effect's OWNER — the
//     instant the owner's next Whisper is recorded (whisper.ts appends the
//     log entry AFTER computing the audience, so this hook still sees
//     `whispersUsedBy === 0` for that one call), the count becomes 1 and
//     every whisper after that (e.g. a Whistle-granted second Whisper) falls
//     through to `prev` — private again, matching the plan's "a Whistle
//     second Whisper is private again" must_have.
//   - Affects ONLY its owner: the `seatId === effect.seatId` guard means a
//     teammate's own Whisper is untouched by someone else's armed Flare.
//
// T-10-29: the widening window is exactly one Whisper (the guard is
// `whispersUsedBy(...) === 0`, not "ever used the Flare"), proven by a test
// that a SECOND Whisper (via the Whistle) after the flared one is private.

import { whispersUsedBy } from "../run/whisper";
import type { GearDef } from "./gear-def";

export const broadcast: GearDef = {
  id: "broadcast",
  name: "Signal Flare",
  size: 1,
  window: "between-tricks",
  text: "Your next Whisper this camp is shown to everyone.",
  targets: [],
  canUse(ctx) {
    if (!ctx.rules.whisperAllowed(ctx.run, ctx.self)) {
      return "Whispers are blocked this camp";
    }
    if (whispersUsedBy(ctx.run, ctx.self) > 0) {
      return "You have already whispered this camp";
    }
    return true;
  },
  apply(_ctx) {
    return [{ op: "add-modifier" }];
  },
  effectModifier(effect) {
    return {
      whisperAudience(prev) {
        return (run, seatId, targetSeatId) => {
          if (seatId === effect.seatId && whispersUsedBy(run, seatId) === 0) {
            return [...run.seatIds];
          }
          return prev(run, seatId, targetSeatId);
        };
      },
    };
  },
};
