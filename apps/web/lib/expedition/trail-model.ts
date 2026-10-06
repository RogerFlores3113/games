import type { ExpeditionCampPreviewView, ExpeditionView } from "@games/rules";
import { CHARACTER_DISPLAY, EVENT_DISPLAY, RUN_LENGTH_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import type { Prompt } from "./build-prompt";
import { buildTrailPrompt, PROMPT_MAX_CHARS } from "./build-prompt";
import type { SceneServerInput, Tooltip, TopBar } from "./build-scene-model";
import { buildTopBar } from "./build-scene-model";
import { characterName, liveRulesText, ownPickOf, usesLabel, type UsesLabel, liveSourceKeys, sourceBadges, sourceIdOfKey, sourceKind, sourceName, yourSourceId, type SourceKind } from "./source-text";
import { barSlotObjectId, bundleItemObjectId, bundleObjectId, crewObjectId, draftObjectId, kitObjectId, lengthObjectId, powerObjectId, previewObjectiveObjectId, READY_ID, rerollObjectId, routeObjectId } from "./expedition-ids";
import { buildShop, type ShopPanel } from "./loadout-model";
import { buildInventory, roomFor, type Inventory, type InventoryItem } from "./inventory-model";
import { buildKitBar, type KitBar } from "./kit-bar-model";
import { choiceFor, currentStep, isPicked, type LocalUiState, type PickEntity } from "./local-ui";
import { cardLabel } from "./expedition-ids";
import { bossLabel, focusCampIndex, modName, plannedBossAt } from "./view-access";
import { buildTrail, type StopKind, type TrailStop } from "./trail-stops";

export type { StopKind, TrailStop } from "./trail-stops";
import { campBackdrop, modDisplayName } from "./weather-model";
import { wrapWords } from "../../components/expedition/phaser/draw/text-fit";

/**
 * The trail before, between and after the camps: the muster with its
 * length vote, the draft, the route vote, the event and the loadout. A pure
 * display transform of the view; the worker decides whether a pick or vote
 * is legal.
 */

/** One item of a draft bundle. */
export interface BundleItem {
  itemId: string;
  /** Hovered for the item's full rules. */
  objectId: string;
  name: string;
  text: string;
  /** "Single use", "Once per camp", "2 charges", "Always on". */
  uses: string;
  rare: boolean;
  /** Drafted only by one character (the Pack Rat's own items). */
  exclusive: boolean;
}

/** One bundle of a draft offer: its items arrive together. */
export interface DraftBundle {
  bundle: number;
  itemIds: string[];
  /** The first item. */
  sourceId: string;
  /** The bundle's Take button. */
  objectId: string;
  /** "Bait + Parrot". */
  name: string;
  items: BundleItem[];
}

/** One of the characters at muster. */
export interface CharacterCard {
  characterId: string;
  objectId: string;
  name: string;
  theme: string;
  power: { sourceId: string; name: string; text: string; badges: string[] };
  /** The base power's further abilities (the Cartographer's Redraw). */
  more: { sourceId: string; name: string; text: string; badges: string[] }[];
  /** The teammate who took it; "You" for your own pick. */
  takenBy: string | null;
  yours: boolean;
  pickable: boolean;
}

/** One line of a muster card under the power's name. */
export interface MusterLine {
  text: string;
  tone: "rules" | "power" | "badge";
}

/** A muster card's rules, wrapped to `chars`: the power's text, each
 * further power as its name then its text, then the power's badges while
 * there is room for them. */
export function musterLines(card: CharacterCard, chars: number, room: number): MusterLine[] {
  const lines: MusterLine[] = wrapWords(card.power.text, chars).map((text) => ({ text, tone: "rules" }));
  for (const more of card.more) {
    lines.push(...wrapWords(`${more.name}: ${more.text}`, chars).map((text, i) => ({ text, tone: i === 0 ? ("power" as const) : ("rules" as const) })));
  }
  const badges = wrapWords(card.power.badges.join(", "), chars).map((text) => ({ text, tone: "badge" as const }));
  return lines.length + badges.length <= room ? [...lines, ...badges] : lines;
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
  /** "Temple at the end", "1 boss, then temple". */
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
  /** "ready": an explorer and a length chosen, not yet locked in. */
  status: "choosing" | "ready" | "locked";
}

/** An objective a camp will deal, as a small card with a glyph: `?` win a
 * card, `1`-`5` win in that order, `L` win in the last trick, `#` an exact
 * trick count, `0` no tricks. `key` finds its plain words. */
export interface ObjectiveIcon {
  glyph: string;
  key: string;
  objectId: string;
}

/** Each objective icon's glyph and plain words, by its key. `A`-`E` (a
 * second ordered track) and `>` / `<` (more or fewer tricks) are reserved
 * for kinds the catalogue does not deal yet. */
const OBJECTIVE_WORDS: Readonly<Record<string, { glyph: string; title: string; text: string }>> = {
  "win-card": { glyph: "?", title: "Win a card", text: "The deal names a card. Someone in the crew must win it in a trick." },
  "ordered:last": { glyph: "L", title: "Win it last", text: "The deal names a card. It must be won in the camp's final trick." },
  "trick-count": { glyph: "#", title: "A trick count", text: "The deal makes this win no tricks, or an exact number of tricks." },
  "exactly-n": { glyph: "#", title: "Exact tricks", text: "Whoever takes it must win exactly the number of tricks it names." },
  "no-tricks": { glyph: "0", title: "No tricks", text: "Whoever takes it must win no tricks at all." },
  "more-tricks": { glyph: ">", title: "More tricks", text: "Whoever takes it must win more tricks than the number it names." },
  "fewer-tricks": { glyph: "<", title: "Fewer tricks", text: "Whoever takes it must win fewer tricks than the number it names." },
};

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th"];

/** An objective icon's glyph and plain words, or null for a key no icon has. */
export function objectiveWords(key: string): { glyph: string; title: string; text: string } | null {
  const [kind, place] = key.split(":");
  const n = Number(place);
  if (kind === "ordered" && Number.isInteger(n) && n >= 1) {
    const ordinal = ORDINAL[n - 1] ?? `#${n}`;
    return { glyph: String(n), title: `Win in order: ${ordinal}`, text: `The deal names a card. Win it ${ordinal} among the ordered cards, before any numbered after it.` };
  }
  if (kind === "track-b" && Number.isInteger(n) && n >= 1 && n <= 5) {
    const letter = "ABCDE"[n - 1]!;
    return { glyph: letter, title: `Second order: ${letter}`, text: `A second ordered track: win this card ${ORDINAL[n - 1]} of the lettered cards.` };
  }
  return OBJECTIVE_WORDS[key] ?? null;
}

/** Every objective icon the panel shows, for the scene to find the one under
 * the pointer. */
export function previewObjectiveIcons(panel: TrailPanel): ObjectiveIcon[] {
  switch (panel.kind) {
    case "loadout":
      return panel.next.objectives;
    case "shop":
      return panel.next?.objectives ?? [];
    case "route":
      return panel.options.flatMap((option) => option.next.objectives);
    default:
      return [];
  }
}

/** A camp as a route card or the loadout shows it. */
export interface CampPreview {
  title: string;
  /** A boss camp: the shop opens before it. */
  shop: boolean;
  location: string;
  weather: string;
  /** The location's and the weather's ids, for their icons. */
  locationId: string;
  /** What the backdrop shows: the location, or the temple. */
  backdrop: string;
  weatherId: string;
  /** What the location and weather make together; null for none. */
  pairing: string | null;
  /** One icon per objective the camp deals. */
  objectives: ObjectiveIcon[];
  /** "Animal boss", "The Temple"; null for a plain camp. */
  boss: string | null;
  /** The boss's tier, public from the plan before the boss is revealed. */
  bossTier: Exclude<StopKind, "camp"> | null;
  /** The boss's id and name once a route preview has revealed it; null at
   * the temple, which `boss` already names. */
  bossId: string | null;
  bossName: string | null;
  /** The objectives its next deal holds, for a seat that surveys ("7♠",
   * "Exactly 2"); null otherwise. */
  survey: string[] | null;
}

export interface RouteCard {
  id: string;
  objectId: string;
  label: string;
  next: CampPreview;
  voters: string[];
  yours: boolean;
  votable: boolean;
  /** "Another boss at camp 3": this route leads to a different boss than
   * the plan's (the Cartographer's third route); null otherwise. */
  swapsBoss: string | null;
  /** The Cartographer's reroll of this route, while you can afford it. */
  reroll: { objectId: string; choiceId: string; label: string } | null;
}

/** A power you can use between camps, as a button. `active` while you are
 * picking its targets. */
export interface PowerButton {
  sourceKey: string;
  objectId: string;
  label: string;
  active: boolean;
}

/** The vote that just resolved, with the coin flip that settled a tie. */
export interface VoteResult {
  /** Unique per vote, so the flip plays once however often the scene redraws. */
  key: string;
  /** "Run length" or "Route". */
  title: string;
  winner: string;
  /** Each face is a tied choice and the glyph its side of the coin shows. */
  flip: { faces: { label: string; glyph: string }[]; winner: { label: string; glyph: string } } | null;
}

export type DraftPanel =
  /** `ownPick`: the character whose own items these are (the Pack Rat's
   * pick after the draft), else null. `fits`: your backpack has room for a
   * bundle; else each Take opens it. */
  | { kind: "offer"; bundles: DraftBundle[]; ownPick: string | null; fits: boolean }
  /** What you took, as the bundle's items; after a refresh, the newest item. */
  | { kind: "taken"; items: { sourceId: string; name: string }[] }
  | { kind: "none"; text: string };

export type TrailPanel =
  /** `locked`: "1 of 3 locked in". */
  | { kind: "muster"; characters: CharacterCard[]; lengths: LengthOption[]; crew: MusterCrewRow[]; locked: string }
  | { kind: "draft"; draft: DraftPanel }
  | { kind: "route"; options: RouteCard[] }
  /** `nextTitle`: "Camp 2 of 6", the camp the event comes before. */
  | { kind: "event"; name: string; text: string; nextTitle: string }
  /** The shop before a boss camp. `next` previews the camp only on a
   * replay; on the way there its route is not voted yet. */
  | { kind: "shop"; next: CampPreview | null; shop: ShopPanel }
  /** The loadout: the camp it sets out for. */
  | { kind: "loadout"; next: CampPreview };

/** The bar under the trail: your item slots and the backpack that opens
 * the inventory window. */
export interface ItemBar {
  slots: { objectId: string; item: InventoryItem | null }[];
  /** "1 of 2". */
  count: string;
  backpack: { stored: number; capacity: number };
}

/** One of your live sources: `sourceKey` is what you act through, and
 * `sourceId` the def it names. */
export interface KitItem {
  sourceKey: string;
  sourceId: string;
  objectId: string;
  name: string;
  kind: SourceKind;
  /** What is left. */
  charge: UsesLabel;
}

export interface CrewRow {
  seatId: string;
  objectId: string;
  /** A choice of the power you are aiming (Quartermaster's teammate). */
  targetable: boolean;
  displayLabel: string;
  isYou: boolean;
  connected: boolean;
  status: "ready" | "waiting" | "drafting" | "voted" | "voting";
  /** "The Explorer", or null while still choosing. */
  character: string | null;
  sources: { sourceKey: string; sourceId: string; name: string }[];
  /** Heavy fog hides the items this teammate took. */
  itemsHidden: boolean;
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
  /** Null for a spectator. */
  itemBar: ItemBar | null;
  /** Your kit on the left; null for a spectator and at the muster. */
  kitBar: KitBar | null;
  inventory: Inventory | null;
  crew: CrewRow[];
  /** The muster's Lock in, the loadout's Set out or the event's Continue;
   * null otherwise or for a spectator. Lock in is "disabled" until you have
   * an explorer and a length. */
  ready: { objectId: string; label: string; state: "open" | "done" | "disabled" } | null;
  /** Shown where Ready goes when there is no button: "2 of 3 voted". */
  status: string | null;
  vote: VoteResult | null;
  tooltip: Tooltip | null;
  /** The powers you can use now, between camps. */
  powers: PowerButton[];
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

/** The cards to win, then the ordered ones numbered in turn, then the
 * trick counts. */
function objectiveIcons(slotKinds: readonly string[], owner: string): ObjectiveIcon[] {
  const rank = (kind: string) => (kind === "win-card" ? 0 : kind === "ordered" ? 1 : 2);
  let ordered = 0;
  return [...slotKinds]
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((kind, i) => {
      const key = kind === "ordered" ? `ordered:${++ordered}` : kind;
      const words = objectiveWords(key);
      return words === null ? [] : [{ glyph: words.glyph, key, objectId: previewObjectiveObjectId(owner, i) }];
    });
}

/** `owner` names the preview for its icons' ids: `loadout`, `shop`, or a route id. */
export function campPreview(view: View, camp: ExpeditionCampPreviewView, owner = "loadout"): CampPreview {
  const backdrop = campBackdrop(camp);
  const bossId = backdrop === camp.bossId ? null : camp.bossId;
  return {
    title: view.campCount === null ? `Camp ${camp.index}` : `Camp ${camp.index} of ${view.campCount}`,
    shop: camp.shop,
    location: modDisplayName(camp.location),
    weather: modDisplayName(camp.weather),
    locationId: camp.location,
    backdrop,
    weatherId: camp.weather,
    pairing: camp.pairing === null ? null : modDisplayName(camp.pairing),
    objectives: objectiveIcons(camp.slotKinds, owner),
    boss: bossLabel(view, camp.index),
    bossTier: plannedBossAt(view, camp.index)?.tier ?? null,
    bossId,
    bossName: bossId === null ? null : modDisplayName(bossId),
    survey: camp.survey === null ? null : camp.survey.map(surveyLabel),
  };
}

function surveyLabel(objective: NonNullable<ExpeditionCampPreviewView["survey"]>[number]): string {
  switch (objective.kind) {
    case "win-card":
      return cardLabel(objective.target);
    case "ordered":
      return `${objective.order === "last" ? "Last" : `#${objective.order}`} ${cardLabel(objective.target)}`;
    case "no-tricks":
      return "No tricks";
    case "exactly-n":
      return `Exactly ${objective.n}`;
    case "hidden":
      return "Hidden";
  }
}

function lengthSummary(bossCamps: readonly { tier: string }[]): string {
  const bosses = bossCamps.filter((b) => b.tier !== "temple").length;
  if (bosses === 0) return "Temple at the end";
  return `${bosses} ${bosses === 1 ? "boss" : "bosses"}, then temple`;
}

function buildMuster(server: SceneServerInput, stage: Extract<View["stage"], { tag: "muster" }>): TrailPanel {
  const { game: view, roomSeats } = server;
  const { ballots, lockedSeatIds } = stage;
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  const yourBallot = ballots.find((b) => b.seatId === view.yourSeatId);
  const choosing = you !== undefined && !lockedSeatIds.includes(you.seatId);
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
      more: c.powerIds.map((id) => ({ sourceId: id, name: SOURCE_DISPLAY[id]?.name ?? id, text: SOURCE_DISPLAY[id]?.text ?? "", badges: sourceBadges(id) })),
      takenBy,
      yours,
      pickable: holder === undefined && choosing,
    };
  });
  const lengths = Object.values(RUN_LENGTH_DISPLAY).map((length): LengthOption => {
    const bossAt = new Map(length.bossCamps.map((b) => [b.at, b.tier]));
    return {
      id: length.id,
      objectId: lengthObjectId(length.id),
      name: length.name,
      camps: `${length.camps} camps`,
      stops: Array.from({ length: length.camps }, (_, i): StopKind => bossAt.get(i + 1) ?? "camp"),
      summary: lengthSummary(length.bossCamps),
      voters: votersFor(server, ballots, length.id),
      yours: yourBallot?.choice === length.id,
      votable: choosing,
    };
  });
  const crew = orderedSeats(view).map((seat): MusterCrewRow => {
    const voted = ballots.some((b) => b.seatId === seat.seatId);
    return {
      seatId: seat.seatId,
      name: roomSeats.find((r) => r.seatId === seat.seatId)?.displayLabel ?? "?",
      isYou: seat.seatId === view.yourSeatId,
      connected: roomSeats.find((r) => r.seatId === seat.seatId)?.connected ?? false,
      status: lockedSeatIds.includes(seat.seatId) ? "locked" : seat.characterId !== null && voted ? "ready" : "choosing",
    };
  });
  return { kind: "muster", characters, lengths, crew, locked: `${lockedSeatIds.length} of ${view.seats.length} locked in` };
}

function bundleFor(itemIds: readonly string[], bundle: number): DraftBundle {
  return {
    bundle,
    itemIds: [...itemIds],
    sourceId: itemIds[0] ?? "",
    objectId: bundleObjectId(bundle),
    name: itemIds.map(sourceName).join(" + "),
    items: itemIds.map((itemId, i) => {
      const display = SOURCE_DISPLAY[itemId];
      return {
        itemId,
        objectId: bundleItemObjectId(bundle, i),
        name: sourceName(itemId),
        text: display?.text ?? "",
        uses: display?.item?.uses ?? "Always on",
        rare: display?.item?.rarity === "rare",
        exclusive: (display?.item?.exclusiveTo ?? null) !== null,
      };
    }),
  };
}

function buildDraft(view: View, yourOffer: { bundles: string[][] } | null, taken: readonly string[] | null, inventory: Inventory | null): DraftPanel {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return { kind: "none", text: "The crew is choosing" };
  if (yourOffer !== null) {
    const size = Math.max(0, ...yourOffer.bundles.map((b) => b.length));
    return { kind: "offer", bundles: yourOffer.bundles.map(bundleFor), ownPick: ownPickOf(yourOffer.bundles), fits: inventory === null || roomFor(inventory) >= size };
  }
  if (taken !== null && taken.length > 0) return { kind: "taken", items: taken.map((sourceId) => ({ sourceId, name: sourceName(sourceId) })) };
  // Instances mint in order, so the newest is the last one taken.
  const newest = [...you.items.equipped, ...(you.items.backpack ?? [])].sort((a, b) => Number(a.uid.slice(2)) - Number(b.uid.slice(2))).at(-1);
  return newest === undefined ? { kind: "none", text: "Nothing left to take" } : { kind: "taken", items: [{ sourceId: newest.itemId, name: sourceName(newest.itemId) }] };
}

/** Abilities whose one target is a route option: they ride on the route
 * cards as a Reroll button rather than in the power row. */
function rerollAbility(view: View): { sourceKey: string; choices: string[]; label: string } | null {
  const ability = view.yourAbilities.find((a) => a.usableNow && a.steps.length === 1 && a.steps[0]!.kind === "route-option");
  if (ability === undefined) return null;
  const sourceId = yourSourceId(view, ability.sourceKey);
  const badge = SOURCE_DISPLAY[sourceId]?.active?.limitBadge ?? "";
  return { sourceKey: ability.sourceKey, choices: ability.steps[0]!.choices, label: badge === "" ? "Reroll" : `Reroll, ${badge}` };
}

/** Names the boss camp a boss swap changes: the next animal or disaster one. */
function swapLabel(view: View, from: number): string {
  const at = view.plan.find((b) => b.at >= from && (b.tier === "animal" || b.tier === "disaster"))?.at;
  return at === undefined ? "Another boss ahead" : `Another boss at camp ${at}`;
}

function buildRoutes(server: SceneServerInput, stage: Extract<View["stage"], { tag: "route" }>): RouteCard[] {
  const view = server.game;
  const yourBallot = stage.ballots.find((b) => b.seatId === view.yourSeatId);
  const reroll = rerollAbility(view);
  return stage.options.map((option) => {
    const choiceId = `route:${option.id}`;
    return {
      id: option.id,
      objectId: routeObjectId(option.id),
      label: `Route ${option.id.toUpperCase()}`,
      next: campPreview(view, option.next, option.id),
      voters: votersFor(server, stage.ballots, option.id),
      yours: yourBallot?.choice === option.id,
      votable: view.yourSeatId !== null && view.seats.some((s) => s.seatId === view.yourSeatId),
      swapsBoss: option.swapsBoss ? swapLabel(view, option.next.index) : null,
      reroll: reroll !== null && reroll.choices.includes(choiceId) ? { objectId: rerollObjectId(option.id), choiceId, label: reroll.label } : null,
    };
  });
}

/** What a power's button says: the base power's name, or its action where
 * the name alone would not say it. */
const POWER_ACTION: Readonly<Record<string, string>> = { businessman: "Sell an item" };

function buildPowers(view: View, ui: LocalUiState): PowerButton[] {
  const stage = view.stage.tag;
  if (stage !== "shop" && stage !== "loadout" && stage !== "draft" && stage !== "route") return [];
  const reroll = rerollAbility(view);
  return view.yourAbilities
    .filter((a) => a.usableNow && a.sourceKey !== reroll?.sourceKey)
    .map((a) => {
      const sourceId = yourSourceId(view, a.sourceKey);
      return {
        sourceKey: a.sourceKey,
        objectId: powerObjectId(a.sourceKey),
        label: POWER_ACTION[sourceId] ?? sourceName(sourceId),
        active: ui.targeting?.mode === "ability" && ui.targeting.sourceKey === a.sourceKey,
      };
    });
}

/** While a power is aimed: what to pick next. */
function aimPrompt(view: View, ui: LocalUiState): Prompt | null {
  const step = currentStep(ui, view);
  if (step === null || ui.targeting?.mode !== "ability") return null;
  const sourceId = yourSourceId(view, ui.targeting.sourceKey);
  const full = `${POWER_ACTION[sourceId] ?? sourceName(sourceId)}: ${step.prompt}`;
  return { text: full.length <= PROMPT_MAX_CHARS ? full : step.prompt, tone: "your-move" };
}

function pickOf(ui: LocalUiState, view: View, entity: PickEntity, rawId: string): boolean {
  return choiceFor(ui, view, entity, rawId) !== null && !isPicked(ui, entity, rawId);
}

function campTitle(view: View, index: number): string {
  return view.campCount === null ? `Camp ${index}` : `Camp ${index} of ${view.campCount}`;
}

/** The shop before a boss camp, and the camp it leads to on a replay. */
function buildShopPanel(server: SceneServerInput, stage: Extract<View["stage"], { tag: "shop" }>, inventory: Inventory | null): TrailPanel {
  const view = server.game;
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  const ready = you !== undefined && stage.readySeatIds.includes(you.seatId);
  return {
    kind: "shop",
    next: stage.camp === null ? null : campPreview(view, stage.camp, "shop"),
    shop: buildShop({
      shop: stage.shop,
      purse: view.purse,
      supplies: view.supplies,
      you,
      ready,
      room: inventory === null ? 0 : roomFor(inventory),
      nameOf: (seatId) => (seatId === view.yourSeatId ? "you" : nameOf(server, seatId)),
    }),
  };
}

function buildPanel(server: SceneServerInput, ui: LocalUiState, inventory: Inventory | null): TrailPanel {
  const view = server.game;
  const stage = view.stage;
  switch (stage.tag) {
    case "muster":
      return buildMuster(server, stage);
    case "draft":
      return { kind: "draft", draft: buildDraft(view, stage.yourOffer, ui.takenBundle, inventory) };
    case "route":
      return { kind: "route", options: buildRoutes(server, stage) };
    case "event": {
      const event = EVENT_DISPLAY[stage.event];
      return { kind: "event", name: event?.name ?? modName(stage.event), text: event?.text ?? "", nextTitle: campTitle(view, stage.next) };
    }
    case "shop":
      return buildShopPanel(server, stage, inventory);
    case "loadout":
    case "camp":
      return { kind: "loadout", next: campPreview(view, stage.camp) };
    case "ended":
      return { kind: "draft", draft: { kind: "none", text: "" } };
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
      return stage.ballots.some((b) => b.seatId === seatId) ? "voted" : "voting";
    case "muster":
      return stage.lockedSeatIds.includes(seatId) ? "ready" : "waiting";
    case "shop":
    case "loadout":
    case "event":
      return stage.readySeatIds.includes(seatId) ? "ready" : "waiting";
    case "camp":
    case "ended":
      return "ready";
  }
}

function buildCrew(server: SceneServerInput, ui: LocalUiState): CrewRow[] {
  const { game: view, roomSeats } = server;
  return orderedSeats(view).map((seat) => {
    const room = roomSeats.find((r) => r.seatId === seat.seatId);
    return {
      seatId: seat.seatId,
      objectId: crewObjectId(seat.seatId),
      targetable: pickOf(ui, view, "seat", seat.seatId),
      displayLabel: room?.displayLabel ?? "?",
      isYou: seat.seatId === view.yourSeatId,
      connected: room?.connected ?? false,
      status: crewStatus(view, seat.seatId),
      character: seat.characterId === null ? null : characterName(seat.characterId),
      sources: liveSourceKeys(seat).map((sourceKey) => {
        const sourceId = sourceIdOfKey(seat, sourceKey);
        return { sourceKey, sourceId, name: sourceName(sourceId) };
      }),
      itemsHidden: seat.seatId !== view.yourSeatId && seat.items.concealed,
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
      charge: usesLabel(sourceId, you.usage.find((u) => u.sourceKey === sourceKey)?.remaining ?? null),
    };
  });
}

function buildItemBar(inventory: Inventory | null): ItemBar | null {
  if (inventory === null) return null;
  return {
    slots: inventory.slots.map((slot, i) => ({ objectId: barSlotObjectId(i), item: slot.item })),
    count: `${inventory.equipped.length} of ${inventory.slots.length}`,
    backpack: { stored: inventory.stored, capacity: inventory.capacity },
  };
}

function buildReady(view: View): TrailModel["ready"] {
  const stage = view.stage;
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (view.yourSeatId === null || you === undefined) return null;
  if (stage.tag === "muster") {
    if (stage.lockedSeatIds.includes(you.seatId)) return { objectId: READY_ID, label: "Locked in", state: "done" };
    const chosen = you.characterId !== null && stage.ballots.some((b) => b.seatId === you.seatId);
    return { objectId: READY_ID, label: "Lock in", state: chosen ? "open" : "disabled" };
  }
  if (stage.tag !== "loadout" && stage.tag !== "event" && stage.tag !== "shop") return null;
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

/** The route vote on the loadout it chose, until that camp is first played;
 * the length vote on camp 1's first loadout. */
function buildVote(view: View): VoteResult | null {
  const vote = view.lastVote;
  if (vote === null) return null;
  const stage = view.stage;
  const showsRoute = vote.topic === "route" && stage.tag === "loadout" && !view.history.some((h) => h.camp === stage.camp.index);
  const showsLength = vote.topic === "length" && stage.tag === "loadout" && view.history.length === 0;
  if (!showsRoute && !showsLength) return null;
  const label = (choice: string) => choiceLabel(vote.topic, choice);
  return {
    key: `${vote.topic}:${focusCampIndex(view) ?? 0}`,
    title: vote.topic === "length" ? "Run length" : "Route",
    winner: label(vote.winner),
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
  if (ui.tooltipPreviewObjective !== null) {
    const words = objectiveWords(ui.tooltipPreviewObjective);
    return words === null ? null : { title: words.title, text: words.text, badges: [], reason: null };
  }
  if (ui.tooltipSourceId === null) return null;
  const rules = liveRulesText(view.seats.find((s) => s.seatId === view.yourSeatId), ui.tooltipSourceId);
  if (rules === null) return null;
  const ability = view.yourAbilities.find((a) => a.sourceKey === ui.tooltipSourceId);
  return { ...rules, reason: ability !== undefined && !ability.usableNow ? ability.reason : null };
}

/** A draft offer your backpack has no room for asks you to make room first. */
function fullPrompt(panel: TrailPanel): Prompt | null {
  return panel.kind === "draft" && panel.draft.kind === "offer" && !panel.draft.fits ? { text: "Your backpack is full. Discard an item to take one", tone: "alert" } : null;
}

export function buildTrailModel(server: SceneServerInput, ui: LocalUiState, reconnecting = false): TrailModel {
  const { game: view, roomSeats } = server;
  const inventory = buildInventory(view, ui);
  const panel = buildPanel(server, ui, inventory);
  const kit = buildKit(view);
  return {
    sceneKey: "trail",
    topBar: buildTopBar(view),
    prompt: aimPrompt(view, ui) ?? (reconnecting ? null : fullPrompt(panel)) ?? buildTrailPrompt(view, roomSeats, { reconnecting }),
    trail: buildTrail(view),
    panel,
    kit,
    itemBar: buildItemBar(inventory),
    kitBar: view.stage.tag === "muster" ? null : buildKitBar(view, ui),
    inventory,
    crew: buildCrew(server, ui),
    ready: buildReady(view),
    status: buildStatus(view),
    vote: buildVote(view),
    tooltip: buildTooltip(view, ui),
    powers: buildPowers(view, ui),
  };
}
