// Every dev shortcut as one small pure function over RunState, in one
// registry. The ids are part of the wire contract with the web dev panel.
// When RunState is redesigned, this file and check.ts are what change.

import { cardLabel } from "../deck";
import { RUN_LENGTHS, SUPPLIES_MAX } from "../run/balance";
import { attemptOf, withAttempt } from "../run/attempt";
import { mintItems } from "../run/items";
import { dealCamp, openLoadout, runStatus, settleCamp } from "../run/lifecycle";
import { rulesFor } from "../run/compose";
import { campIndex, drawPlan } from "../run/plan";
import { campSpecAt } from "../run/route";
import { applyToolkitOps } from "../run/toolkit";
import type { Catalog, RunAt, RunLength, RunState } from "../run/types";
import { describeObjective } from "../objectives";
import type { DevField, DevOption, DevParams } from "../../adapter";

export type ShortcutDef = {
  readonly label: string;
  readonly group: string;
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
  const crewed: RunState = { ...assignCharacters(run, catalog), plan: drawPlan(length), supplies: Math.max(run.supplies, 1) };
  return openLoadout({ ...crewed, history: crewed.history.filter((h) => h.camp < k) }, campSpecAt(run.seed, length, campIndex(k)), catalog);
}

function jumpToCamp(run: RunState, length: RunLength, k: number, stage: "loadout" | "camp", catalog: Catalog): RunState {
  const loadout = loadoutAt(run, length, k, catalog);
  return stage === "loadout" ? loadout : dealCamp(loadout, catalog);
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
    case "event":
      return dealCamp(openLoadout(run, stage.route.next, catalog), catalog);
    case "muster":
      return dealCamp(loadoutAt(run, lengthOf(run), 1, catalog), catalog);
    case "draft":
      return dealCamp(loadoutAt(run, lengthOf(run), stage.cleared + 1, catalog), catalog);
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
const STAGE_OPTIONS = opts(["camp", "loadout"]);

export const DEV_SHORTCUTS = {
  "jump-to-camp": {
    label: "Jump to camp",
    group: "Run",
    fields: (run) => [
      lengthField(run),
      { name: "camp", label: "Camp", kind: "number", min: 1, max: MAX_CAMPS, initial: 1 },
      { name: "stage", label: "Arrive at", kind: "choice", options: STAGE_OPTIONS },
    ],
    apply: (run, params, catalog) => {
      const length = readChoice(params, "length", opts(LENGTHS)) as RunLength;
      const stage = readChoice(params, "stage", STAGE_OPTIONS) as "loadout" | "camp";
      return jumpToCamp(run, length, readNumber(params, "camp", 1, RUN_LENGTHS[length].camps), stage, catalog);
    },
  },
  "jump-to-final-camp": {
    label: "Jump to the final camp",
    group: "Run",
    fields: () => [],
    apply: (run, _params, catalog) => jumpToCamp(run, lengthOf(run), RUN_LENGTHS[lengthOf(run)].camps, "camp", catalog),
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
      return applyToolkitOps(run, to, "dev", [{ op: "move-card", cardId, fromSeatId: from, toSeatId: to }], rulesFor(run, catalog));
    },
  },
  "set-objective-owner": {
    label: "Set an objective's owner",
    group: "Cards",
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
} satisfies Readonly<Record<string, ShortcutDef>>;

