// Spyglass (Plan 10-08, spec §5.1, GEAR-01/COMM-02). Reveals one
// seeded-random card from a chosen teammate's hand to the USER ONLY.
//
// AUDIENCE IS THE USER ONLY: `apply` returns a single `reveal` op with
// `audience: [ctx.self]` — never the target, never any other seat. The
// toolkit's `reveal` op (toolkit.ts) stamps `source: gearId` itself, so this
// file never names "peek" as a literal string anywhere but its own `id`
// field (T-10-28).
//
// SEEDED RANDOM STREAM ONLY (T-10-30): the revealed card is drawn via
// GearContext's own seeded A1 stream (STREAMS.gear(...) under the hood,
// exposed here only as a single `apply`-time call below) — this file never
// calls Math.random or any other source of entropy.
//
// COMM-02 LIFETIME: the resulting Reveal lives on `attempt.reveals`, so it
// persists for the rest of the current attempt (survives further tricks),
// exactly like a Whisper's reveal, and is cleared only on replay/camp end
// (RUN-06, already structural — nothing this file does resets it by hand).
//
// An empty target hand (a spread/near-empty fixture) is refused before
// `apply` even runs, via `canTarget`'s "They have no cards" reason
// (GEAR-06).

import type { GearDef } from "./gear-def";

export const peek: GearDef = {
  id: "peek",
  name: "Spyglass",
  size: 1,
  window: "between-tricks",
  text: "See one random card from a chosen teammate's hand.",
  targets: [{ kind: "teammate" }],
  canTarget(ctx) {
    if (ctx.handSize(ctx.targets[0]!) === 0) {
      return "They have no cards";
    }
    return true;
  },
  apply(ctx) {
    const target = ctx.targets[0]!;
    const cardId = ctx.randomCardIdFrom(target, "peek");
    if (cardId === null) {
      throw new Error("gear/peek: apply: target hand is empty (canTarget should have refused this use)");
    }
    return [{ op: "reveal", cardId, audience: [ctx.self] }];
  },
};
