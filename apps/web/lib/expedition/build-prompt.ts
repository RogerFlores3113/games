import { CHARACTER_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionView } from "@games/rules";
import { cardLabel, SUIT_GLYPH } from "./expedition-ids";
import type { LocalUiState } from "./local-ui";
import { currentStep } from "./local-ui";

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

function sourceName(sourceId: string): string {
  return SOURCE_DISPLAY[sourceId]?.name ?? sourceId;
}

function identityOf(view: ExpeditionView, cardId: string): ExpeditionCardIdentityView | null {
  return view.attempt?.camp?.yourHand.find((c) => c.id === cardId)?.identity ?? null;
}

function targetingPrompt(view: ExpeditionView, ui: LocalUiState, nameOf: (seatId: string | null) => string): Prompt | null {
  const targeting = ui.targeting;
  if (targeting === null) return null;
  const step = currentStep(ui, view);
  const picked = (prefix: string): string | null => {
    const id = targeting.selected.find((choice) => choice.startsWith(`${prefix}:`));
    return id === undefined ? null : id.slice(prefix.length + 1);
  };

  if (targeting.mode === "whisper") {
    const cardId = picked("card");
    const card = cardId === null ? null : identityOf(view, cardId);
    const shown = card === null ? "a card" : cardLabel(card);
    if (step?.kind === "card") return { text: "Whisper: choose a card to share", tone: "your-move" };
    if (step !== null) return { text: `Whisper ${shown}: choose a teammate`, tone: "your-move" };
    return { text: `Whisper ${shown} to ${nameOf(picked("seat"))}? Confirm or Cancel`, tone: "your-move" };
  }

  const name = sourceName(targeting.sourceId);
  if (step !== null) return { text: `${name}: ${step.prompt}`, tone: "your-move" };
  const seat = picked("seat");
  return { text: seat === null ? `Use ${name}? Confirm or Cancel` : `Use ${name} on ${nameOf(seat)}? Confirm or Cancel`, tone: "your-move" };
}

/** Before the deal or during a rescue: the table waits on these seats. */
function gatePrompt(view: ExpeditionView, nameOf: (seatId: string | null) => string): Prompt | null {
  const window = view.attempt?.window;
  if (window !== "pre-deal" && window !== "rescue") return null;
  const pending = view.attempt?.pendingSeatIds ?? [];
  const when = window === "pre-deal" ? "Before the deal" : "An objective failed";
  if (view.yourSeatId !== null && pending.includes(view.yourSeatId)) {
    const ability = view.yourAbilities.find((a) => a.usableNow && SOURCE_DISPLAY[a.sourceId]?.active?.window === window);
    const name = ability === undefined ? "an ability" : sourceName(ability.sourceId);
    return { text: `${when}: use ${name} or skip`, tone: "your-move" };
  }
  if (pending.length === 0) return window === "pre-deal" ? { text: "Dealing the cards…", tone: "waiting" } : null;
  return { text: `${when}: waiting for ${nameOf(pending[0]!)}`, tone: "waiting" };
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

  const gate = gatePrompt(view, nameOf);
  if (gate !== null) return gate;

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

/** "Ana", "Ana and Bo", "Ana, Bo and Cy". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The fireside prompt: the last camp's result on arrival, then draft, pack,
 * and who the crew is still waiting for. */
export function buildFiresidePrompt(view: ExpeditionView, seats: readonly PromptSeat[], opts: { reconnecting: boolean }): Prompt {
  if (opts.reconnecting) return { text: "Reconnecting…", tone: "alert" };
  const nameOf = (seatId: string): string => shortName(seats.find((s) => s.seatId === seatId)?.displayLabel ?? "Someone");
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return { text: `The crew is getting ready for camp ${view.campNumber}`, tone: "waiting" };

  const last = view.history.at(-1);
  if (you.characterId === null) return { text: "Pick your character", tone: "your-move" };
  if (view.yourDraftOffer !== null) {
    if (last?.status === "succeeded") return { text: `Camp ${last.campNumber} cleared! Take one`, tone: "your-move" };
    return { text: "Take one to bring along", tone: "your-move" };
  }
  if (!you.ready) {
    if (last?.status === "failed") {
      const spent = `-${last.suppliesSpent} ${last.suppliesSpent === 1 ? "supply" : "supplies"}`;
      return { text: `Camp ${last.campNumber} failed: ${spent}. Try again: Ready`, tone: "alert" };
    }
    const name = CHARACTER_DISPLAY[you.characterId]?.name ?? you.characterId;
    return { text: `${name}, set out when Ready`, tone: "your-move" };
  }
  const waiting = view.seats.filter((s) => !s.ready).map((s) => nameOf(s.seatId));
  if (waiting.length === 0) return { text: "Setting out…", tone: "waiting" };
  const text = `Waiting for ${nameList(waiting)}`;
  return { text: text.length <= PROMPT_MAX_CHARS ? text : `Waiting for ${waiting.length} teammates`, tone: "waiting" };
}
