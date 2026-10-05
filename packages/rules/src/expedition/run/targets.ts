// The target-kind registry. Each kind has one `choices` function returning
// `{ id, target }` pairs. Enumeration (the view's step choices), validation
// (the submitted id is among the choices) and resolution (that pair's
// target) are the same function, so they cannot drift.
//
// `choices` reads only what the seat may see: its ids ship to the client,
// and the per-seat leak check scans them like any other view string. Hidden
// things are targeted as wholes (`hand`), never by element. Choices for one
// step never depend on earlier picks; rules that span steps belong to the
// ability's own `canTarget`.

import { shuffleWithSeed } from "../../shuffle";
import { identitiesEqual } from "../deck";
import { trickContaining } from "../objectives";
import type { CampState, CompletedTrick, ExpeditionCard, Objective, ObjectiveStatus, StandardIdentity, StandardRank } from "../state";
import { SUPPLIES_MAX } from "./balance";
import { attemptOf } from "./attempt";
import { STREAMS, seededIndex } from "./rng";
import type { RouteOption } from "./route";
import type { RunRules } from "./run-rules";
import type { Catalog, RunState } from "./types";
import { currentStamp, seatOf } from "./usage";

export type TargetKind =
  | "self"
  | "player"
  | "hand"
  | "card"
  | "objective"
  | "completed-objective"
  | "failed-objective"
  | "whisper"
  | "won-trick"
  | "card-value"
  | "board"
  | "supplies"
  | "item"
  | "route-option"
  | "fanned-card"
  | "objective-value"
  | "option";

/** Per-kind spec parameters (only what the catalogue uses). */
type SpecParams = {
  self: {};
  player: { readonly who: "teammate" | "anyone" };
  hand: {};
  card: { readonly where: "my-hand" | "board" };
  objective: { readonly whose: "unclaimed" | "mine" | "open" };
  "completed-objective": {};
  "failed-objective": {};
  whisper: { readonly which: "sent" | "received" | "overheard" };
  "won-trick": {};
  "card-value": { readonly spread: 1 | 2 };
  board: {};
  supplies: {};
  item: { readonly where: "equipped" | "backpack" | "any" };
  "route-option": {};
  "fanned-card": {};
  "objective-value": { readonly spread: 1 | 2 };
  /** `options` lists the values on offer; they ship to the client as ids. */
  option: { readonly prompt: string; options(scope: OptionScope): readonly string[] };
};
export type TargetSpec = { [K in TargetKind]: { readonly kind: K } & SpecParams[K] }[TargetKind];
type SpecOf<K extends TargetKind> = Extract<TargetSpec, { kind: K }>;

/** What an ability receives per kind. Plain data, no ids to re-parse. */
export type TargetOf = {
  self: { readonly kind: "self"; readonly seatId: string };
  player: { readonly kind: "player"; readonly seatId: string };
  hand: { readonly kind: "hand"; readonly seatId: string; readonly size: number };
  card: { readonly kind: "card"; readonly cardId: string; readonly location: "hand" | "board" };
  objective: { readonly kind: "objective"; readonly objective: Objective };
  "completed-objective": { readonly kind: "completed-objective"; readonly objective: Objective };
  "failed-objective": { readonly kind: "failed-objective"; readonly objective: Objective; readonly cardWinnerSeatId: string | null };
  whisper: { readonly kind: "whisper"; readonly ordinal: number; readonly fromSeatId: string; readonly toSeatIds: readonly string[] };
  "won-trick": { readonly kind: "won-trick"; readonly trick: CompletedTrick };
  "card-value": { readonly kind: "card-value"; readonly cardId: string; readonly rank: StandardRank };
  board: { readonly kind: "board"; readonly trickIndex: number };
  supplies: { readonly kind: "supplies"; readonly current: number; readonly max: number };
  item: { readonly kind: "item"; readonly seatId: string; readonly uid: string; readonly itemId: string };
  "route-option": { readonly kind: "route-option"; readonly option: RouteOption };
  /** The card the pick landed on; the picker saw only its place in the fan. */
  "fanned-card": { readonly kind: "fanned-card"; readonly seatId: string; readonly cardId: string };
  "objective-value": { readonly kind: "objective-value"; readonly objective: Objective; readonly target: StandardIdentity };
  option: { readonly kind: "option"; readonly value: string };
};
export type Target = TargetOf[TargetKind];
export type TargetsOf<S extends readonly TargetSpec[]> = { readonly [I in keyof S]: TargetOf[S[I]["kind"]] };

export type SeatScope = { readonly run: RunState; readonly seatId: string; readonly camp: CampState | null; readonly rules: RunRules; readonly catalog: Catalog };
/** An option list's scope: a seeded roll that gives the same value for the
 * same label within an attempt. */
export type OptionScope = SeatScope & { roll(label: string, n: number): number };
export type Choice<K extends TargetKind> = { readonly id: string; readonly target: TargetOf[K] };

export type TargetKindDef<K extends TargetKind> = {
  readonly kind: K;
  /** Prompt line, e.g. "Pick a teammate's hand". */
  describe(spec: SpecOf<K>): string;
  /** Every legal choice, visible to the seat only, in stable table order. */
  choices(scope: SeatScope, spec: SpecOf<K>): readonly Choice<K>[];
};

export type AbilityStep = { readonly kind: TargetKind; readonly prompt: string; readonly choices: readonly string[] };

function objectivesWithStatus(scope: SeatScope, status: ObjectiveStatus): readonly Objective[] {
  const camp = scope.camp;
  if (camp === null) return [];
  return camp.objectives.filter((o) => scope.rules.objectiveStatus(camp, o) === status);
}

/** Whisper reveals in log order; the ordinal counts whispers only, matching
 * the public log, never another source's reveal. */
function whispers(run: RunState): readonly { ordinal: number; fromSeatId: string; toSeatIds: readonly string[] }[] {
  const reveals = attemptOf(run)?.reveals ?? [];
  return reveals
    .filter((reveal) => reveal.source === "whisper")
    .map((reveal, ordinal) => ({ ordinal, fromSeatId: reveal.fromSeatId, toSeatIds: reveal.audience }));
}

const MIN_RANK = 2;
const MAX_RANK = 14;

function ranksAround(rank: number, spread: number): StandardRank[] {
  const ranks: StandardRank[] = [];
  for (let r = rank - spread; r <= rank + spread; r++) {
    if (r !== rank && r >= MIN_RANK && r <= MAX_RANK) ranks.push(r as StandardRank);
  }
  return ranks;
}

/** Each teammate's hand in the order this seat sees it fanned, seeded per
 * (attempt, seat, hand, the seat's ledger length): a place in the fan says
 * nothing about the card. */
function fanOf(scope: SeatScope, cards: readonly ExpeditionCard[], ofSeatId: string): readonly ExpeditionCard[] {
  const stamp = currentStamp(scope.run)!;
  const uses = seatOf(scope.run, scope.seatId).ledger.length;
  return shuffleWithSeed(cards, scope.run.seed, STREAMS.fan(stamp.camp, stamp.attempt, scope.seatId, ofSeatId, uses));
}

/** Cards shown to this seat while `ofSeatId` held them, by the holder the
 * reveal pinned (WR-03): picking one names the card, and if it has left that
 * hand the pick lands on the fan's first place instead, so the choice never
 * says where the card went. */
function knownCardIds(scope: SeatScope, ofSeatId: string): readonly string[] {
  const reveals = attemptOf(scope.run)?.reveals ?? [];
  const ids = reveals.filter((r) => r.fromSeatId === ofSeatId && (r.audience.includes(scope.seatId) || (r.source === "whisper" && r.fromSeatId === scope.seatId))).map((r) => r.cardId);
  return [...new Set(ids)];
}

export const TARGET_KINDS: { readonly [K in TargetKind]: TargetKindDef<K> } = {
  self: {
    kind: "self",
    describe: () => "Use it on yourself",
    choices: ({ seatId }) => [{ id: `seat:${seatId}`, target: { kind: "self", seatId } }],
  },
  player: {
    kind: "player",
    describe: (spec) => (spec.who === "teammate" ? "Pick a teammate" : "Pick a player"),
    choices: ({ run, seatId }, spec) =>
      run.seatIds
        .filter((id) => spec.who === "anyone" || id !== seatId)
        .map((id) => ({ id: `seat:${id}`, target: { kind: "player", seatId: id } })),
  },
  hand: {
    kind: "hand",
    describe: () => "Pick a teammate's hand",
    choices: ({ camp, seatId }) =>
      (camp?.hands ?? [])
        .filter((hand) => hand.seatId !== seatId && hand.cards.length > 0)
        .map((hand) => ({ id: `hand:${hand.seatId}`, target: { kind: "hand", seatId: hand.seatId, size: hand.cards.length } })),
  },
  card: {
    kind: "card",
    describe: (spec) => (spec.where === "my-hand" ? "Pick a card in your hand" : "Pick a card on the table"),
    choices: ({ run, camp, seatId, rules }, spec) => {
      if (camp === null) return [];
      if (spec.where === "board") {
        const trick = camp.currentTrick;
        return trick.plays
          .filter((play, position) => !rules.hides(run, seatId, { kind: "play", trickIndex: trick.index, position, seatId: play.seatId }))
          .map((play) => ({
            id: `card:${play.card.id}`,
            target: { kind: "card", cardId: play.card.id, location: "board" },
          }));
      }
      const own = camp.hands.find((hand) => hand.seatId === seatId)?.cards ?? [];
      return own.map((card) => ({ id: `card:${card.id}`, target: { kind: "card", cardId: card.id, location: "hand" } }));
    },
  },
  objective: {
    kind: "objective",
    describe: (spec) => (spec.whose === "unclaimed" ? "Pick a face-up objective" : spec.whose === "mine" ? "Pick one of your open objectives" : "Pick an open objective"),
    choices: (scope, spec) => {
      // "open": anyone's taken objective that is not done, failed ones included.
      const candidates =
        spec.whose === "open"
          ? (scope.camp?.objectives ?? []).filter((o) => o.ownerSeatId !== null && scope.rules.objectiveStatus(scope.camp!, o) !== "done")
          : objectivesWithStatus(scope, "pending").filter((o) => (spec.whose === "unclaimed" ? o.ownerSeatId === null : o.ownerSeatId === scope.seatId));
      return candidates.map((objective) => ({ id: `objective:${objective.id}`, target: { kind: "objective", objective } }));
    },
  },
  "completed-objective": {
    kind: "completed-objective",
    describe: () => "Pick a completed objective",
    choices: (scope) =>
      objectivesWithStatus(scope, "done").map((objective) => ({
        id: `objective:${objective.id}`,
        target: { kind: "completed-objective", objective },
      })),
  },
  "failed-objective": {
    kind: "failed-objective",
    describe: () => "Pick a failed objective",
    choices: (scope) =>
      objectivesWithStatus(scope, "failed").map((objective) => {
        const won = objective.kind === "win-card" || objective.kind === "ordered" ? trickContaining(scope.camp!, objective.target) : undefined;
        return {
          id: `objective:${objective.id}`,
          target: { kind: "failed-objective", objective, cardWinnerSeatId: won?.winnerSeatId ?? null },
        };
      }),
  },
  whisper: {
    kind: "whisper",
    describe: (spec) =>
      spec.which === "sent" ? "Pick a whisper you sent" : spec.which === "received" ? "Pick a whisper you received" : "Pick a whisper between two teammates",
    choices: ({ run, seatId }, spec) =>
      whispers(run)
        .filter((w) => {
          if (spec.which === "sent") return w.fromSeatId === seatId;
          if (w.fromSeatId === seatId) return false;
          return spec.which === "received" ? w.toSeatIds.includes(seatId) : !w.toSeatIds.includes(seatId);
        })
        .map((w) => ({ id: `whisper:${w.ordinal}`, target: { kind: "whisper", ...w } })),
  },
  "won-trick": {
    kind: "won-trick",
    describe: () => "Pick a trick you won",
    choices: ({ camp, seatId }) =>
      (camp?.completedTricks ?? [])
        .filter((trick) => trick.winnerSeatId === seatId)
        .map((trick) => ({ id: `trick:${trick.index}`, target: { kind: "won-trick", trick } })),
  },
  "card-value": {
    kind: "card-value",
    describe: () => "Pick a card in your hand to recount",
    choices: ({ camp, seatId }, spec) => {
      const own = camp?.hands.find((hand) => hand.seatId === seatId)?.cards ?? [];
      return own.flatMap((card) => {
        const identity = card.identity;
        if (identity.kind !== "standard") return [];
        return ranksAround(identity.rank, spec.spread).map((rank) => ({ id: `value:${card.id}:${rank}`, target: { kind: "card-value" as const, cardId: card.id, rank } }));
      });
    },
  },
  board: {
    kind: "board",
    describe: () => "Pick the trick on the table",
    choices: ({ camp }) =>
      camp !== null && camp.currentTrick.plays.length > 0
        ? [{ id: "board", target: { kind: "board", trickIndex: camp.currentTrick.index } }]
        : [],
  },
  supplies: {
    kind: "supplies",
    describe: () => "Pick the crew's supplies",
    choices: ({ run }) => [{ id: "supplies", target: { kind: "supplies", current: run.supplies, max: SUPPLIES_MAX } }],
  },
  item: {
    kind: "item",
    describe: (spec) => (spec.where === "equipped" ? "Pick an item you carry" : spec.where === "backpack" ? "Pick an item in your backpack" : "Pick one of your items"),
    choices: ({ run, seatId }, spec) => {
      const seat = seatOf(run, seatId);
      return seat.items
        .filter((item) => spec.where === "any" || seat.equipped.includes(item.uid) === (spec.where === "equipped"))
        .map((item) => ({ id: `item:${item.uid}`, target: { kind: "item", seatId, uid: item.uid, itemId: item.itemId } }));
    },
  },
  "route-option": {
    kind: "route-option",
    describe: () => "Pick a route",
    choices: ({ run }) =>
      run.stage.tag === "route" ? run.stage.options.map((option) => ({ id: `route:${option.id}`, target: { kind: "route-option", option } })) : [],
  },
  "fanned-card": {
    kind: "fanned-card",
    describe: () => "Pick a card from a teammate's fanned hand",
    choices: (scope) =>
      (scope.camp?.hands ?? [])
        .filter((hand) => hand.seatId !== scope.seatId && hand.cards.length > 0)
        .flatMap((hand) => {
          const fan = fanOf(scope, hand.cards, hand.seatId);
          const places = fan.map((card, i) => ({ id: `fan:${hand.seatId}:${i}`, target: { kind: "fanned-card" as const, seatId: hand.seatId, cardId: card.id } }));
          const known = knownCardIds(scope, hand.seatId).map((cardId) => ({
            id: `fan:${hand.seatId}:known:${cardId}`,
            target: { kind: "fanned-card" as const, seatId: hand.seatId, cardId: hand.cards.some((card) => card.id === cardId) ? cardId : fan[0]!.id },
          }));
          return [...places, ...known];
        }),
  },
  "objective-value": {
    kind: "objective-value",
    describe: () => "Pick an objective's card to shift",
    choices: ({ run, seatId, camp, rules }, spec) => {
      if (camp === null) return [];
      // A card already won, eaten or on the table would settle the objective
      // at once; a face-down play is left in, since leaving it out would
      // name the card.
      const played = [
        ...camp.removedCards,
        ...camp.completedTricks.flatMap((trick) => trick.plays.flatMap((play) => [play.card.identity, ...(play.countsAs === null ? [] : [play.countsAs])])),
        ...camp.discards.map((discard) => discard.card.identity),
        ...camp.currentTrick.plays.flatMap((play, position) =>
          rules.hides(run, seatId, { kind: "play", trickIndex: camp.currentTrick.index, position, seatId: play.seatId }) ? [] : [play.card.identity, rules.identityOf(play.card)],
        ),
      ];
      return camp.objectives.flatMap((objective) => {
        if (objective.kind !== "win-card" && objective.kind !== "ordered") return [];
        const target = objective.target;
        if (target.kind !== "standard" || rules.objectiveStatus(camp, objective) !== "pending") return [];
        if (rules.hides(run, seatId, { kind: "objective", objectiveId: objective.id })) return [];
        return ranksAround(target.rank, spec.spread)
          .map((rank): StandardIdentity => ({ kind: "standard", suit: target.suit, rank }))
          .filter((shifted) => !played.some((identity) => identitiesEqual(identity, shifted)))
          .map((shifted) => ({ id: `objective-value:${objective.id}:${shifted.rank}`, target: { kind: "objective-value" as const, objective, target: shifted } }));
      });
    },
  },
  option: {
    kind: "option",
    describe: (spec) => spec.prompt,
    choices: (scope, spec) => {
      const stamp = currentStamp(scope.run);
      if (stamp === null) return [];
      const roll = (label: string, n: number) => seededIndex(scope.run.seed, STREAMS.option(stamp.camp, stamp.attempt, scope.seatId, label), n);
      return [...new Set(spec.options({ ...scope, roll }))].map((value) => ({ id: `option:${value}`, target: { kind: "option", value } }));
    },
  },
};

function defFor(spec: TargetSpec): TargetKindDef<TargetKind> {
  // One widening cast, objectives.ts's registry-dispatch idiom: the mapped
  // type pairs each kind with its own def, but TS cannot correlate a
  // runtime `spec.kind` lookup with `spec`'s own variant.
  return TARGET_KINDS[spec.kind] as TargetKindDef<TargetKind>;
}

export function choicesFor(scope: SeatScope, spec: TargetSpec): readonly Choice<TargetKind>[] {
  return defFor(spec).choices(scope, spec);
}

/** Length check, then each id must be among choices(scope, specs[i]). */
export function resolveTargets(
  scope: SeatScope,
  specs: readonly TargetSpec[],
  ids: unknown,
): { readonly ok: true; readonly targets: readonly Target[] } | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return { ok: false, reason: "Invalid targets" };
  }
  if (ids.length !== specs.length) {
    return { ok: false, reason: `Expected ${specs.length} target(s), got ${ids.length}` };
  }
  const targets: Target[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const choice = choicesFor(scope, spec).find((c) => c.id === ids[i]);
    if (choice === undefined) return { ok: false, reason: `Not a valid choice: ${defFor(spec).describe(spec)}` };
    targets.push(choice.target);
  }
  return { ok: true, targets };
}

/** For the view: one step per spec, with prompt and choice ids. */
export function stepsFor(scope: SeatScope, specs: readonly TargetSpec[]): readonly AbilityStep[] {
  return specs.map((spec) => ({
    kind: spec.kind,
    prompt: defFor(spec).describe(spec),
    choices: choicesFor(scope, spec).map((choice) => choice.id),
  }));
}
