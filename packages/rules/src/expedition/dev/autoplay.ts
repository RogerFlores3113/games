// The dev sandbox's stand-in for a player: the first move the engine accepts
// for the seats it controls. Never whispers or uses abilities.

import { currentActorSeatId } from "../camp";
import { rulesFor } from "../run/compose";
import { runPhase } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
import type { Catalog, RunAction, RunState } from "../run/types";
import { gatedPendingSeatIds } from "../run/windows";

type Candidate = { readonly seatId: string; readonly request: RunAction };

function candidates(run: RunState, seatIds: readonly string[], catalog: Catalog): Candidate[] {
  const mine = run.seats.filter((seat) => seatIds.includes(seat.seatId));
  const out: Candidate[] = [];
  const phase = runPhase(run);

  if (phase === "muster") {
    const taken = run.seats.flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId]));
    const free = Object.keys(catalog.characters).filter((id) => !taken.includes(id));
    mine.filter((seat) => seat.characterId === null).forEach((seat, i) => {
      if (free[i] !== undefined) out.push({ seatId: seat.seatId, request: { type: "pick-character", characterId: free[i]! } });
    });
    for (const seat of mine) out.push({ seatId: seat.seatId, request: { type: "ready" } });
    return out;
  }

  if (phase === "fireside") {
    for (const seat of mine) {
      if (seat.draftOffer !== null && seat.draftOffer[0] !== undefined) out.push({ seatId: seat.seatId, request: { type: "pick-draft", sourceId: seat.draftOffer[0] } });
    }
    for (const seat of mine) out.push({ seatId: seat.seatId, request: { type: "ready" } });
    return out;
  }

  for (const seatId of gatedPendingSeatIds(run, catalog)) {
    if (seatIds.includes(seatId)) out.push({ seatId, request: { type: "skip-window" } });
  }

  const camp = run.attempt?.camp;
  if (phase === "camp" && camp !== undefined) {
    const actor = currentActorSeatId(camp, rulesFor(run, catalog));
    if (actor !== null && seatIds.includes(actor)) {
      const unowned = camp.objectives.find((o) => o.ownerSeatId === null);
      if (unowned !== undefined) out.push({ seatId: actor, request: { type: "pick-objective", objectiveId: unowned.id } });
      for (const card of camp.hands.find((h) => h.seatId === actor)?.cards ?? []) {
        out.push({ seatId: actor, request: { type: "play-card", cardId: card.id } });
      }
    }
  }
  return out;
}

export function botMove(run: RunState, seatIds: readonly string[], catalog: Catalog): { seatId: string; request: RunAction } | null {
  return candidates(run, seatIds, catalog).find((c) => applyRunAction(run, c.seatId, c.request, catalog).ok) ?? null;
}
