import type { ExpeditionCampPreviewView, ExpeditionView } from "@games/rules";
import { CHARACTER_DISPLAY, EVENT_DISPLAY, RUN_LENGTH_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import type { Prompt } from "./build-prompt";
import { buildTrailPrompt } from "./build-prompt";
import type { SceneServerInput, Tooltip, TopBar } from "./build-scene-model";
import { buildTopBar } from "./build-scene-model";
import { characterName, chargeText, liveSourceKeys, sourceBadges, sourceIdOfKey, sourceKind, sourceName, sourceRulesText } from "./source-text";
import { bundleObjectId, draftObjectId, kitObjectId, lengthObjectId, READY_ID, routeObjectId } from "./expedition-ids";
import type { LocalUiState } from "./local-ui";
import { bossLabel, focusCampIndex, modName, plannedBossAt } from "./view-access";

/**
 * The trail before, between and after the camps: the muster with its
 * length vote, the draft, the route vote, the event and the loadout. A pure
 * display transform of the view; the worker decides whether a pick or vote
 * is legal.
 */

export type StopKind = "camp" | "boss" | "temple";

export interface TrailStop {
  index: number;
  state: "cleared" | "here" | "ahead";
  kind: StopKind;
  /** Second label line under the marker: "cleared", "next", "try 2", or
   * "boss" and "temple" ahead. The top bar names the boss of the camp the
   * crew is at. */
  caption: string;
}

/** One bundle of a draft offer: its items arrive together. */
export interface DraftBundle {
  bundle: number;
  itemIds: string[];
  /** The first item, for the card's art. */
  sourceId: string;
  objectId: string;
  /** "Bait + Parrot". */
  name: string;
  /** "Bundle 1". */
  ribbon: string;
  text: string;
  /** Each item's uses: ["Bait: Single use", "Parrot: Once per camp"]. */
  badges: string[];
}

/** One of the characters at muster. */
export interface CharacterCard {
  characterId: string;
  objectId: string;
  name: string;
  theme: string;
  power: { sourceId: string; name: string; text: string; badges: string[] };
  /** "Herbs: start 2, max 3"; null without a pool. */
  pool: string | null;
  /** The teammate who took it; "You" for your own pick. */
  takenBy: string | null;
  yours: boolean;
  pickable: boolean;
}

/** A run length on the muster's ballot. */
export interface LengthOption {
  id: string;
  objectId: string;
  name: string;
  /** "4 camps". */
  camps: string;
  /** One marker per camp, boss camps and the temple marked. */
  stops: StopKind[];
  /** "Temple at the end", "1 boss, then the temple". */
  summary: string;
  /** Who voted for it, you first. */
  voters: string[];
  yours: boolean;
  votable: boolean;
}

export interface MusterCrewRow {
  seatId: string;
  name: string;
  isYou: boolean;
  connected: boolean;
  status: "ready" | "choosing" | "voting";
}

/** A camp as a route card or the loadout shows it. */
export interface CampPreview {
  title: string;
  location: string;
  weather: string;
  /** The event's name on the way there; null at camp 1. */
  event: string | null;
  /** "3 cards to win", "Win 2 in order", "A trick count". */
  objectives: string[];
  /** "Animal boss", "The Temple"; null for a plain camp. */
  boss: string | null;
}

export interface RouteCard {
  id: string;
  objectId: string;
  label: string;
  next: CampPreview;
  voters: string[];
  yours: boolean;
  votable: boolean;
}

/** The vote that just resolved, with the coin flip that settled a tie. */
export interface VoteResult {
  /** Unique per vote, so the flip plays once however often the scene redraws. */
  key: string;
  title: string;
  winner: string;
  /** Every choice with its votes, in ballot order. */
  tally: { label: string; votes: number; winner: boolean }[];
  /** Each face is a tied choice and the glyph its side of the coin shows. */
  flip: { faces: { label: string; glyph: string }[]; winner: { label: string; glyph: string } } | null;
}

export type DraftPanel =
  | { kind: "offer"; bundles: DraftBundle[] }
  | { kind: "taken"; sourceId: string; name: string }
  | { kind: "none"; text: string };

export type TrailPanel =
  | { kind: "muster"; characters: CharacterCard[]; lengths: LengthOption[]; crew: MusterCrewRow[]; votes: string }
  | { kind: "draft"; heading: string; draft: DraftPanel }
  | { kind: "route"; options: RouteCard[] }
  | { kind: "event"; name: string; text: string; next: CampPreview }
  | { kind: "loadout"; next: CampPreview };

/** One of your live sources: `sourceKey` is what you act through, and
 * `sourceId` the def it names. */
export interface KitItem {
  sourceKey: string;
  sourceId: string;
  objectId: string;
  name: string;
  kind: "character" | "upgrade" | "item";
  /** What is left: "2/3 herbs", "1 left", "always on". */
  charge: string;
}

export interface CrewRow {
  seatId: string;
  displayLabel: string;
  isYou: boolean;
  connected: boolean;
  status: "ready" | "waiting" | "drafting" | "voted" | "voting";
  /** "The Scout", or null while still choosing. */
  character: string | null;
  sources: { sourceKey: string; sourceId: string; name: string }[];
}

export interface TrailModel {
  sceneKey: "trail";
  topBar: TopBar;
  prompt: Prompt;
  /** The run's camps; null at muster, before the length is chosen. */
  trail: TrailStop[] | null;
  panel: TrailPanel;
  /** Your character, your upgrade, then your equipped items. Null for a spectator. */
  kit: KitItem[] | null;
  crew: CrewRow[];
  /** The loadout's Set out or the event's Continue; null otherwise or for a
   * spectator. */
  ready: { objectId: string; label: string; state: "open" | "done" } | null;
  /** Shown where Ready goes when there is no button: "2 of 3 voted". */
  status: string | null;
  vote: VoteResult | null;
  tooltip: Tooltip | null;
}

type View = ExpeditionView;

function nameOf(server: SceneServerInput, seatId: string): string {
  if (seatId === server.game.yourSeatId) return "You";
  return server.roomSeats.find((r) => r.seatId === seatId)?.displayLabel ?? "?";
}

/** Ballot names for a choice, you first. */
function votersFor(server: SceneServerInput, ballots: readonly { seatId: string; choice: string | null }[], choice: string): string[] {
  const seatIds = ballots.filter((b) => b.choice === choice).map((b) => b.seatId);
  const you = server.game.yourSeatId;
  return [...seatIds.filter((id) => id === you), ...seatIds.filter((id) => id !== you)].map((id) => nameOf(server, id));
}

function stopKind(view: View, index: number): StopKind {
  const boss = plannedBossAt(view, index);
  if (boss === null) return "camp";
  return boss.tier === "temple" ? "temple" : "boss";
}

function buildTrail(view: View): TrailStop[] | null {
  if (view.campCount === null) return null;
  const here = focusCampIndex(view);
  return Array.from({ length: view.campCount }, (_, i): TrailStop => {
    const index = i + 1;
    const results = view.history.filter((h) => h.camp === index);
    const cleared = results.some((h) => h.status === "cleared");
    const state = cleared ? "cleared" : index === here ? "here" : "ahead";
    const kind = stopKind(view, index);
    const parts: string[] = [];
    if (state === "cleared") parts.push("cleared");
    if (state === "here") parts.push(results.length === 0 ? "next" : `try ${results.length + 1}`);
    if (state === "ahead" && kind !== "camp") parts.push(kind);
    return { index, state, kind, caption: parts.join(", ") };
  });
}

function objectiveLabels(slotKinds: readonly string[]): string[] {
  const count = (kind: string) => slotKinds.filter((k) => k === kind).length;
  const labels: string[] = [];
  const cards = count("win-card");
  if (cards > 0) labels.push(`${cards} ${cards === 1 ? "card" : "cards"} to win`);
  if (count("ordered") > 0) labels.push(`Win ${count("ordered")} in order`);
  if (count("trick-count") > 0) labels.push("A trick count");
  if (count("no-tricks") > 0) labels.push("Win no tricks");
  if (count("exactly-n") > 0) labels.push("Exact tricks");
  return labels;
}

export function campPreview(view: View, camp: ExpeditionCampPreviewView): CampPreview {
  return {
    title: view.campCount === null ? `Camp ${camp.index}` : `Camp ${camp.index} of ${view.campCount}`,
    location: modName(camp.location),
    weather: modName(camp.weather),
    event: camp.event === null ? null : (EVENT_DISPLAY[camp.event]?.name ?? modName(camp.event)),
    objectives: objectiveLabels(camp.slotKinds),
    boss: bossLabel(view, camp.index),
  };
}

function lengthSummary(bossCamps: readonly { tier: string }[]): string {
  const bosses = bossCamps.filter((b) => b.tier !== "temple").length;
  if (bosses === 0) return "Temple at the end";
  return `${bosses} ${bosses === 1 ? "boss" : "bosses"}, then the temple`;
}

function buildMuster(server: SceneServerInput, ballots: readonly { seatId: string; choice: string | null }[]): TrailPanel {
  const { game: view, roomSeats } = server;
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  const yourBallot = ballots.find((b) => b.seatId === view.yourSeatId);
  const characters = Object.values(CHARACTER_DISPLAY).map((c): CharacterCard => {
    const holder = view.seats.find((s) => s.characterId === c.id);
    const yours = holder !== undefined && holder.seatId === view.yourSeatId;
    const takenBy = holder === undefined ? null : yours ? "You" : (roomSeats.find((r) => r.seatId === holder.seatId)?.displayLabel ?? "?");
    const power = SOURCE_DISPLAY[c.id];
    return {
      characterId: c.id,
      objectId: draftObjectId(c.id),
      name: c.name,
      theme: c.theme,
      power: { sourceId: c.id, name: c.power, text: power?.text ?? "", badges: sourceBadges(c.id) },
      pool: c.pool === null ? null : `${c.pool.name}: start ${c.pool.start}, max ${c.pool.max}`,
      takenBy,
      yours,
      pickable: holder === undefined && you !== undefined && you.characterId === null,
    };
  });
  const lengths = Object.values(RUN_LENGTH_DISPLAY).map((length): LengthOption => {
    const bossAt = new Map(length.bossCamps.map((b) => [b.at, b.tier]));
    return {
      id: length.id,
      objectId: lengthObjectId(length.id),
      name: length.name,
      camps: `${length.camps} camps`,
      stops: Array.from({ length: length.camps }, (_, i): StopKind => {
        const tier = bossAt.get(i + 1);
        return tier === undefined ? "camp" : tier === "temple" ? "temple" : "boss";
      }),
      summary: lengthSummary(length.bossCamps),
      voters: votersFor(server, ballots, length.id),
      yours: yourBallot?.choice === length.id,
      votable: you !== undefined,
    };
  });
  const crew = orderedSeats(view).map((seat): MusterCrewRow => {
    const voted = ballots.some((b) => b.seatId === seat.seatId);
    return {
      seatId: seat.seatId,
      name: roomSeats.find((r) => r.seatId === seat.seatId)?.displayLabel ?? "?",
      isYou: seat.seatId === view.yourSeatId,
      connected: roomSeats.find((r) => r.seatId === seat.seatId)?.connected ?? false,
      status: seat.characterId === null ? "choosing" : voted ? "ready" : "voting",
    };
  });
  return { kind: "muster", characters, lengths, crew, votes: `${ballots.length} of ${view.seats.length} voted` };
}

function bundleFor(itemIds: readonly string[], bundle: number): DraftBundle {
  return {
    bundle,
    itemIds: [...itemIds],
    sourceId: itemIds[0] ?? "",
    objectId: bundleObjectId(bundle),
    name: itemIds.map(sourceName).join(" + "),
    ribbon: `Bundle ${bundle + 1}`,
    text: itemIds.map((id) => SOURCE_DISPLAY[id]?.text ?? "").join(" "),
    badges: itemIds.map((id) => `${sourceName(id)}: ${SOURCE_DISPLAY[id]?.item?.uses ?? "Always"}`),
  };
}

function buildDraft(view: View, yourOffer: { bundles: string[][] } | null): DraftPanel {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return { kind: "none", text: "The crew is choosing" };
  if (yourOffer !== null) return { kind: "offer", bundles: yourOffer.bundles.map(bundleFor) };
  // Instances mint in order, so the newest is the last one taken.
  const taken = [...you.items.equipped, ...(you.items.backpack ?? [])].sort((a, b) => Number(a.uid.slice(2)) - Number(b.uid.slice(2))).at(-1);
  return taken === undefined ? { kind: "none", text: "Nothing left to take" } : { kind: "taken", sourceId: taken.itemId, name: sourceName(taken.itemId) };
}

function buildRoutes(server: SceneServerInput, stage: Extract<View["stage"], { tag: "route" }>): RouteCard[] {
  const view = server.game;
  const yourBallot = stage.ballots.find((b) => b.seatId === view.yourSeatId);
  return stage.options.map((option) => ({
    id: option.id,
    objectId: routeObjectId(option.id),
    label: `Route ${option.id.toUpperCase()}`,
    next: campPreview(view, option.next),
    voters: votersFor(server, stage.ballots, option.id),
    yours: yourBallot?.choice === option.id,
    votable: view.yourSeatId !== null && view.seats.some((s) => s.seatId === view.yourSeatId),
  }));
}

function buildPanel(server: SceneServerInput): TrailPanel {
  const view = server.game;
  const stage = view.stage;
  switch (stage.tag) {
    case "muster":
      return buildMuster(server, stage.ballots);
    case "draft":
      return { kind: "draft", heading: `Camp ${stage.cleared} cleared: +${stage.payout} coins`, draft: buildDraft(view, stage.yourOffer) };
    case "route":
      return { kind: "route", options: buildRoutes(server, stage) };
    case "event": {
      const event = EVENT_DISPLAY[stage.event];
      return { kind: "event", name: event?.name ?? modName(stage.event), text: event?.text ?? "", next: campPreview(view, stage.next) };
    }
    case "loadout":
    case "camp":
      return { kind: "loadout", next: campPreview(view, stage.camp) };
    case "ended":
      return { kind: "draft", heading: "", draft: { kind: "none", text: "" } };
  }
}

function orderedSeats(view: View): View["seats"] {
  const ids = view.seats.map((s) => s.seatId);
  const youAt = view.yourSeatId === null ? -1 : ids.indexOf(view.yourSeatId);
  return youAt <= 0 ? view.seats : [...view.seats.slice(youAt), ...view.seats.slice(0, youAt)];
}

function crewStatus(view: View, seatId: string): CrewRow["status"] {
  const stage = view.stage;
  switch (stage.tag) {
    case "draft":
      return stage.pendingSeatIds.includes(seatId) ? "drafting" : "ready";
    case "route":
    case "muster":
      return stage.ballots.some((b) => b.seatId === seatId) ? "voted" : "voting";
    case "loadout":
    case "event":
      return stage.readySeatIds.includes(seatId) ? "ready" : "waiting";
    case "camp":
    case "ended":
      return "ready";
  }
}

function buildCrew(server: SceneServerInput): CrewRow[] {
  const { game: view, roomSeats } = server;
  return orderedSeats(view).map((seat) => {
    const room = roomSeats.find((r) => r.seatId === seat.seatId);
    return {
      seatId: seat.seatId,
      displayLabel: room?.displayLabel ?? "?",
      isYou: seat.seatId === view.yourSeatId,
      connected: room?.connected ?? false,
      status: crewStatus(view, seat.seatId),
      character: seat.characterId === null ? null : characterName(seat.characterId),
      sources: liveSourceKeys(seat).map((sourceKey) => {
        const sourceId = sourceIdOfKey(seat, sourceKey);
        return { sourceKey, sourceId, name: sourceName(sourceId) };
      }),
    };
  });
}

function buildKit(view: View): KitItem[] | null {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return null;
  return liveSourceKeys(you).map((sourceKey) => {
    const sourceId = sourceIdOfKey(you, sourceKey);
    return {
      sourceKey,
      sourceId,
      objectId: kitObjectId(sourceKey),
      name: sourceName(sourceId),
      kind: sourceKind(sourceId),
      charge: chargeText(sourceId, you.usage.find((u) => u.sourceKey === sourceKey)?.remaining ?? null),
    };
  });
}

function buildReady(view: View): TrailModel["ready"] {
  const stage = view.stage;
  if (view.yourSeatId === null || !view.seats.some((s) => s.seatId === view.yourSeatId)) return null;
  if (stage.tag !== "loadout" && stage.tag !== "event") return null;
  return { objectId: READY_ID, label: stage.tag === "loadout" ? "Set out" : "Continue", state: stage.readySeatIds.includes(view.yourSeatId) ? "done" : "open" };
}

function buildStatus(view: View): string | null {
  const stage = view.stage;
  if (stage.tag === "route") return `${stage.ballots.length} of ${view.seats.length} voted`;
  if (stage.tag === "draft") return stage.pendingSeatIds.length === 0 ? null : `${stage.pendingSeatIds.length} still choosing`;
  return null;
}

function choiceLabel(topic: "length" | "route", choice: string): string {
  if (topic === "route") return `Route ${choice.toUpperCase()}`;
  return RUN_LENGTH_DISPLAY[choice as keyof typeof RUN_LENGTH_DISPLAY]?.name ?? choice;
}

/** A route's letter, or a length's camp count, since Short and Standard
 * share a first letter. */
function choiceGlyph(topic: "length" | "route", choice: string): string {
  if (topic === "route") return choice.toUpperCase();
  return String(RUN_LENGTH_DISPLAY[choice as keyof typeof RUN_LENGTH_DISPLAY]?.camps ?? choice.charAt(0));
}

/** The route vote on the event that follows it; the length vote on camp 1's
 * first loadout. */
function buildVote(view: View): VoteResult | null {
  const vote = view.lastVote;
  if (vote === null) return null;
  const stage = view.stage;
  const showsRoute = vote.topic === "route" && stage.tag === "event";
  const showsLength = vote.topic === "length" && stage.tag === "loadout" && view.history.length === 0;
  if (!showsRoute && !showsLength) return null;
  const label = (choice: string) => choiceLabel(vote.topic, choice);
  return {
    key: `${vote.topic}:${focusCampIndex(view) ?? 0}`,
    title: vote.topic === "length" ? "Run length" : "Route",
    winner: label(vote.winner),
    tally: vote.tally.map((t) => ({ label: label(t.choice), votes: t.votes, winner: t.choice === vote.winner })),
    flip:
      vote.tied === null
        ? null
        : {
            faces: vote.tied.map((choice) => ({ label: label(choice), glyph: choiceGlyph(vote.topic, choice) })),
            winner: { label: label(vote.winner), glyph: choiceGlyph(vote.topic, vote.winner) },
          },
  };
}

function buildTooltip(view: View, ui: LocalUiState): Tooltip | null {
  if (ui.tooltipSourceId === null) return null;
  const rules = sourceRulesText(sourceIdOfKey(view.seats.find((s) => s.seatId === view.yourSeatId), ui.tooltipSourceId));
  return rules === null ? null : { ...rules, reason: null };
}

export function buildTrailModel(server: SceneServerInput, ui: LocalUiState, reconnecting = false): TrailModel {
  const { game: view, roomSeats } = server;
  return {
    sceneKey: "trail",
    topBar: buildTopBar(view),
    prompt: buildTrailPrompt(view, roomSeats, { reconnecting }),
    trail: buildTrail(view),
    panel: buildPanel(server),
    kit: buildKit(view),
    crew: buildCrew(server),
    ready: buildReady(view),
    status: buildStatus(view),
    vote: buildVote(view),
    tooltip: buildTooltip(view, ui),
  };
}
