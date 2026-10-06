// The dev sandbox's stand-in for a player: the first move the engine accepts
// for the seats it controls. Never whispers, uses abilities, equips or buys;
// takes the first bundle (discarding its last backpack item first while it
// does not fit); abstains from votes so the human's ballot decides, and
// locks in at the muster once it has picked and abstained.

import { currentActorSeatId } from "../camp";
import { platePath, pressedCount } from "../content/mods/temple";
import { absentSeatAction } from "../run/absent";
import { rulesFor } from "../run/compose";
import { campStack, modCtx } from "../run/stack";
import { applyRunAction } from "../run/stages/registry";
import type { Catalog, RunAction, RunAt, RunState } from "../run/types";
import { gatedPendingSeatIds } from "../run/windows";
import type { CardIdentity, ExpeditionCard } from "../state";

type Candidate = { readonly seatId: string; readonly request: RunAction };

const isSun = (identity: CardIdentity): boolean => identity.kind === "joker" && identity.joker === "sun";

/** At the temple a lead that presses the next plate comes first, and the Sun
 * comes last unless it presses the last plate: it breaks the path if it
 * leaves play any earlier. */
function templeOrder(run: RunAt<"camp">, cards: readonly ExpeditionCard[], catalog: Catalog): readonly ExpeditionCard[] {
  const layer = campStack(run, catalog).find((l) => l.def.kind === "temple");
  if (layer === undefined) return cards;
  const camp = run.stage.attempt.camp;
  const path = platePath(modCtx(run, run.stage.camp, layer, catalog), camp);
  const next = path[pressedCount(camp, path)];
  const leading = camp.currentTrick.plays.length === 0;
  const presses = (identity: CardIdentity) => (next === "sun" ? isSun(identity) : identity.kind === "standard" && identity.suit === next);
  const order = (card: ExpeditionCard) => (leading && presses(card.identity) ? 0 : isSun(card.identity) ? 2 : 1);
  return [...cards].sort((a, b) => order(a) - order(b));
}

function candidates(run: RunState, seatIds: readonly string[], catalog: Catalog): Candidate[] {
  const mine = run.seats.filter((seat) => seatIds.includes(seat.seatId));
  const each = (request: RunAction): Candidate[] => mine.map((seat) => ({ seatId: seat.seatId, request }));
  const stage = run.stage;

  switch (stage.tag) {
    case "muster": {
      const taken = run.seats.flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId]));
      const free = Object.keys(catalog.characters).filter((id) => !taken.includes(id));
      const picks = mine.filter((seat) => seat.characterId === null).flatMap((seat, i): Candidate[] => (free[i] === undefined ? [] : [{ seatId: seat.seatId, request: { type: "pick-character", characterId: free[i]! } }]));
      const votes = mine.filter((seat) => !Object.hasOwn(stage.ballots, seat.seatId)).map((seat): Candidate => ({ seatId: seat.seatId, request: { type: "vote", choice: null } }));
      const locks = mine.filter((seat) => !Object.hasOwn(stage.locked, seat.seatId)).map((seat): Candidate => ({ seatId: seat.seatId, request: { type: "lock-in" } }));
      return [...picks, ...votes, ...locks];
    }
    case "route":
      return mine.filter((seat) => !Object.hasOwn(stage.ballots, seat.seatId)).map((seat) => ({ seatId: seat.seatId, request: { type: "vote", choice: null } }));
    case "shop":
    case "loadout":
    case "event":
      return each({ type: "ready" });
    case "draft":
      return mine.flatMap((seat): Candidate[] => {
        const move = absentSeatAction(run, seat.seatId, catalog);
        return move === null ? [] : [{ seatId: seat.seatId, request: move }];
      });
    case "camp": {
      const out: Candidate[] = gatedPendingSeatIds(run, catalog)
        .filter((seatId) => seatIds.includes(seatId))
        .map((seatId) => ({ seatId, request: { type: "skip-window" } }));
      const camp = stage.attempt.camp;
      const actor = currentActorSeatId(camp, rulesFor(run, catalog));
      if (actor !== null && seatIds.includes(actor)) {
        const unowned = camp.objectives.find((o) => o.ownerSeatId === null);
        if (unowned !== undefined) out.push({ seatId: actor, request: { type: "pick-objective", objectiveId: unowned.id } });
        for (const card of templeOrder(run as RunAt<"camp">, camp.hands.find((h) => h.seatId === actor)?.cards ?? [], catalog)) out.push({ seatId: actor, request: { type: "play-card", cardId: card.id } });
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
