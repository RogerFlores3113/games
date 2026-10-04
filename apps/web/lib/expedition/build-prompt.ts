import { CHARACTER_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import { attemptOf, ledSuit, whisperLog } from "./view-access";
import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionView } from "@games/rules";
import { cardLabel, rankLabel, SUIT_GLYPH } from "./expedition-ids";
import type { LocalUiState } from "./local-ui";
import { currentStep } from "./local-ui";
import { sourceName, yourSourceId } from "./source-text";

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

function identityOf(view: ExpeditionView, cardId: string): ExpeditionCardIdentityView | null {
  return attemptOf(view)?.camp.yourHand.find((c) => c.id === cardId)?.identity ?? null;
}

function objectivePhrase(view: ExpeditionView, objectiveId: string): string {
  const o = attemptOf(view)?.camp.objectives.find((x) => x.id === objectiveId);
  if (o === undefined) return "an objective";
  if (o.kind === "win-card" || o.kind === "ordered") return `objective ${cardLabel(o.target)}`;
  if (o.kind === "hidden") return "the hidden objective";
  return o.kind === "no-tricks" ? "the no-tricks objective" : `the exactly-${o.n} objective`;
}

function cardPhrase(view: ExpeditionView, cardId: string): string {
  const camp = attemptOf(view)?.camp;
  const own = camp?.yourHand.find((c) => c.id === cardId);
  if (own !== undefined) return `your ${cardLabel(own.identity)}`;
  const played = camp?.currentTrick.plays.find((p) => !p.hidden && p.card.id === cardId);
  return played === undefined || played.hidden ? "a card" : `the ${cardLabel(played.card.identity)}`;
}

/** Names one picked target for the confirm line: "Bo", "Bo's hand", "your
 * 7♥", "trick 3", "7♥ as 9", "this trick", "the supplies". */
export function describeChoice(view: ExpeditionView, choiceId: string, nameOf: (seatId: string | null) => string): string {
  const [kind, ...rest] = choiceId.split(":");
  const raw = rest.join(":");
  switch (kind) {
    case "seat":
      return raw === view.yourSeatId ? "yourself" : nameOf(raw);
    case "hand":
      return `${nameOf(raw)}'s hand`;
    case "card":
      return cardPhrase(view, raw);
    case "objective":
      return objectivePhrase(view, raw);
    case "whisper": {
      const entry = whisperLog(view)[Number(raw)];
      if (entry === undefined) return "a whisper";
      const to = entry.subjectSeatIds[0] ?? null;
      const who = (id: string | null): string => (id === view.yourSeatId ? "you" : nameOf(id));
      return `the whisper ${who(entry.actorSeatId)} to ${who(to)}`;
    }
    case "trick":
      return `trick ${Number(raw) + 1}`;
    case "value": {
      const [cardId, rank] = [rest[0] ?? "", Number(rest[1])];
      return `${cardPhrase(view, cardId).replace(/^your /, "")} as ${rankLabel(rank)}`;
    }
    case "objective-value": {
      const objective = attemptOf(view)?.camp.objectives.find((o) => o.id === rest[0]);
      const card = objective !== undefined && "target" in objective ? cardLabel(objective.target) : "an objective's card";
      return `${card} shifted to ${rankLabel(Number(rest[1]))}`;
    }
    case "option":
      return describeOption(raw, nameOf);
    case "board":
      return "this trick";
    case "supplies":
      return "the supplies";
    default:
      return choiceId;
  }
}

/** An option an ability offers, in words: a Pop-up Shop buy or refresh, a
 * suit, or the value itself. */
export function describeOption(value: string, nameOf: (seatId: string | null) => string): string {
  const [kind, ...rest] = value.split(":");
  const coins = (n: string | undefined) => `${n} ${n === "1" ? "coin" : "coins"}`;
  if (kind === "buy") return `${sourceName(rest[1] ?? "")} for ${nameOf(rest[3] ?? null)}, ${coins(rest[2])}`;
  if (kind === "refresh") return `a fresh stock, ${coins(rest[0])}`;
  if (kind === "spades" || kind === "hearts" || kind === "diamonds" || kind === "clubs") return `${SUIT_GLYPH[kind]} ${kind}`;
  return value;
}

function joinTargets(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
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

  const name = sourceName(yourSourceId(view, targeting.sourceKey));
  if (step !== null) {
    const held = targeting.heldId === null ? null : identityOf(view, targeting.heldId);
    if (held !== null) return { text: `${name}: pick the rank ${cardLabel(held)} counts as`, tone: "your-move" };
    const objective = targeting.heldId === null ? undefined : attemptOf(view)?.camp.objectives.find((o) => o.id === targeting.heldId);
    if (objective !== undefined && "target" in objective) return { text: `${name}: pick the rank to shift ${cardLabel(objective.target)} to`, tone: "your-move" };
    const full = `${name}: ${step.prompt}`;
    return { text: full.length <= PROMPT_MAX_CHARS ? full : step.prompt, tone: "your-move" };
  }
  const targets = targeting.selected.map((id) => describeChoice(view, id, nameOf));
  const ask = targets.length === 0 ? `Use ${name}?` : `Use ${name} on ${joinTargets(targets)}?`;
  const full = `${ask} Confirm or Cancel`;
  return { text: full.length <= PROMPT_MAX_CHARS ? full : ask, tone: "your-move" };
}

/** During a rescue: the table waits on these seats. */
function gatePrompt(view: ExpeditionView, nameOf: (seatId: string | null) => string): Prompt | null {
  if (attemptOf(view)?.window !== "rescue") return null;
  const pending = attemptOf(view)!.pendingSeatIds;
  if (view.yourSeatId !== null && pending.includes(view.yourSeatId)) {
    const ability = view.yourAbilities.find((a) => a.usableNow && SOURCE_DISPLAY[yourSourceId(view, a.sourceKey)]?.active?.windows.includes("rescue"));
    const name = ability === undefined ? "an ability" : sourceName(yourSourceId(view, ability.sourceKey));
    return { text: `An objective failed: rescue it with ${name}, or pass`, tone: "your-move" };
  }
  if (pending.length === 0) return null;
  return { text: `An objective failed: waiting for ${nameOf(pending[0]!)}`, tone: "waiting" };
}

/** Who won the trick an unburned card counting as `target` landed in. */
function trickWinnerOf(camp: ExpeditionCampView, target: ExpeditionCardIdentityView): string | null {
  const label = cardLabel(target);
  const trick = camp.completedTricks.find((t) => t.plays.some((p) => !p.burned && cardLabel(p.countsAs ?? p.card.identity) === label));
  return trick?.winnerSeatId ?? null;
}

/** A goal's id names the rule that set it, then the seat it watches. */
function goalName(goalId: string): string {
  const sourceId = goalId.split(":")[0]!;
  return SOURCE_DISPLAY[sourceId]?.name ?? "A camp rule";
}

function campOverPrompt(camp: ExpeditionCampView, nameOf: (seatId: string | null) => string): Prompt {
  const failed = camp.objectives.find((o) => o.status === "failed");
  if (failed === undefined) {
    const broken = camp.goals.find((g) => g.status === "failed");
    return broken === undefined ? { text: "Camp cleared!", tone: "info" } : { text: `Camp failed: ${goalName(broken.id)} broke`, tone: "alert" };
  }
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

/** "Bait" or "Bait or Rule Breaker": your abilities usable on your turn,
 * before you play. */
function onYourTurnNames(view: ExpeditionView): string | null {
  const names = view.yourAbilities
    .map((a) => ({ usable: a.usableNow, sourceId: yourSourceId(view, a.sourceKey) }))
    .filter((a) => a.usable && SOURCE_DISPLAY[a.sourceId]?.active?.windows.includes("in-trick"))
    .map((a) => sourceName(a.sourceId));
  return names.length === 0 ? null : names.join(" or ");
}

function withTurnAbility(prompt: Prompt, names: string | null): Prompt {
  if (names === null) return prompt;
  const text = `${prompt.text}, or use ${names} first`;
  return text.length <= PROMPT_MAX_CHARS ? { ...prompt, text } : { ...prompt, text: `Your turn: play, or use ${names} first` };
}

function followPrompt(camp: ExpeditionCampView): Prompt {
  const legal = new Set(camp.yourLegalCardIds);
  const everyCardLegal = camp.yourHand.every((c) => legal.has(c.id));
  const led = ledSuit(camp);
  if (led !== null) {
    const suit = SUIT_GLYPH[led];
    const holdsSuit = camp.yourHand.some((c) => c.identity.kind === "standard" && c.identity.suit === led);
    if (holdsSuit && !everyCardLegal) return { text: `Your turn: follow ${suit} (highlighted cards)`, tone: "your-move" };
    if (!holdsSuit && everyCardLegal) return { text: `Your turn: you have no ${suit}, play any card`, tone: "your-move" };
  }
  return { text: everyCardLegal ? "Your turn: play any card" : "Your turn: play a highlighted card", tone: "your-move" };
}

function playingPrompt(view: ExpeditionView, camp: ExpeditionCampView, whisperAvailable: boolean, nameOf: (seatId: string | null) => string): Prompt {
  const actor = camp.currentActorSeatId;
  const leading = camp.currentTrick.plays.length === 0;

  if (actor !== null && actor === view.yourSeatId) {
    if (!leading) return withTurnAbility(followPrompt(camp), onYourTurnNames(view));
    const anyCard = camp.yourHand.every((c) => camp.yourLegalCardIds.includes(c.id));
    const play = anyCard ? "play any card" : "play a highlighted card";
    return { text: whisperAvailable ? `Your lead: ${play}, or Whisper first` : `Your lead: ${play}`, tone: "your-move" };
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

  const camp = attemptOf(view)?.camp ?? null;
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

/** The trail between camps, by stage: what you still owe, then who the
 * crew is waiting for. */
export function buildTrailPrompt(view: ExpeditionView, seats: readonly PromptSeat[], opts: { reconnecting: boolean }): Prompt {
  if (opts.reconnecting) return { text: "Reconnecting…", tone: "alert" };
  const nameOf = (seatId: string): string => shortName(seats.find((s) => s.seatId === seatId)?.displayLabel ?? "Someone");
  const waitingFor = (seatIds: readonly string[], done: string): Prompt => {
    if (seatIds.length === 0) return { text: done, tone: "waiting" };
    const text = `Waiting for ${nameList(seatIds.map(nameOf))}`;
    return { text: text.length <= PROMPT_MAX_CHARS ? text : `Waiting for ${seatIds.length} teammates`, tone: "waiting" };
  };
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  const stage = view.stage;
  const voted = (ballots: readonly { seatId: string }[], seatId: string) => ballots.some((b) => b.seatId === seatId);

  switch (stage.tag) {
    case "muster": {
      if (you !== undefined && you.characterId === null && !voted(stage.ballots, you.seatId)) return { text: "Pick your explorer and vote on the run length", tone: "your-move" };
      if (you !== undefined && you.characterId === null) return { text: "Pick your explorer", tone: "your-move" };
      if (you !== undefined && !voted(stage.ballots, you.seatId)) return { text: "Vote on how long the expedition runs", tone: "your-move" };
      return waitingFor(view.seats.filter((s) => s.characterId === null || !voted(stage.ballots, s.seatId)).map((s) => s.seatId), "Setting out…");
    }
    case "draft":
      if (stage.yourOffer !== null) return { text: `Camp ${stage.cleared} cleared! +${stage.payout} coins. Take a bundle`, tone: "your-move" };
      return waitingFor(stage.pendingSeatIds, "Choosing the route…");
    case "route": {
      const next = stage.options[0]?.next.index ?? 0;
      if (you !== undefined && !voted(stage.ballots, you.seatId)) return { text: `Vote on the route to camp ${next}`, tone: "your-move" };
      return waitingFor(view.seats.filter((s) => !voted(stage.ballots, s.seatId)).map((s) => s.seatId), "Setting off…");
    }
    case "event":
      if (you !== undefined && !stage.readySeatIds.includes(you.seatId)) return { text: "Something on the trail. Continue when ready", tone: "your-move" };
      return waitingFor(view.seats.filter((s) => !stage.readySeatIds.includes(s.seatId)).map((s) => s.seatId), "Moving on…");
    case "loadout": {
      const last = view.history.at(-1);
      if (you !== undefined && !stage.readySeatIds.includes(you.seatId)) {
        if (last?.camp === stage.camp.index && last.status === "failed") return { text: `Camp ${last.camp} failed. Set out to try again`, tone: "alert" };
        if (stage.shop !== null) return { text: `The shop is open. Set out for camp ${stage.camp.index} when ready`, tone: "your-move" };
        const name = you.characterId === null ? "Crew" : (CHARACTER_DISPLAY[you.characterId]?.name ?? you.characterId);
        return { text: `${name}, set out for camp ${stage.camp.index} when ready`, tone: "your-move" };
      }
      return waitingFor(view.seats.filter((s) => !stage.readySeatIds.includes(s.seatId)).map((s) => s.seatId), "Setting out…");
    }
    case "camp":
    case "ended":
      return { text: "", tone: "info" };
  }
}
