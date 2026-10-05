// Who is in the crew. A seat the crew votes out leaves seatIds and seats for
// `kicked`, so every per-player rule (the deck, votes, whispers washed,
// objective picks, bosses) reads the crew in play and never learns that kicks
// exist. The kicked SeatRun is kept whole and comes back at a loadout.

import type { Catalog, KickedSeat, RunState, SeatRun } from "./types";

/** Expedition's smallest crew: no kick takes it below this. */
export const MIN_CREW = 3;

/** Every character held in the run, a kicked seat's included: nobody may
 * take a character whose player is out. */
export function takenCharacters(run: RunState): ReadonlySet<string> {
  return new Set([...run.seats, ...run.kicked.map((k) => k.seat)].flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId])));
}

/** The first character nobody holds, in registry order. */
export function firstFreeCharacter(run: RunState, catalog: Catalog): string | null {
  const taken = takenCharacters(run);
  return Object.keys(catalog.characters).find((id) => !taken.has(id)) ?? null;
}

/** Moves seatId out of the crew with its SeatRun intact, except its unpicked
 * offers: it misses that draft. */
export function benchSeat(run: RunState, seatId: string): RunState {
  const position = run.seatIds.indexOf(seatId);
  const seat = run.seats[position]!;
  return {
    ...run,
    seatIds: run.seatIds.filter((id) => id !== seatId),
    seats: run.seats.filter((s) => s.seatId !== seatId),
    kicked: [...run.kicked, { seat: { ...seat, offers: [] }, position, back: false }],
  };
}

export function markBack(run: RunState, seatId: string, back: boolean): RunState {
  const kicked = run.kicked.map((k) => (k.seat.seatId === seatId && k.back !== back ? { ...k, back } : k));
  return kicked.some((k, i) => k !== run.kicked[i]) ? { ...run, kicked } : run;
}

/** Every kicked seat that is back rejoins the crew at its old place, by
 * position. One kicked before it picked a character takes the first free one. */
export function rejoinBack(run: RunState, catalog: Catalog): RunState {
  const returning = run.kicked.filter((k) => k.back).sort((a, b) => a.position - b.position);
  if (returning.length === 0) return run;
  return returning.reduce<RunState>(
    (acc, k) => {
      const seat: SeatRun = k.seat.characterId !== null ? k.seat : { ...k.seat, characterId: firstFreeCharacter(acc, catalog) };
      const at = Math.min(k.position, acc.seatIds.length);
      return {
        ...acc,
        seatIds: [...acc.seatIds.slice(0, at), seat.seatId, ...acc.seatIds.slice(at)],
        seats: [...acc.seats.slice(0, at), seat, ...acc.seats.slice(at)],
      };
    },
    { ...run, kicked: run.kicked.filter((k: KickedSeat) => !k.back) },
  );
}
