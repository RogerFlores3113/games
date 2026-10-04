import type { ExpeditionModView, ExpeditionStatusPartView, ExpeditionView } from "@games/rules";
import { MOD_DISPLAY } from "@games/rules";
import { SUIT_GLYPH } from "./expedition-ids";
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
const CAPTION_NAME_CHARS = 6;

export function bossObjectId(modId: string): string {
  return `boss:${modId}`;
}

function shorten(name: string, chars: number): string {
  return name.length <= chars ? name : `${name.slice(0, chars - 1)}.`;
}

type Reading = Omit<BossModel, "id" | "objectId" | "name">;
type Reader = (status: readonly ExpeditionStatusPartView[], seats: SeatNamer) => Reading;

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
  rats: () => calm("-1 item slot", "Rats: everyone has one fewer item slot this camp"),
  capybara: () => calm("+2 objectives", "Capybara: two extra objectives this camp"),
};

function fallback(mod: ExpeditionModView): Reading {
  const display = MOD_DISPLAY[mod.id];
  return calm(display?.name ?? modName(mod.id), display?.text ?? "");
}

/** The camp's full-strength boss, or null for a plain camp. */
export function buildBoss(view: ExpeditionView, seats: SeatNamer): BossModel | null {
  const stage = view.stage;
  if (stage.tag !== "camp" && stage.tag !== "loadout") return null;
  const mod = stage.mods.find((m) => (m.kind === "animal" || m.kind === "disaster") && m.strength === "full");
  if (mod === undefined) return null;
  const reading = READERS[mod.id]?.(mod.status, seats) ?? fallback(mod);
  return { id: mod.id, objectId: bossObjectId(mod.id), name: MOD_DISPLAY[mod.id]?.name ?? modName(mod.id), ...reading };
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
