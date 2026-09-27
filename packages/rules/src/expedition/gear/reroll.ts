// Compass (Plan 10-09, spec §5.1, GEAR-02). Replaces one face-up,
// not-yet-taken card objective with the objective deck's top card, keeping
// its id, kind and order marker — the toolkit's `replace-objective` op
// (toolkit.ts) already enforces "unowned, card-bearing (win-card/ordered),
// non-empty deck" and keeps `id`/`kind`/`order` untouched, only swapping
// `target`; this file supplies the GEAR-06 reasons for the two cases the
// toolkit would otherwise throw on: a cardless (no-tricks/exactly-n) target,
// and an empty objective deck.
//
// Milestone decision, cited verbatim: "Compass on ordered objectives:
// allowed; keeps the order marker." reroll.ts imposes no restriction beyond
// the card-bearing check above, so an ordered objective's `order` (and its
// `id`/`kind`) survive a reroll unchanged — only `target` changes, which is
// exactly what the toolkit op does.
//
// validateTargets's own "face-up-objective" check (toolkit.ts) already
// guarantees, by the time canTarget runs, that ctx.targets[0] names an
// objective in ctx.camp.objectives with ownerSeatId === null — so canTarget
// only needs to add the kind/deck checks below.

import type { GearDef } from "./gear-def";

export const reroll: GearDef = {
  id: "reroll",
  name: "Compass",
  size: 2,
  window: "objective-pick",
  text: "Replace one face-up, not-yet-taken objective with a new one from the objective deck. An ordered objective keeps its order marker.",
  targets: [{ kind: "face-up-objective" }],
  canTarget(ctx) {
    const camp = ctx.camp!; // window === "objective-pick" guarantees a camp
    const objective = camp.objectives.find((o) => o.id === ctx.targets[0]);
    if (objective === undefined) {
      return "Target must be a face-up objective";
    }
    if (objective.kind !== "win-card" && objective.kind !== "ordered") {
      return "Only card objectives can be rerolled";
    }
    if (camp.objectiveDeck.length === 0) {
      return "The objective deck is empty";
    }
    return true;
  },
  apply(ctx) {
    return [{ op: "replace-objective", objectiveId: ctx.targets[0]! }];
  },
};
