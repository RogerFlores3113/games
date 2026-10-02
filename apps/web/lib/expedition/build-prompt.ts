import { GEAR_DISPLAY } from "@games/rules";
import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionTargetKind, ExpeditionView } from "@games/rules";
import { cardLabel, SUIT_GLYPH } from "./expedition-ids";
import type { LocalUiState } from "./local-ui";
import { nextTargetKind } from "./local-ui";

/**
 * The one line that always says what to do next. Reads only fields the view
 * already carries; it describes legality the server computed
 * (`yourLegalCardIds`) and never recomputes it.
 */

export type PromptTone = "your-move" | "waiting" | "info" | "alert";

export interface Prompt {
  text: string;
  tone: PromptTone;
}

export interface PromptSeat {
  seatId: string;
  displayLabel: string;
}

/** The prompt zone holds 56 sign-font cells. */
export const PROMPT_MAX_CHARS = 56;
const NAME_MAX_CHARS = 10;

function shortName(name: string): string {
  return name.length <= NAME_MAX_CHARS ? name : `${name.slice(0, NAME_MAX_CHARS - 1)}…`;
}

function gearName(gearId: string): string {
  return GEAR_DISPLAY[gearId]?.name ?? gearId;
}

const TARGET_ASK: Readonly<Record<ExpeditionTargetKind, string>> = {
  teammate: "choose a teammate",
  "own-card": "choose one of your cards",
  "face-up-objective": "choose an objective on the table",
  "own-objective": "choose one of your objectives",
};

function identityOf(view: ExpeditionView, cardId: string): ExpeditionCardIdentityView | null {
  return view.attempt?.camp?.yourHand.find((c) => c.id === cardId)?.identity ?? null;
}

function targetingPrompt(view: ExpeditionView, ui: LocalUiState, nameOf: (seatId: string | null) => string): Prompt | null {
  const targeting = ui.targeting;
  if (targeting === null) return null;
  const next = nextTargetKind(ui);

  if (targeting.mode === "whisper") {
    const card = targeting.cardId === null ? null : identityOf(view, targeting.cardId);
    const shown = card === null ? "a card" : cardLabel(card);
    if (next === "own-card") return { text: "Whisper: choose a card to share", tone: "your-move" };
    if (next === "teammate") return { text: `Whisper ${shown}: choose a teammate`, tone: "your-move" };
    return { text: `Whisper ${shown} to ${nameOf(targeting.targetSeatId)}? Confirm or Cancel`, tone: "your-move" };
  }

  const name = gearName(targeting.gearId);
  if (next !== null) return { text: `${name}: ${TARGET_ASK[next]}`, tone: "your-move" };
  const onlyTarget = targeting.selected.length === 1 ? targeting.selected[0]! : null;
  const teammate = onlyTarget !== null && view.seats.some((s) => s.seatId === onlyTarget) ? nameOf(onlyTarget) : null;
  return { text: teammate === null ? `Use ${name}? Confirm or Cancel` : `Use ${name} on ${teammate}? Confirm or Cancel`, tone: "your-move" };
}

function preDealPrompt(view: ExpeditionView, nameOf: (seatId: string | null) => string): Prompt {
  const pending = view.attempt?.preDealPendingSeatIds ?? [];
  if (view.yourSeatId !== null && pending.includes(view.yourSeatId)) {
    const gear = view.yourGear.find((g) => GEAR_DISPLAY[g.gearId]?.window === "pre-deal");
    const name = gear === undefined ? "your gear" : gearName(gear.gearId);
    return { text: `Before the deal: use ${name} or skip`, tone: "your-move" };
  }
  if (pending.length === 0) return { text: "Dealing the cards…", tone: "waiting" };
  return { text: `Waiting for ${nameOf(pending[0]!)} to decide on pre-deal gear`, tone: "waiting" };
}

function trickWinnerOf(camp: ExpeditionCampView, target: ExpeditionCardIdentityView): string | null {
  const label = cardLabel(target);
  const trick = camp.completedTricks.find((t) => t.plays.some((p) => cardLabel(p.card.identity) === label));
  return trick?.winnerSeatId ?? null;
}

function campOverPrompt(camp: ExpeditionCampView, nameOf: (seatId: string | null) => string): Prompt {
  const failed = camp.objectives.find((o) => o.status === "failed");
  if (failed === undefined) return { text: "Camp cleared!", tone: "info" };
  if (failed.kind === "win-card" || failed.kind === "ordered") {
    const winner = trickWinnerOf(camp, failed.target);
    if (winner !== null && winner !== failed.ownerSeatId) {
      return { text: `Camp failed: ${cardLabel(failed.target)} was won by ${nameOf(winner)}`, tone: "alert" };
    }
    return { text: `Camp failed: ${cardLabel(failed.target)} objective broke`, tone: "alert" };
  }
  if (failed.ownerSeatId !== null) return { text: `Camp failed: ${nameOf(failed.ownerSeatId)} missed a trick count`, tone: "alert" };
  return { text: "Camp failed", tone: "alert" };
}

function followPrompt(camp: ExpeditionCampView): Prompt {
  const legal = new Set(camp.yourLegalCardIds);
  const everyCardLegal = camp.yourHand.every((c) => legal.has(c.id));
  const led = camp.currentTrick.plays[0]?.card.identity;
  if (led !== undefined && led.kind === "standard") {
    const suit = SUIT_GLYPH[led.suit];
    const holdsSuit = camp.yourHand.some((c) => c.identity.kind === "standard" && c.identity.suit === led.suit);
    if (holdsSuit && !everyCardLegal) return { text: `Your turn: follow ${suit} (highlighted cards)`, tone: "your-move" };
    if (!holdsSuit && everyCardLegal) return { text: `Your turn: you have no ${suit}, play any card`, tone: "your-move" };
  }
  return { text: everyCardLegal ? "Your turn: play any card" : "Your turn: play a highlighted card", tone: "your-move" };
}

function playingPrompt(view: ExpeditionView, camp: ExpeditionCampView, whisperAvailable: boolean, nameOf: (seatId: string | null) => string): Prompt {
  const actor = camp.currentActorSeatId;
  const leading = camp.currentTrick.plays.length === 0;
  const firstTrick = leading && camp.completedTricks.length === 0;

  if (actor !== null && actor === view.yourSeatId) {
    if (!leading) return followPrompt(camp);
    const anyCard = camp.yourHand.every((c) => camp.yourLegalCardIds.includes(c.id));
    const play = anyCard ? "play any card" : "play a highlighted card";
    return { text: whisperAvailable ? `Your lead: ${play}, or Whisper first` : `Your lead: ${play}`, tone: "your-move" };
  }

  if (firstTrick && camp.objectiveAssignment === "face-down") {
    return { text: "Thick Fog: objectives were dealt face down", tone: "info" };
  }
  if (leading && whisperAvailable) return { text: `${nameOf(actor)} leads next. You can Whisper now`, tone: "waiting" };
  return { text: `${nameOf(actor)} is playing`, tone: "waiting" };
}

export function buildPrompt(
  view: ExpeditionView,
  seats: readonly PromptSeat[],
  ui: LocalUiState,
  opts: { reconnecting: boolean; whisperAvailable: boolean },
): Prompt {
  const nameOf = (seatId: string | null): string =>
    shortName(seats.find((s) => s.seatId === seatId)?.displayLabel ?? "Someone");

  if (opts.reconnecting) return { text: "Reconnecting…", tone: "alert" };

  const targeting = targetingPrompt(view, ui, nameOf);
  if (targeting !== null) return targeting;

  if (view.runPhase === "pre-deal") return preDealPrompt(view, nameOf);

  const camp = view.attempt?.camp ?? null;
  if (camp === null) return { text: "Dealing the cards…", tone: "waiting" };

  if (camp.campPhase === "ended") return campOverPrompt(camp, nameOf);

  if (camp.campPhase === "objective-pick") {
    if (camp.currentActorSeatId !== null && camp.currentActorSeatId === view.yourSeatId) {
      return { text: "Your pick: click an objective on the table", tone: "your-move" };
    }
    return { text: `${nameOf(camp.currentActorSeatId)} is picking an objective`, tone: "waiting" };
  }

  return playingPrompt(view, camp, opts.whisperAvailable, nameOf);
}
