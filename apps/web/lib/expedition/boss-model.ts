import type { ExpeditionModView, ExpeditionStatusPartView, ExpeditionView } from "@games/rules";
import { MOD_DISPLAY } from "@games/rules";
import { SUIT_GLYPH, cardLabel } from "./expedition-ids";
import { sourceName } from "./source-text";
import { modName } from "./view-access";

/**
 * The boss on the table: what its sprite's caption says, the one-line rule
 * under the stump, who it looks at and the marks it leaves on seats. A pure
 * display transform of the boss's status parts; never decides a rule.
 */

/** A mark a boss leaves on one seat: "watched", "streak 2", "bitten 1". */
export interface SeatBossMark {
  label: string;
  alert: boolean;
}

export interface BossModel {
  id: string;
  objectId: string;
  name: string;
  /** Under the sprite: a few words. */
  caption: string;
  /** Under the stump: what the boss does right now, as one sentence. */
  rule: string;
  /** The seat the boss faces this trick (the Crocodile), for its gaze arrow. */
  facingSeatId: string | null;
  /** Something is about to bite: a watched seat, a pounce, a bite. */
  alert: boolean;
  marks: Readonly<Record<string, SeatBossMark>>;
}

/** Names a seat in a rule: "you" for the viewer. */
export interface SeatNamer {
  name(seatId: string): string;
  isYou(seatId: string): boolean;
}

const NAME_CHARS = 10;
/** Captions stay within 15 characters, the boss zone's caption line. */
export const CAPTION_MAX_CHARS = 15;
/** Rules stay within one line of the ticker under the stump. */
export const RULE_MAX_CHARS = 60;
const CAPTION_NAME_CHARS = 6;

export function bossObjectId(modId: string): string {
  return `boss:${modId}`;
}

function shorten(name: string, chars: number): string {
  return name.length <= chars ? name : `${name.slice(0, chars - 1)}.`;
}

type Reading = Omit<BossModel, "id" | "objectId" | "name">;
type Reader = (status: readonly ExpeditionStatusPartView[], seats: SeatNamer, strength: ExpeditionModView["strength"]) => Reading;

function part<K extends ExpeditionStatusPartView["kind"]>(status: readonly ExpeditionStatusPartView[], kind: K): Extract<ExpeditionStatusPartView, { kind: K }> | undefined {
  return status.find((p): p is Extract<ExpeditionStatusPartView, { kind: K }> => p.kind === kind);
}

const calm = (caption: string, rule: string): Reading => ({ caption, rule, facingSeatId: null, alert: false, marks: {} });

/** Each animal boss's reading, keyed by its mod id. */
const READERS: Readonly<Record<string, Reader>> = {
  crocodile: (status, seats) => {
    const facing = part(status, "facing");
    if (facing === undefined) return calm("Resting", "The crocodile rests this trick");
    const you = seats.isYou(facing.seatId);
    const name = seats.name(facing.seatId);
    return {
      caption: `Watching ${you ? "you" : shorten(name, CAPTION_NAME_CHARS)}`,
      rule: you ? "Crocodile: if you win this trick, the camp is lost" : `Crocodile: if ${shorten(name, NAME_CHARS)} wins this trick, the camp is lost`,
      facingSeatId: facing.seatId,
      alert: true,
      marks: { [facing.seatId]: { label: "watched", alert: true } },
    };
  },
  tiger: (status, seats) => {
    const streak = part(status, "streak");
    if (streak === undefined) return calm("On the prowl", "Tiger: win two tricks in a row and you lead a random card");
    const you = seats.isYou(streak.seatId);
    const name = shorten(seats.name(streak.seatId), NAME_CHARS);
    const marks = { [streak.seatId]: { label: `streak ${streak.count}`, alert: streak.count >= 2 } };
    if (streak.count < 2) return { ...calm(`${you ? "You" : shorten(name, CAPTION_NAME_CHARS)}: 1 win`, "Tiger: win two tricks in a row and you lead a random card"), marks };
    return {
      caption: `Pounce: ${you ? "you" : shorten(name, CAPTION_NAME_CHARS)}`,
      rule: you ? `Tiger: you won ${streak.count} in a row, so you lead a random card` : `Tiger: ${name} won ${streak.count} in a row and leads a random card`,
      facingSeatId: null,
      alert: true,
      marks,
    };
  },
  snake: (status, seats) => {
    const bites = status.filter((p): p is Extract<ExpeditionStatusPartView, { kind: "bitten" }> => p.kind === "bitten");
    const first = bites[0];
    if (first === undefined) return calm("Don't whisper", "Snake: whoever whispers is bitten for two tricks");
    const you = seats.isYou(first.seatId);
    const name = shorten(seats.name(first.seatId), NAME_CHARS);
    const span = first.tricksLeft === 1 ? "this trick" : "this trick or next";
    return {
      caption: `Bit ${you ? "you" : shorten(name, CAPTION_NAME_CHARS + 3)}`,
      rule: you ? `Snake: objectives you win ${span} fail` : `Snake: objectives ${name} wins ${span} fail`,
      facingSeatId: null,
      alert: true,
      marks: Object.fromEntries(bites.map((b) => [b.seatId, { label: `bitten ${b.tricksLeft}`, alert: true }])),
    };
  },
  beaver: (status) => {
    const dam = part(status, "dam");
    if (dam === undefined) return calm("Resting", "The beaver rests this trick");
    const glyph = SUIT_GLYPH[dam.suit];
    return calm(`Dam: ${glyph} ${dam.suit}`, `Beaver dams ${glyph}: play another suit if you can`);
  },
  rats: (_status, _seats, strength) =>
    strength === "full" ? calm("-1 item slot", "Rats: everyone has one fewer item slot this camp") : calm("Chewing 2 packs", "Rats: the first two seats have one fewer item slot"),
  capybara: (_status, _seats, strength) =>
    strength === "full" ? calm("+2 objectives", "Capybara: two extra objectives this camp") : calm("+1 objective", "Capybara: one extra objective this camp"),
  tornado: (status) => {
    const countdown = part(status, "countdown");
    if (countdown === undefined) return calm("Calm", "Tornado: no more gusts this camp");
    const what = "each hand passes 3 cards right";
    if (countdown.tricks === 1) return { ...calm("Gust in 1", `Tornado: after this trick, ${what}`), alert: true };
    return calm(`Gust in ${countdown.tricks}`, `Tornado: in ${countdown.tricks} tricks, ${what}`);
  },
  earthquake: (status) => {
    const countdown = part(status, "countdown");
    if (countdown === undefined) return calm("Settled", "Earthquake: the ground has settled");
    const what = "open objectives change hands";
    if (countdown.tricks === 1) return { ...calm("Quake in 1", `Earthquake: after this trick, ${what}`), alert: true };
    return calm(`Quake in ${countdown.tricks}`, `Earthquake: in ${countdown.tricks} tricks, ${what}`);
  },
  wildfire: (status) =>
    resting(status) ? calm("Smouldering", "The wildfire smoulders this trick") : calm("Burns lowest", "Wildfire: the lowest card of this trick burns"),
  meteor: (status) =>
    resting(status) ? calm("Passing by", "The meteor passes this trick") : calm("Vaporizes top", "Meteor: the card that would win this trick is vaporized"),
  "blood-moon": (status) =>
    resting(status)
      ? calm("Moon sets", "Blood Moon: cards count as printed this trick")
      : { ...calm("Moon rises", `Blood Moon: ${SUIT_GLYPH.spades} count as ${SUIT_GLYPH.diamonds} and ${SUIT_GLYPH.clubs} as ${SUIT_GLYPH.hearts} this trick`), alert: true },
  locusts: (status, seats) => {
    if (resting(status)) return calm("Resting", "The locusts rest this trick");
    const swarm = part(status, "swarm");
    if (swarm === undefined) return calm("Swarming", "Locusts: after each trick they eat an item, then cards");
    if (swarm.seatId === null) return { ...calm("Eats 1 per hand", "Locusts: after this trick they eat a card from every hand"), alert: true };
    const you = seats.isYou(swarm.seatId);
    const name = shorten(seats.name(swarm.seatId), NAME_CHARS);
    return {
      caption: `Eats ${you ? "yours" : `${shorten(name, CAPTION_NAME_CHARS)}'s`}`,
      rule: you ? "Locusts: after this trick they eat one of your items" : `Locusts: after this trick they eat an item of ${name}`,
      facingSeatId: null,
      alert: true,
      marks: { [swarm.seatId]: { label: "next meal", alert: true } },
    };
  },
  monsoon: (status) => {
    const meter = part(status, "meter");
    if (meter === undefined) return calm("Raining", "Monsoon: finish every objective before the river floods");
    if (meter.left === 0) return { ...calm("Flooded", "Monsoon: the river has flooded"), alert: true };
    const rule = meter.left === 1 ? "Monsoon: every objective must be done this trick" : `Monsoon: finish every objective in ${meter.left} tricks`;
    return { ...calm(`River: ${meter.left} left`, rule), alert: meter.left <= 1 };
  },
};

/** A half body that acts on alternate tricks is resting on this one. */
function resting(status: readonly ExpeditionStatusPartView[]): boolean {
  return part(status, "alternating")?.activeNow === false;
}

function fallback(mod: ExpeditionModView): Reading {
  const display = MOD_DISPLAY[mod.id];
  return calm(display?.name ?? modName(mod.id), display?.text ?? "");
}

function bossMods(view: ExpeditionView): ExpeditionModView[] {
  const stage = view.stage;
  if (stage.tag !== "camp" && stage.tag !== "loadout") return [];
  return stage.mods.filter((m) => m.kind === "animal" || m.kind === "disaster");
}

function read(mod: ExpeditionModView, seats: SeatNamer): Reading {
  return READERS[mod.id]?.(mod.status, seats, mod.strength) ?? fallback(mod);
}

/** The camp's full-strength boss, or null for a plain camp. */
export function buildBoss(view: ExpeditionView, seats: SeatNamer): BossModel | null {
  const mod = bossMods(view).find((m) => m.strength === "full");
  if (mod === undefined) return null;
  return { id: mod.id, objectId: bossObjectId(mod.id), name: MOD_DISPLAY[mod.id]?.name ?? modName(mod.id), ...read(mod, seats) };
}

/** Names short enough that "<name> (half)" stays within a caption line. */
const HELPER_SHORT_NAME: Readonly<Record<string, string>> = {
  crocodile: "Croc",
  earthquake: "Quake",
  meteor: "Meteor",
  "blood-moon": "Moon",
  locusts: "Locusts",
};

/** The bosses planned earlier in the run, back at the temple at half
 * strength, in the order the run met them. `name` is their caption's
 * first line ("Tiger (half)"); a helper has no gaze arrow and no rule under
 * the stump: its caption and the marks it leaves on seats say what it does. */
export function buildHelpers(view: ExpeditionView, seats: SeatNamer): BossModel[] {
  return bossMods(view)
    .filter((m) => m.strength === "half")
    .map((mod) => {
      const short = HELPER_SHORT_NAME[mod.id] ?? MOD_DISPLAY[mod.id]?.name ?? modName(mod.id);
      return { id: mod.id, objectId: bossObjectId(mod.id), name: `${short} (half)`, ...read(mod, seats), rule: "", facingSeatId: null };
    });
}

/** The mark each seat wears: the boss's, else the first helper's. */
export function seatMarks(boss: BossModel | null, helpers: readonly BossModel[]): Readonly<Record<string, SeatBossMark>> {
  return Object.assign({}, ...[...helpers].reverse().map((h) => h.marks), boss?.marks ?? {});
}

/** Why the boss keeps this card in hand, or null when it does not. */
export function bossBlockReason(view: ExpeditionView, card: { kind: string; suit?: string }, legalCount: number): string | null {
  const stage = view.stage;
  if (stage.tag !== "camp") return null;
  for (const mod of stage.mods) {
    const dam = part(mod.status, "dam");
    if (dam !== undefined && card.kind === "standard" && card.suit === dam.suit) return `The beaver dams ${SUIT_GLYPH[dam.suit]}`;
    const streak = part(mod.status, "streak");
    const camp = stage.attempt.camp;
    if (streak !== undefined && streak.count >= 2 && streak.seatId === view.yourSeatId && camp.currentTrick.plays.length === 0 && legalCount === 1) {
      return "The tiger picked your lead";
    }
  }
  return null;
}

/** Something that happened, said once in a toast: a disaster's gust, quake
 * or locust meal, or a whisper the weather washed away. `key` is unique per
 * attempt and log entry. */
export interface BossHappening {
  key: string;
  kind: "gust" | "quake" | "ate-item" | "ate-cards" | "washed";
  text: string;
  /** Cards it moved or ate, as labels: your sent cards, the eaten ones. */
  cards: string[];
}

/** The cards the latest gust took from your hand, and who got them. */
export interface Gust {
  key: string;
  cards: { cardId: string; label: string }[];
  toSeatId: string;
}

const ATE_ITEM = "ate-item:";

function attemptKey(view: ExpeditionView): string | null {
  const stage = view.stage;
  return stage.tag === "camp" ? `${stage.camp.index}:${stage.attempt.attemptNumber}` : null;
}

/** The seat on your right, who a gust passes your cards to: the previous
 * seat in turn order. */
export function rightOf(view: ExpeditionView, seatId: string): string {
  const ids = view.seats.map((s) => s.seatId);
  const i = ids.indexOf(seatId);
  return ids[(i - 1 + ids.length) % ids.length] ?? seatId;
}

/** Every gust passes up to 3 cards a hand, and a gust never passes more
 * than the one before it, so the latest gust's cards are the reveals left
 * after 3 for each earlier gust. */
const GUST_CARDS = 3;

export function latestGust(view: ExpeditionView): Gust | null {
  const stage = view.stage;
  const you = view.yourSeatId;
  if (stage.tag !== "camp" || you === null) return null;
  const log = stage.attempt.log;
  const at = log.map((entry, i) => ({ entry, i })).filter(({ entry }) => entry.event === "gust");
  const last = at.at(-1);
  if (last === undefined) return null;
  const sent = stage.attempt.reveals.filter((r) => r.source === "tornado" && r.fromSeatId === you);
  const count = Math.min(GUST_CARDS, Math.max(0, sent.length - GUST_CARDS * (at.length - 1)));
  return {
    key: `${attemptKey(view)}:${last.i}`,
    cards: sent.slice(sent.length - count).map((r) => ({ cardId: r.cardId, label: cardLabel(r.identity) })),
    toSeatId: rightOf(view, you),
  };
}

/** The attempt's disaster happenings in order. */
export function bossHappenings(view: ExpeditionView, seats: SeatNamer): BossHappening[] {
  const stage = view.stage;
  if (stage.tag !== "camp") return [];
  const base = attemptKey(view);
  const gust = latestGust(view);
  const meals = [...new Set(stage.attempt.camp.discards.map((d) => d.afterTrick))].sort((a, b) => a - b);
  let eaten = 0;
  return stage.attempt.log.flatMap((entry, i): BossHappening[] => {
    const key = `${base}:${i}`;
    if (entry.event === "gust") {
      const mine = gust?.key === key ? gust : null;
      const text = mine === null || mine.cards.length === 0 ? "A gust passed 3 cards from every hand right" : `A gust sent your ${mine.cards.map((c) => c.label).join(" ")} to ${seats.name(mine.toSeatId)}`;
      return [{ key, kind: "gust", text, cards: mine?.cards.map((c) => c.label) ?? [] }];
    }
    if (entry.event === "quake") return [{ key, kind: "quake", text: "The earthquake shook the open objectives to new owners", cards: [] }];
    if (entry.event.startsWith(ATE_ITEM)) {
      const seatId = entry.subjectSeatIds[0];
      const item = sourceName(entry.event.slice(ATE_ITEM.length));
      const whose = seatId === undefined ? "a" : seats.isYou(seatId) ? "your" : `${seats.name(seatId)}'s`;
      return [{ key, kind: "ate-item", text: `Locusts ate ${whose} ${item}`, cards: [] }];
    }
    if (entry.event === "ate-cards") {
      const after = meals[eaten++];
      const cards = stage.attempt.camp.discards.filter((d) => d.afterTrick === after).map((d) => cardLabel(d.card.identity));
      return [{ key, kind: "ate-cards", text: "Locusts ate a card from every hand", cards }];
    }
    return [];
  });
}
