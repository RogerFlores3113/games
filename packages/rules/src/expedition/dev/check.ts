// Legality check for a whole RunState, for the dev sandbox: after any edit it
// answers "could the real engine have produced this?" as readable problems.

import { buildFullDeck, cardLabel } from "../deck";
import { SUPPLIES_MAX } from "../run/balance";
import { attemptOf } from "../run/attempt";
import { campCount } from "../run/plan";
import type { Catalog, RunState } from "../run/types";

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

function counts(values: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

function checkCrew(run: RunState, catalog: Catalog, problems: string[]): void {
  const { seatIds, seats } = run;
  if (seatIds.length < 3 || seatIds.length > 5) problems.push(`crew size: ${seatIds.length} seats, expected 3 to 5`);
  for (const id of duplicates(seatIds)) problems.push(`seat id ${id} appears more than once`);
  if (seats.length !== seatIds.length || seats.some((seat, i) => seat.seatId !== seatIds[i])) {
    problems.push("seats do not line up with seatIds in order");
  }
  for (const seat of seats) {
    if (seat.characterId !== null && !Object.hasOwn(catalog.characters, seat.characterId)) {
      problems.push(`${seat.seatId}: unknown character ${seat.characterId}`);
    }
    for (const id of seat.kit) {
      if (!Object.hasOwn(catalog.sources, id)) problems.push(`${seat.seatId}: kit holds unknown source ${id}`);
      else if (Object.hasOwn(catalog.characters, id)) problems.push(`${seat.seatId}: kit holds character ${id}`);
    }
    for (const id of seat.draftOffer ?? []) {
      if (!Object.hasOwn(catalog.sources, id)) problems.push(`${seat.seatId}: draft offer holds unknown source ${id}`);
    }
  }
  const characterIds = seats.flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId]));
  for (const id of duplicates(characterIds)) problems.push(`character ${id} is held by more than one seat`);
}

function checkPerSeat(run: RunState, what: string, keys: readonly string[], problems: string[]): void {
  for (const id of keys) if (!run.seatIds.includes(id)) problems.push(`${what} holds unknown seat ${id}`);
}

function checkSpecIndex(run: RunState, what: string, index: number, problems: string[]): void {
  const count = run.plan === null ? 0 : campCount(run.plan);
  if (!Number.isInteger(index) || index < 1 || index > count) problems.push(`${what} is camp ${index}, outside the plan's camps 1 to ${count}`);
}

function checkRunFields(run: RunState, problems: string[]): void {
  if (!Number.isInteger(run.supplies) || run.supplies < 0 || run.supplies > SUPPLIES_MAX) problems.push(`supplies must be a whole number from 0 to ${SUPPLIES_MAX}, got ${run.supplies}`);
  if (!Number.isInteger(run.purse) || run.purse < 0) problems.push(`the purse must be a non-negative whole number, got ${run.purse}`);
  const stage = run.stage;
  if ((run.plan === null) !== (stage.tag === "muster")) problems.push(stage.tag === "muster" ? "a run in muster has no plan yet" : `a run at ${stage.tag} needs a plan`);
  if (run.plan !== null) for (const entry of run.history) checkSpecIndex(run, "a history entry", entry.camp, problems);
  switch (stage.tag) {
    case "muster":
    case "route":
      checkPerSeat(run, "the ballots", Object.keys(stage.ballots), problems);
      break;
    case "loadout":
    case "event":
      checkPerSeat(run, "the ready list", Object.keys(stage.ready), problems);
      break;
  }
  if (stage.tag === "loadout" || stage.tag === "camp") checkSpecIndex(run, "the loadout or camp", stage.camp.index, problems);
  if (stage.tag === "route") for (const option of stage.options) checkSpecIndex(run, `route ${option.id}`, option.next.index, problems);
  if (stage.tag === "event") checkSpecIndex(run, "the chosen route", stage.route.next.index, problems);
  if (stage.tag === "draft" && run.plan !== null && stage.cleared >= campCount(run.plan)) problems.push(`a draft after camp ${stage.cleared} has no camp to lead to`);
}

function checkCamp(run: RunState, problems: string[]): void {
  const camp = attemptOf(run)?.camp;
  if (camp === undefined) return;
  const sameSeats = camp.seatIds.length === run.seatIds.length && camp.seatIds.every((id, i) => id === run.seatIds[i]);
  if (!sameSeats) problems.push("camp seats differ from the run's seats");

  const handSeats = camp.hands.map((h) => h.seatId);
  if (handSeats.length !== run.seatIds.length || run.seatIds.some((id) => !handSeats.includes(id)) || duplicates(handSeats).length > 0) {
    problems.push(`hands cover [${handSeats.join(", ")}], expected exactly [${run.seatIds.join(", ")}]`);
  }

  const plays = [...camp.completedTricks.flatMap((t) => t.plays), ...camp.currentTrick.plays];
  for (const play of plays) {
    if (!run.seatIds.includes(play.seatId)) problems.push(`trick play by unknown seat ${play.seatId}`);
  }

  const cards = [...camp.hands.flatMap((h) => h.cards), ...plays.map((p) => p.card), ...camp.discards.map((d) => d.card)];
  for (const id of duplicates(cards.map((c) => c.id))) problems.push(`card id ${id} appears more than once`);

  const have = counts([...cards.map((c) => cardLabel(c.identity)), ...camp.removedCards.map(cardLabel)]);
  const expected = counts(buildFullDeck().map(cardLabel));
  for (const [label, want] of expected) {
    const got = have.get(label) ?? 0;
    if (got !== want) problems.push(`card conservation: ${label} appears ${got} times, expected ${want}`);
  }

  for (const id of duplicates(camp.objectives.map((o) => o.id))) problems.push(`objective id ${id} appears more than once`);
  for (const o of camp.objectives) {
    if (o.ownerSeatId !== null && !run.seatIds.includes(o.ownerSeatId)) problems.push(`objective ${o.id} is owned by unknown seat ${o.ownerSeatId}`);
  }
}

/** Readable problems with `run`; `[]` means it is legal. */
export function checkRunState(run: RunState, catalog: Catalog): string[] {
  const problems: string[] = [];
  checkCrew(run, catalog, problems);
  checkRunFields(run, problems);
  checkCamp(run, problems);
  return problems;
}
