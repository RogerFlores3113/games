// Every dev shortcut as one small pure function over RunState, in one
// registry. The ids are part of the wire contract with the web dev panel.
// When RunState is redesigned, this file and check.ts are what change.

import { cardLabel } from "../deck";
import { FINAL_CAMP } from "../run/balance";
import { recordCampFailure, recordCampSuccess, runStatus, startAttempt } from "../run/lifecycle";
import { applyToolkitOps } from "../run/toolkit";
import type { CampNumber, Catalog, RunState } from "../run/types";
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
const nonCharacterSourceIds = (catalog: Catalog): string[] => Object.keys(catalog.sources).filter((id) => !Object.hasOwn(catalog.characters, id));

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
  return { ...run, seats };
}

function toFireside(run: RunState, catalog: Catalog): RunState {
  const crewed = assignCharacters(run, catalog);
  return { ...crewed, seats: crewed.seats.map((s) => ({ ...s, draftOffer: null })), readySeatIds: [...crewed.seatIds] };
}

function jumpToCamp(run: RunState, camp: CampNumber, catalog: Catalog): RunState {
  const fireside = toFireside(run, catalog);
  return startAttempt(
    { ...fireside, campNumber: camp, supplies: Math.max(fireside.supplies, 1), history: fireside.history.filter((h) => h.campNumber < camp), attempt: null },
    catalog,
  );
}

function ensureAttempt(run: RunState, catalog: Catalog): RunState {
  requireInProgress(run);
  return run.attempt !== null ? run : startAttempt(toFireside(run, catalog), catalog);
}

function allCardHolders(run: RunState): { readonly id: string; readonly label: string; readonly seatId: string }[] {
  return (run.attempt?.camp.hands ?? []).flatMap((h) => h.cards.map((c) => ({ id: c.id, label: `${cardLabel(c.identity)} (in ${h.seatId})`, seatId: h.seatId })));
}

function objectiveOptions(run: RunState): DevOption[] {
  return (run.attempt?.camp.objectives ?? []).map((o) => ({ value: o.id, label: `${describeObjective(o)} (${o.id})` }));
}

const campField: DevField = { name: "camp", label: "Camp", kind: "number", min: 1, max: FINAL_CAMP, initial: FINAL_CAMP };
const seatField = (run: RunState): DevField => ({ name: "seat", label: "Seat", kind: "choice", options: seatOptions(run) });

export const DEV_SHORTCUTS = {
  "jump-to-camp": {
    label: "Jump to camp",
    group: "Run",
    fields: () => [campField],
    apply: (run, params, catalog) => jumpToCamp(run, readNumber(params, "camp", 1, FINAL_CAMP) as CampNumber, catalog),
  },
  "jump-to-final-camp": {
    label: "Jump to the final camp",
    group: "Run",
    fields: () => [],
    apply: (run, _params, catalog) => jumpToCamp(run, FINAL_CAMP, catalog),
  },
  "end-run": {
    label: "End the run",
    group: "Run",
    fields: () => [{ name: "outcome", label: "Outcome", kind: "choice", options: opts(["won", "lost"]) }],
    apply: (run, params, catalog) => {
      const outcome = readChoice(params, "outcome", opts(["won", "lost"]));
      requireInProgress(run);
      if (outcome === "won") return recordCampSuccess(jumpToCamp(run, FINAL_CAMP, catalog), catalog);
      return recordCampFailure(ensureAttempt({ ...run, supplies: 1 }, catalog), catalog);
    },
  },
  "force-camp": {
    label: "Force the camp's outcome",
    group: "Camp",
    fields: () => [{ name: "outcome", label: "Outcome", kind: "choice", options: opts(["succeeded", "failed"]) }],
    apply: (run, params, catalog) => {
      const outcome = readChoice(params, "outcome", opts(["succeeded", "failed"]));
      const attempting = ensureAttempt(run, catalog);
      return outcome === "succeeded" ? recordCampSuccess(attempting, catalog) : recordCampFailure(attempting, catalog);
    },
  },
  "set-supplies": {
    label: "Set supplies",
    group: "Run",
    fields: (run) => [{ name: "supplies", label: "Supplies", kind: "number", min: 0, max: 99, initial: run.supplies }],
    apply: (run, params) => ({ ...run, supplies: readNumber(params, "supplies", 0, 99) }),
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
  "set-kit": {
    label: "Set a seat's kit",
    group: "Crew",
    fields: (run) => [seatField(run), { name: "kit", label: "Source ids, comma separated", kind: "text", initial: "" }],
    apply: (run, params, catalog) => {
      const seatId = readChoice(params, "seat", seatOptions(run));
      const raw = params["kit"];
      if (typeof raw !== "string") throw new Error("kit must be text");
      const kit = raw.split(",").map((id) => id.trim()).filter((id) => id !== "");
      const allowed = nonCharacterSourceIds(catalog);
      const bad = kit.find((id) => !allowed.includes(id));
      if (bad !== undefined) throw new Error(`${bad} is not an upgrade or item in the catalogue`);
      return withSeat(run, seatId, { kit });
    },
  },
  "give-source": {
    label: "Give a seat an upgrade or item",
    group: "Crew",
    fields: (run, catalog) => [seatField(run), { name: "source", label: "Source", kind: "choice", options: opts(nonCharacterSourceIds(catalog)) }],
    apply: (run, params, catalog) => {
      const seatId = readChoice(params, "seat", seatOptions(run));
      const source = readChoice(params, "source", opts(nonCharacterSourceIds(catalog)));
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      return withSeat(run, seatId, { kit: [...seat.kit, source] });
    },
  },
  "move-card": {
    label: "Move a card to another hand",
    group: "Cards",
    fields: (run) => [
      { name: "card", label: "Card", kind: "choice", options: allCardHolders(run).map((c) => ({ value: c.id, label: c.label })) },
      { name: "to", label: "To", kind: "choice", options: seatOptions(run) },
    ],
    apply: (run, params) => {
      if (run.attempt === null) throw new Error("there is no dealt camp to move cards in");
      const holders = allCardHolders(run);
      const cardId = readChoice(params, "card", holders.map((c) => ({ value: c.id, label: c.label })));
      const to = readChoice(params, "to", seatOptions(run));
      const from = holders.find((c) => c.id === cardId)!.seatId;
      if (from === to) throw new Error(`the card is already in ${to}'s hand`);
      return applyToolkitOps(run, to, "dev", [{ op: "move-card", cardId, fromSeatId: from, toSeatId: to }]);
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
      const attempt = run.attempt;
      if (attempt === null) throw new Error("there is no dealt camp with objectives");
      const camp = attempt.camp;
      const objectiveId = readChoice(params, "objective", objectiveOptions(run));
      const seat = readChoice(params, "seat", [...seatOptions(run), { value: "none", label: "none" }]);
      const objectives = camp.objectives.map((o) => (o.id === objectiveId ? { ...o, ownerSeatId: seat === "none" ? null : seat } : o));
      return { ...run, attempt: { ...attempt, camp: { ...camp, objectives } } };
    },
  },
} satisfies Readonly<Record<string, ShortcutDef>>;

