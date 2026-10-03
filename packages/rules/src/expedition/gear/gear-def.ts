// Phase 10 gear-definition type contract (Plan 02).
//
// `apply` returns a list of ToolkitOp DATA; the toolkit (Plan 10-04) is the
// only thing that ever executes them. This is spec §6.3's "only through the
// toolkit" rule, enforced STRUCTURALLY: a GearDef can describe an effect but
// can never mutate RunState/CampState directly. This realizes spec §6.2's
// ctx-mutator sketch as a pure-data return value instead of a callback.
//
// `player-pair` was DELIBERATELY DROPPED from TargetKind (D-10): Trail Map
// (`reassign`) always swaps between the user and one chosen teammate, so its
// targets become a single `teammate` target rather than the spec's
// `player-pair`, and no other v1 gear needs a player-pair target.
//
// There is a `remove-objective` op for D-11 Camouflage (the dropped
// objective leaves play entirely — it can neither complete nor fail the
// camp), and a `cancel-boss-twist` op for D-04 Rain Poncho (cancels the
// twist for the current attempt only; used flags reset on replay, RUN-06).

import type { ActiveEffect, EffectParams, RunState } from "../run/types";
import type { RuleModifier, RunRules } from "../run/run-rules";
import type { CampState, ExpeditionCard } from "../state";

export type GearWindow = "pre-deal" | "objective-pick" | "between-tricks" | "passive";
export const GEAR_WINDOWS: readonly GearWindow[] = ["pre-deal", "objective-pick", "between-tricks", "passive"];

export type TargetKind = "teammate" | "own-card" | "face-up-objective" | "own-objective";
export const TARGET_KINDS: readonly TargetKind[] = ["teammate", "own-card", "face-up-objective", "own-objective"];

export type TargetSpec = { readonly kind: TargetKind };

export type ToolkitOp<P extends EffectParams = EffectParams> =
  | { readonly op: "move-card"; readonly cardId: string; readonly fromSeatId: string; readonly toSeatId: string }
  | { readonly op: "swap-cards"; readonly seatA: string; readonly cardIdA: string; readonly seatB: string; readonly cardIdB: string }
  | { readonly op: "replace-objective"; readonly objectiveId: string }
  | { readonly op: "swap-objectives"; readonly seatA: string; readonly seatB: string }
  | { readonly op: "remove-objective"; readonly objectiveId: string }
  | { readonly op: "reveal"; readonly cardId: string; readonly audience: readonly string[] }
  | { readonly op: "add-modifier"; readonly lasts: "attempt" | "trick"; readonly params: P; readonly audience: "public" | "owner" }
  | { readonly op: "set-next-leader"; readonly seatId: string }
  | { readonly op: "cancel-boss-twist" }
  | { readonly op: "log"; readonly event: string; readonly subjectSeatIds: readonly string[]; readonly audience: "public" | readonly string[] };

export type GearContext = {
  readonly self: string;
  readonly gearId: string;
  readonly run: RunState; // read-only snapshot
  readonly camp: CampState | null; // run.attempt?.camp ?? null
  readonly rules: RunRules; // composed for this exact state
  readonly targets: readonly string[]; // [] when probing availability
  handSize(seatId: string): number;
  ownHand(): readonly ExpeditionCard[]; // the actor's OWN cards only
  randomCardIdFrom(seatId: string, purpose: string): string | null; // seeded; opaque id only
  randomIndex(n: number, purpose: string): number; // seeded, 0..n-1
};

export type GearDef = {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly window: GearWindow;
  readonly text: string;
  readonly downside?: string;
  readonly targets: readonly TargetSpec[];
  canUse?(ctx: GearContext): true | string; // target-free availability (GEAR-06 reason)
  canTarget?(ctx: GearContext): true | string; // after generic target-kind validation
  apply?(ctx: GearContext): readonly ToolkitOp[]; // required unless window === "passive"
  passiveModifier?(ownerSeatId: string): RuleModifier; // while equipped (Energy Tonic)
  effectModifier?(effect: ActiveEffect): RuleModifier; // after an add-modifier op (Camouflage, Flare, Poncho, Whistle)
  readonly art?: string;
};
