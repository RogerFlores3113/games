// Every dev shortcut as one small pure function over RunState, in one
// registry. The ids are part of the wire contract with the web dev panel.
// When RunState is redesigned, this file and check.ts are what change.

import { checkCampOutcome } from "../camp";
import { cardLabel } from "../deck";
import { RUN_LENGTHS, SUPPLIES_MAX } from "../run/balance";
import { attemptOf, withAttempt } from "../run/attempt";
import { MODS } from "../content/mods/registry";
import { mintItems } from "../run/items";
import { dealCamp, openLeg, openLoadout, runStatus, settleCamp } from "../run/lifecycle";
import { rulesFor } from "../run/compose";
import { draftOfferFor } from "../run/draft";
import { campIndex, drawPlan } from "../run/plan";
import { campSpecAt, rerollOption, type CampSpec, type RouteChoice } from "../run/route";
import { campStack, pairingRuleFor } from "../run/stack";
import { advance, applyRunAction } from "../run/stages/registry";
import { legsTo, type Leg } from "../run/trail";
import { applyToolkitOps } from "../run/toolkit";
import type { Catalog, RunAt, RunLength, RunState } from "../run/types";
import { describeObjective } from "../objectives";
import type { DevField, DevOption, DevParams, DevTarget } from "../../adapter";
import { botMove } from "./autoplay";
import { TRIGGERS } from "./triggers";

export type ShortcutDef = {
  readonly label: string;
  readonly group: string;
  /** The short label on the dev toolbar, for the shortcuts a playtest reaches for. */
  readonly toolbar?: string;
  readonly target?: DevTarget;
  fields(run: RunState, catalog: Catalog): readonly DevField[];
  apply(run: RunState, params: DevParams, catalog: Catalog): RunState;
};

function readNumber(params: DevParams, name: string, min: number, max: number): number {
  const value = params[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function readChoice(params: DevParams, name: string, options: readonly DevOption[]): string {
  const value = params[name];
  if (typeof value !== "string" || !options.some((o) => o.value === value)) {
    throw new Error(options.length === 0 ? `${name} has nothing to choose from right now` : `${name} must be one of: ${options.map((o) => o.value).join(", ")}`);
  }
  return value;
}

const opts = (values: readonly string[]): DevOption[] => values.map((value) => ({ value, label: value }));
const seatOptions = (run: RunState): DevOption[] => opts(run.seatIds);
const LENGTHS = Object.keys(RUN_LENGTHS) as RunLength[];
const MAX_CAMPS = Math.max(...LENGTHS.map((length) => RUN_LENGTHS[length].camps));
const lengthOf = (run: RunState): RunLength => run.plan?.length ?? "standard";

function requireInProgress(run: RunState): void {
  if (runStatus(run) !== "in_progress") throw new Error(`the run is already ${runStatus(run)}`);
}

function withSeat(run: RunState, seatId: string, patch: Partial<RunState["seats"][number]>): RunState {
  return { ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, ...patch } : s)) };
}

function assignCharacters(run: RunState, catalog: Catalog): RunState {
  const taken = run.seats.flatMap((s) => (s.characterId === null ? [] : [s.characterId]));
  const free = Object.keys(catalog.characters).filter((id) => !taken.includes(id));
  const seats = run.seats.map((s) => {
    if (s.characterId !== null) return s;
    const characterId = free.shift();
    if (characterId === undefined) throw new Error("the catalogue has no unclaimed character left");
    return { ...s, characterId };
  });
  return { ...run, seats: seats.map((s) => ({ ...s, offers: [] })) };
}

/** The loadout of camp `k` in a run of `length`. */
function loadoutAt(run: RunState, length: RunLength, k: number, catalog: Catalog): RunAt<"loadout"> {
  if (k > RUN_LENGTHS[length].camps) throw new Error(`a ${length} run has ${RUN_LENGTHS[length].camps} camps, not ${k}`);
  // The run's own plan survives a jump within its length, so a boss set with set-plan-boss stays.
  const plan = run.plan?.length === length ? run.plan : drawPlan(run.seed, length, catalog);
  const crewed: RunState = { ...assignCharacters(run, catalog), plan, supplies: Math.max(run.supplies, 1) };
  return openLoadout({ ...crewed, history: crewed.history.filter((h) => h.camp < k) }, campSpecAt(run.seed, length, campIndex(k), catalog), catalog);
}

/** Where each of a length's camps has `leg` before it, for a refusal. */
function campsWith(length: RunLength, leg: Leg): string {
  const camps = Array.from({ length: RUN_LENGTHS[length].camps }, (_, i) => i + 1).filter((k) => legsTo(length, k).includes(leg));
  return `a ${length} run's ${leg === "event" ? "events" : `${leg}s`} are before camps ${camps.join(", ")}`;
}

function jumpToCamp(run: RunState, length: RunLength, k: number, stage: Arrival, catalog: Catalog): RunState {
  if (stage === "camp" || stage === "loadout") {
    const loadout = loadoutAt(run, length, k, catalog);
    return stage === "camp" ? dealCamp(loadout, catalog) : loadout;
  }
  if (k > RUN_LENGTHS[length].camps) throw new Error(`a ${length} run has ${RUN_LENGTHS[length].camps} camps, not ${k}`);
  if (!legsTo(length, k).includes(stage)) throw new Error(`camp ${k} has no ${stage === "route" ? "route vote" : stage} before it: ${campsWith(length, stage)}`);
  const before = k === 1 ? loadoutAt(run, length, 1, catalog) : settleCamp(jumpToCamp(run, length, k - 1, "camp", catalog) as RunAt<"camp">, "cleared", catalog);
  return openLeg({ ...before, seats: before.seats.map((s) => ({ ...s, offers: [] })) }, campIndex(k), stage, catalog);
}

/** The camp the run is in, or the one it is heading to, dealt. */
function toCamp(run: RunState, catalog: Catalog): RunAt<"camp"> {
  requireInProgress(run);
  const stage = run.stage;
  switch (stage.tag) {
    case "camp":
      return run as RunAt<"camp">;
    case "loadout":
      return dealCamp(run as RunAt<"loadout">, catalog);
    case "shop":
      return dealCamp(stage.camp === null ? loadoutAt(run, lengthOf(run), stage.next, catalog) : openLoadout(run, stage.camp, catalog), catalog);
    case "muster":
      return dealCamp(loadoutAt(run, lengthOf(run), 1, catalog), catalog);
    case "draft":
    case "event":
      return dealCamp(loadoutAt(run, lengthOf(run), stage.next, catalog), catalog);
    case "route":
      return dealCamp(loadoutAt(run, lengthOf(run), stage.from + 1, catalog), catalog);
    case "ended":
      throw new Error("the run is over");
  }
}

function allCardHolders(run: RunState): { readonly id: string; readonly label: string; readonly seatId: string }[] {
  return (attemptOf(run)?.camp.hands ?? []).flatMap((h) => h.cards.map((c) => ({ id: c.id, label: `${cardLabel(c.identity)} (in ${h.seatId})`, seatId: h.seatId })));
}

function objectiveOptions(run: RunState): DevOption[] {
  return (attemptOf(run)?.camp.objectives ?? []).map((o) => ({ value: o.id, label: `${describeObjective(o)} (${o.id})` }));
}

/** The run's own length first, since the panel preselects the first option. */
const lengthField = (run: RunState): DevField => ({
  name: "length",
  label: "Run length",
  kind: "choice",
  options: opts([lengthOf(run), ...LENGTHS.filter((length) => length !== lengthOf(run))]),
});
const seatField = (run: RunState): DevField => ({ name: "seat", label: "Seat", kind: "choice", options: seatOptions(run) });
const upgradeOptions = (catalog: Catalog): DevOption[] => [
  { value: "none", label: "none" },
  ...Object.values(catalog.characters).flatMap((character) => character.upgrades.map((u) => ({ value: u.id, label: `${u.name} (${character.id})` }))),
];
const STAGE_OPTIONS: DevOption[] = [
  { value: "camp", label: "the table" },
  { value: "loadout", label: "the loadout" },
  { value: "shop", label: "the shop" },
  { value: "draft", label: "the draft" },
  { value: "event", label: "the event" },
  { value: "route", label: "the route vote" },
];
type Arrival = "camp" | Leg;
const modOptions = (catalog: Catalog, kind: "location" | "weather", current: string | null): DevOption[] => {
  const ids = Object.values(catalog.mods).filter((def) => def.kind === kind).map((def) => def.id);
  return opts(current === null ? ids : [current, ...ids.filter((id) => id !== current)]);
};
const specOfStage = (run: RunState): CampSpec | null => (run.stage.tag === "loadout" || run.stage.tag === "camp" ? run.stage.camp : null);

/** The loadout or camp with a new location and weather. A dealt camp is
 * dealt again under the new spec. */
function setSpec(run: RunState, location: string, weather: string, catalog: Catalog): RunState {
  const stage = run.stage;
  if (stage.tag !== "loadout" && stage.tag !== "camp") throw new Error("set-spec works in a loadout or a camp");
  if (pairingRuleFor(location, weather, catalog)?.result === "never") throw new Error(`${location} never has ${weather}`);
  const camp = { ...stage.camp, location, weather };
  if (stage.tag === "loadout") return { ...run, stage: { ...stage, camp } };
  return dealCamp(openLoadout(run, camp, catalog), catalog);
}

/** The boss camps a boss can be set at: animal and disaster tiers, the
 * camp in play first. */
function bossCampOptions(run: RunState): DevOption[] {
  const here = specOfStage(run)?.index ?? null;
  const camps = (run.plan?.bosses ?? []).filter((b) => b.tier !== "temple").sort((a, b) => Number(b.at === here) - Number(a.at === here));
  return camps.map((b) => ({ value: String(b.at), label: `camp ${b.at} (${b.tier}${b.modId === null ? "" : `, now ${b.modId}`})` }));
}

const bossOptions = (catalog: Catalog): DevOption[] => [
  ...Object.values(catalog.mods).filter((def) => def.kind === "animal" || def.kind === "disaster").map((def) => ({ value: def.id, label: `${def.id} (${def.kind})` })),
  { value: "none", label: "none" },
];

/** The plan with `boss` at camp `at`. The loadout or camp in play at that
 * camp opens again under it, a dealt camp with a fresh deal. */
function setPlanBoss(run: RunState, at: number, boss: string, catalog: Catalog): RunState {
  const plan = run.plan;
  const planned = plan?.bosses.find((b) => b.at === at);
  if (plan === null || planned === undefined || planned.tier === "temple") throw new Error(`camp ${at} is not an animal or disaster boss camp`);
  if (boss !== "none" && catalog.mods[boss]?.kind !== planned.tier) throw new Error(`${boss} is not a${planned.tier === "animal" ? "n animal" : " disaster"} boss`);
  const next: RunState = { ...run, plan: { ...plan, bosses: plan.bosses.map((b) => (b.at === at ? { ...b, modId: boss === "none" ? null : boss } : b)) } };
  const spec = specOfStage(next);
  if (spec === null || spec.index !== at) return next;
  const loadout = openLoadout(next, spec, catalog);
  return next.stage.tag === "camp" ? dealCamp(loadout, catalog) : loadout;
}

const DEV_ORIGIN = { kind: "seat", seatId: "dev", sourceKey: "dev", sourceId: "dev" } as const;

const routeChoices = (run: RunState): DevOption[] => (run.stage.tag === "route" ? opts(run.stage.options.map((o) => o.id)) : []);

/** The route vote with option `id`'s boss swap set: `boss` at the next
 * animal or disaster boss camp it leads to, or none. */
function setRouteSwap(run: RunState, id: string, boss: string, catalog: Catalog): RunState {
  const stage = run.stage;
  if (stage.tag !== "route") throw new Error("set-route-swap works at a route vote");
  const option = stage.options.find((o) => o.id === id)!;
  const planned = run.plan!.bosses.find((b) => b.at >= option.next.index && b.tier !== "temple");
  if (boss !== "none" && (planned === undefined || catalog.mods[boss]?.kind !== planned.tier)) {
    throw new Error(planned === undefined ? `route ${id} leads to no animal or disaster boss camp` : `${boss} is not a${planned.tier === "animal" ? "n animal" : " disaster"} boss`);
  }
  const swapBoss = boss === "none" ? null : { at: planned!.at, modId: boss };
  return { ...run, stage: { ...stage, options: stage.options.map((o) => (o.id === id ? { ...o, swapBoss } : o)) } };
}

const NEXT_STAGE_STEPS = 2000;

/** Every seat makes the move autoplay would, until the stage moves on or a
 * camp settles: a camp is played out, a vote is decided by the flip. */
function nextStage(run: RunState, catalog: Catalog): RunState {
  requireInProgress(run);
  const at = (state: RunState) => `${state.stage.tag}:${state.history.length}`;
  let current = run;
  for (let step = 0; step < NEXT_STAGE_STEPS; step++) {
    const move = botMove(current, current.seatIds, catalog);
    if (move === null) throw new Error(`nobody has a move at the ${current.stage.tag}`);
    const result = applyRunAction(current, move.seatId, move.request, catalog);
    if (!result.ok) throw new Error(`${move.seatId}'s ${move.request.type} was refused: ${result.error}`);
    current = result.state;
    if (at(current) !== at(run)) return current;
  }
  throw new Error(`the ${run.stage.tag} did not end in ${NEXT_STAGE_STEPS} moves`);
}

const OBJECTIVE_STATUSES: DevOption[] = [
  { value: "done", label: "done" },
  { value: "failed", label: "failed" },
  { value: "play", label: "as played" },
];

/** The camp with an objective decided done or failed whatever the tricks
 * say, or back to what they say; a camp this decides settles as play would. */
function setObjectiveStatus(run: RunState, params: DevParams, catalog: Catalog): RunState {
  const attempt = attemptOf(run);
  if (attempt === null) throw new Error("there is no dealt camp with objectives");
  const objectiveId = readChoice(params, "objective", objectiveOptions(run));
  const status = readChoice(params, "status", OBJECTIVE_STATUSES);
  if (checkCampOutcome(attempt.camp, rulesFor(run, catalog)).status !== "in_progress") throw new Error("the camp is already decided");
  const others = Object.entries(attempt.loaded?.objectives ?? {}).filter(([id]) => id !== objectiveId);
  const objectives = Object.fromEntries(status === "play" ? others : [...others, [objectiveId, status as "done" | "failed"]]);
  return advance(withAttempt(run, { ...attempt, loaded: { rolls: attempt.loaded?.rolls ?? {}, objectives } }), catalog);
}

const triggerShortcuts: Readonly<Record<string, ShortcutDef>> = Object.fromEntries(
  Object.entries(TRIGGERS).map(([modId, trigger]): [string, ShortcutDef] => {
    const inStack = (run: RunState, catalog: Catalog): DevOption[] =>
      campStack(run, catalog)
        .filter((layer) => layer.def.id === modId)
        .map((layer) => ({ value: modId, label: `${layer.def.name}${layer.strength === "half" ? " (half)" : ""}` }));
    const name = Object.values(MODS).find((def) => def.id === modId)?.name ?? modId;
    return [
      `trigger-${modId}`,
      {
        label: `${name}: ${trigger.label}`,
        group: "Bosses and weather",
        target: { kind: "mod", field: "mod" },
        fields: (run, catalog) => [{ name: "mod", label: "Modifier", kind: "choice", options: inStack(run, catalog) }, ...trigger.fields(run)],
        apply: (run, params, catalog) => {
          const here = inStack(run, catalog);
          if (here.length === 0) throw new Error(`the ${name} is not at this camp`);
          readChoice(params, "mod", here);
          const attempt = attemptOf(run);
          if (attempt === null) throw new Error(`the ${name} acts only in a dealt camp`);
          if (checkCampOutcome(attempt.camp, rulesFor(run, catalog)).status !== "in_progress") throw new Error("the camp is already decided");
          const layer = campStack(run, catalog).find((l) => l.def.id === modId)!;
          return advance(trigger.fire(run as RunAt<"camp">, layer, params, catalog), catalog);
        },
      },
    ];
  }),
);

export const DEV_SHORTCUTS = {
  "jump-to-camp": {
    label: "Jump to camp",
    group: "Run",
    toolbar: "Go",
    fields: (run) => [
      lengthField(run),
      { name: "camp", label: "Camp", kind: "number", min: 1, max: MAX_CAMPS, initial: 1 },
      { name: "stage", label: "Arrive at", kind: "choice", options: STAGE_OPTIONS },
    ],
    apply: (run, params, catalog) => {
      const length = readChoice(params, "length", opts(LENGTHS)) as RunLength;
      const stage = readChoice(params, "stage", STAGE_OPTIONS) as Arrival;
      return jumpToCamp(run, length, readNumber(params, "camp", 1, RUN_LENGTHS[length].camps), stage, catalog);
    },
  },
  "jump-to-final-camp": {
    label: "Jump to the final camp",
    group: "Run",
    fields: () => [],
    apply: (run, _params, catalog) => jumpToCamp(run, lengthOf(run), RUN_LENGTHS[lengthOf(run)].camps, "camp", catalog),
  },
  "set-spec": {
    label: "Set the camp's location and weather",
    group: "Camp",
    toolbar: "Set",
    fields: (run, catalog) => [
      { name: "location", label: "Location", kind: "choice", options: modOptions(catalog, "location", specOfStage(run)?.location ?? null) },
      { name: "weather", label: "Weather", kind: "choice", options: modOptions(catalog, "weather", specOfStage(run)?.weather ?? null) },
    ],
    apply: (run, params, catalog) =>
      setSpec(run, readChoice(params, "location", modOptions(catalog, "location", null)), readChoice(params, "weather", modOptions(catalog, "weather", null)), catalog),
  },
  "set-plan-boss": {
    label: "Set a boss camp's boss",
    group: "Run",
    fields: (run, catalog) => [
      { name: "camp", label: "Boss camp", kind: "choice", options: bossCampOptions(run) },
      { name: "boss", label: "Boss", kind: "choice", options: bossOptions(catalog) },
    ],
    apply: (run, params, catalog) => setPlanBoss(run, Number(readChoice(params, "camp", bossCampOptions(run))), readChoice(params, "boss", bossOptions(catalog)), catalog),
  },
  "end-run": {
    label: "End the run",
    group: "Run",
    fields: () => [{ name: "outcome", label: "Outcome", kind: "choice", options: opts(["won", "lost"]) }],
    apply: (run, params, catalog) => {
      const outcome = readChoice(params, "outcome", opts(["won", "lost"]));
      requireInProgress(run);
      if (outcome === "won") {
        const final = jumpToCamp(run, lengthOf(run), RUN_LENGTHS[lengthOf(run)].camps, "camp", catalog) as RunAt<"camp">;
        return settleCamp(final, "cleared", catalog);
      }
      return settleCamp(toCamp({ ...run, supplies: 1 }, catalog), "failed", catalog);
    },
  },
  "force-camp": {
    label: "Force the camp's outcome",
    group: "Camp",
    toolbar: "Skip camp",
    fields: () => [{ name: "outcome", label: "Outcome", kind: "choice", options: opts(["cleared", "failed"]) }],
    apply: (run, params, catalog) => {
      const outcome = readChoice(params, "outcome", opts(["cleared", "failed"])) as "cleared" | "failed";
      return settleCamp(toCamp(run, catalog), outcome, catalog);
    },
  },
  "set-supplies": {
    label: "Set supplies",
    group: "Run",
    fields: (run) => [{ name: "supplies", label: "Supplies", kind: "number", min: 0, max: SUPPLIES_MAX, initial: run.supplies }],
    apply: (run, params) => ({ ...run, supplies: readNumber(params, "supplies", 0, SUPPLIES_MAX) }),
  },
  "set-purse": {
    label: "Set the purse",
    group: "Run",
    fields: (run) => [{ name: "purse", label: "Coins", kind: "number", min: 0, max: 999, initial: run.purse }],
    apply: (run, params) => ({ ...run, purse: readNumber(params, "purse", 0, 999) }),
  },
  "add-coins": {
    label: "Add 10 coins",
    group: "Run",
    toolbar: "+10 coins",
    fields: () => [],
    apply: (run) => ({ ...run, purse: Math.min(999, run.purse + 10) }),
  },
  "add-supply": {
    label: "Add a supply",
    group: "Run",
    toolbar: "+1 supply",
    fields: () => [],
    apply: (run) => {
      if (run.supplies >= SUPPLIES_MAX) throw new Error(`supplies are full (${run.supplies} of ${SUPPLIES_MAX})`);
      return { ...run, supplies: run.supplies + 1 };
    },
  },
  "next-stage": {
    label: "Play on to the next stage",
    group: "Run",
    toolbar: "Next stage",
    fields: () => [],
    apply: (run, _params, catalog) => nextStage(run, catalog),
  },
  "set-character": {
    label: "Set a seat's character",
    group: "Crew",
    fields: (run, catalog) => [seatField(run), { name: "character", label: "Character", kind: "choice", options: opts(Object.keys(catalog.characters)) }],
    apply: (run, params, catalog) => {
      const seatId = readChoice(params, "seat", seatOptions(run));
      const character = readChoice(params, "character", opts(Object.keys(catalog.characters)));
      const holder = run.seats.find((s) => s.characterId === character && s.seatId !== seatId);
      if (holder !== undefined) throw new Error(`${character} already belongs to ${holder.seatId}`);
      return withSeat(run, seatId, { characterId: character });
    },
  },
  "give-item": {
    label: "Give a seat an item",
    group: "Crew",
    fields: (run, catalog) => [seatField(run), { name: "item", label: "Item", kind: "choice", options: opts(Object.keys(catalog.items)) }],
    apply: (run, params, catalog) => {
      const seatId = readChoice(params, "seat", seatOptions(run));
      const item = readChoice(params, "item", opts(Object.keys(catalog.items)));
      return mintItems(run, seatId, [item], catalog);
    },
  },
  "set-upgrade": {
    label: "Set a seat's upgrade",
    group: "Crew",
    fields: (run, catalog) => [seatField(run), { name: "upgrade", label: "Upgrade", kind: "choice", options: upgradeOptions(catalog) }],
    apply: (run, params, catalog) => {
      const seatId = readChoice(params, "seat", seatOptions(run));
      const upgrade = readChoice(params, "upgrade", upgradeOptions(catalog));
      if (upgrade === "none") return withSeat(run, seatId, { upgradeId: null });
      const characterId = run.seats.find((s) => s.seatId === seatId)!.characterId;
      const owner = Object.values(catalog.characters).find((c) => c.upgrades.some((u) => u.id === upgrade))!;
      if (owner.id !== characterId) throw new Error(`${upgrade} belongs to ${owner.id}, not ${seatId}'s ${characterId ?? "missing character"}`);
      return withSeat(run, seatId, { upgradeId: upgrade });
    },
  },
  "move-card": {
    label: "Move a card to another hand",
    group: "Cards",
    fields: (run) => [
      { name: "card", label: "Card", kind: "choice", options: allCardHolders(run).map((c) => ({ value: c.id, label: c.label })) },
      { name: "to", label: "To", kind: "choice", options: seatOptions(run) },
    ],
    apply: (run, params, catalog) => {
      if (attemptOf(run) === null) throw new Error("there is no dealt camp to move cards in");
      const holders = allCardHolders(run);
      const cardId = readChoice(params, "card", holders.map((c) => ({ value: c.id, label: c.label })));
      const to = readChoice(params, "to", seatOptions(run));
      const from = holders.find((c) => c.id === cardId)!.seatId;
      if (from === to) throw new Error(`the card is already in ${to}'s hand`);
      const origin = { kind: "seat", seatId: to, sourceKey: "dev", sourceId: "dev" } as const;
      return applyToolkitOps(run, origin, [{ op: "move-card", cardId, fromSeatId: from, toSeatId: to }], rulesFor(run, catalog), catalog);
    },
  },
  "void-last-trick": {
    label: "Make the last trick a hallucination",
    group: "Cards",
    fields: () => [],
    apply: (run, _params, catalog) => {
      const camp = attemptOf(run)?.camp;
      const last = camp?.completedTricks.at(-1);
      if (camp === undefined || last === undefined) throw new Error("there is no completed trick to void");
      if (camp.currentTrick.plays.length > 0) throw new Error("finish the trick in play first");
      return applyToolkitOps(run, DEV_ORIGIN, [{ op: "void-trick", trickIndex: last.index }], rulesFor(run, catalog), catalog);
    },
  },
  "reroll-route": {
    label: "Reroll a route option",
    group: "Run",
    fields: (run) => [{ name: "option", label: "Route", kind: "choice", options: routeChoices(run) }],
    apply: (run, params, catalog) => {
      if (run.stage.tag !== "route") throw new Error("reroll-route works at a route vote");
      return rerollOption(run as RunAt<"route">, readChoice(params, "option", routeChoices(run)) as RouteChoice, catalog);
    },
  },
  "set-route-swap": {
    label: "Set a route's boss swap",
    group: "Run",
    fields: (run, catalog) => [
      { name: "option", label: "Route", kind: "choice", options: routeChoices(run) },
      { name: "boss", label: "Boss", kind: "choice", options: bossOptions(catalog) },
    ],
    apply: (run, params, catalog) => setRouteSwap(run, readChoice(params, "option", routeChoices(run)), readChoice(params, "boss", bossOptions(catalog)), catalog),
  },
  "queue-offer": {
    label: "Queue a special draft offer",
    group: "Crew",
    fields: (run) => [seatField(run)],
    apply: (run, params, catalog) => {
      const seatId = readChoice(params, "seat", seatOptions(run));
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      const camp = campIndex(specOfStage(run)?.index ?? run.history.at(-1)?.camp ?? 1);
      const offer = { ...draftOfferFor(run.seed, camp, seat, seat.offers.length + 1, catalog), kind: "special" as const };
      return withSeat(run, seatId, { offers: [...seat.offers, offer] });
    },
  },
  "set-objective-owner": {
    label: "Set an objective's owner",
    group: "Cards",
    target: { kind: "objective", field: "objective" },
    fields: (run) => [
      { name: "objective", label: "Objective", kind: "choice", options: objectiveOptions(run) },
      { name: "seat", label: "Owner", kind: "choice", options: [...seatOptions(run), { value: "none", label: "none" }] },
    ],
    apply: (run, params) => {
      const attempt = attemptOf(run);
      if (attempt === null) throw new Error("there is no dealt camp with objectives");
      const camp = attempt.camp;
      const objectiveId = readChoice(params, "objective", objectiveOptions(run));
      const seat = readChoice(params, "seat", [...seatOptions(run), { value: "none", label: "none" }]);
      const objectives = camp.objectives.map((o) => (o.id === objectiveId ? { ...o, ownerSeatId: seat === "none" ? null : seat } : o));
      return withAttempt(run, { ...attempt, camp: { ...camp, objectives } });
    },
  },
  "set-objective-status": {
    label: "Mark an objective",
    group: "Cards",
    target: { kind: "objective", field: "objective" },
    fields: (run) => [
      { name: "objective", label: "Objective", kind: "choice", options: objectiveOptions(run) },
      { name: "status", label: "Status", kind: "choice", options: OBJECTIVE_STATUSES },
    ],
    apply: (run, params, catalog) => setObjectiveStatus(run, params, catalog),
  },
  ...triggerShortcuts,
} satisfies Readonly<Record<string, ShortcutDef>>;

