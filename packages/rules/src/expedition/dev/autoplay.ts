// The dev sandbox's stand-in for a player: the first move the engine accepts
// for the seats it controls. Never whispers, uses abilities, equips or buys;
// takes the first bundle; abstains from votes so the human's ballot decides.

import { currentActorSeatId } from "../camp";
import { rulesFor } from "../run/compose";
import { applyRunAction } from "../run/stages/registry";
import type { Catalog, RunAction, RunState } from "../run/types";
import { gatedPendingSeatIds } from "../run/windows";

type Candidate = { readonly seatId: string; readonly request: RunAction };

function candidates(run: RunState, seatIds: readonly string[], catalog: Catalog): Candidate[] {
  const mine = run.seats.filter((seat) => seatIds.includes(seat.seatId));
  const each = (request: RunAction): Candidate[] => mine.map((seat) => ({ seatId: seat.seatId, request }));
  const stage = run.stage;

  switch (stage.tag) {
    case "muster": {
      const taken = run.seats.flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId]));
      const free = Object.keys(catalog.characters).filter((id) => !taken.includes(id));
      const picks = mine.filter((seat) => seat.characterId === null).flatMap((seat, i): Candidate[] => (free[i] === undefined ? [] : [{ seatId: seat.seatId, request: { type: "pick-character", characterId: free[i]! } }]));
      return [...picks, ...mine.filter((seat) => !Object.hasOwn(stage.ballots, seat.seatId)).map((seat): Candidate => ({ seatId: seat.seatId, request: { type: "vote", choice: null } }))];
    }
    case "route":
      return mine.filter((seat) => !Object.hasOwn(stage.ballots, seat.seatId)).map((seat) => ({ seatId: seat.seatId, request: { type: "vote", choice: null } }));
    case "loadout":
    case "event":
      return each({ type: "ready" });
    case "draft":
      return mine.filter((seat) => seat.offers.length > 0).map((seat) => ({ seatId: seat.seatId, request: { type: "pick-bundle", bundle: 0 } }));
    case "camp": {
      const out: Candidate[] = gatedPendingSeatIds(run, catalog)
        .filter((seatId) => seatIds.includes(seatId))
        .map((seatId) => ({ seatId, request: { type: "skip-window" } }));
      const camp = stage.attempt.camp;
      const actor = currentActorSeatId(camp, rulesFor(run, catalog));
      if (actor !== null && seatIds.includes(actor)) {
        const unowned = camp.objectives.find((o) => o.ownerSeatId === null);
        if (unowned !== undefined) out.push({ seatId: actor, request: { type: "pick-objective", objectiveId: unowned.id } });
        for (const card of camp.hands.find((h) => h.seatId === actor)?.cards ?? []) out.push({ seatId: actor, request: { type: "play-card", cardId: card.id } });
      }
      return out;
    }
    case "ended":
      return [];
  }
}

export function botMove(run: RunState, seatIds: readonly string[], catalog: Catalog): { seatId: string; request: RunAction } | null {
  return candidates(run, seatIds, catalog).find((c) => applyRunAction(run, c.seatId, c.request, catalog).ok) ?? null;
}
