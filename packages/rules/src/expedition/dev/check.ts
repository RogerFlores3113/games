// Legality check for a whole RunState, for the dev sandbox: after any edit it
// answers "could the real engine have produced this?" as readable problems.

import { buildFullDeck, cardLabel } from "../deck";
import { FINAL_CAMP } from "../run/balance";
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

function checkRunFields(run: RunState, problems: string[]): void {
  for (const id of run.readySeatIds) if (!run.seatIds.includes(id)) problems.push(`ready list holds unknown seat ${id}`);
  for (const id of duplicates(run.readySeatIds)) problems.push(`ready list holds ${id} more than once`);
  if (!Number.isInteger(run.supplies) || run.supplies < 0) problems.push(`supplies must be a non-negative integer, got ${run.supplies}`);
  if (run.campNumber > FINAL_CAMP) problems.push(`camp ${run.campNumber} is past the final camp ${FINAL_CAMP}`);
  for (const entry of run.history) {
    if (entry.campNumber > FINAL_CAMP) problems.push(`history holds camp ${entry.campNumber}, past the final camp ${FINAL_CAMP}`);
  }
}

function checkCamp(run: RunState, problems: string[]): void {
  const camp = run.attempt?.camp;
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
