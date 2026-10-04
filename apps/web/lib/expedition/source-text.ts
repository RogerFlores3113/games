import { CHARACTER_DISPLAY, SOURCE_DISPLAY, type ExpeditionRemainingView, type ExpeditionSeatView, type ExpeditionView } from "@games/rules";

/**
 * How every screen names a character, upgrade or item. The catalogue text
 * says what a source does in one sentence; when it works and how often are
 * badges from the def, never repeated in the sentence.
 */

export type SourceKind = "character" | "upgrade" | "item" | "grant";

/** The def id behind a source key: an item instance's item, else the key
 * itself (a character or an upgrade id). */
export function sourceIdOfKey(seat: ExpeditionSeatView | undefined, key: string): string {
  if (seat === undefined) return key;
  return [...seat.items.equipped, ...(seat.items.backpack ?? [])].find((item) => item.uid === key)?.itemId ?? key;
}

/** sourceIdOfKey for one of the viewer's own keys. */
export function yourSourceId(view: ExpeditionView, key: string): string {
  return sourceIdOfKey(view.seats.find((s) => s.seatId === view.yourSeatId), key);
}

/** The keys a seat acts through: its character, its upgrade, then its
 * equipped item instances. */
export function liveSourceKeys(seat: ExpeditionSeatView): string[] {
  return [...(seat.characterId === null ? [] : [seat.characterId]), ...(seat.upgradeId === null ? [] : [seat.upgradeId]), ...seat.items.equipped.map((item) => item.uid)];
}

/** A source as it acts: a character is its base power ("Spyglass"), an
 * upgrade or item its own name. */
export function sourceName(sourceId: string): string {
  return CHARACTER_DISPLAY[sourceId]?.power ?? SOURCE_DISPLAY[sourceId]?.name ?? sourceId;
}

export function characterName(characterId: string): string {
  return CHARACTER_DISPLAY[characterId]?.name ?? characterId;
}

export function sourceKind(sourceId: string): SourceKind {
  return SOURCE_DISPLAY[sourceId]?.kind ?? "item";
}

/** When it works and how often: ["Between tricks", "1 per camp"], or
 * ["Always"] for a passive. */
export function sourceBadges(sourceId: string): string[] {
  const display = SOURCE_DISPLAY[sourceId];
  if (display === undefined) return [];
  if (display.active === null) return ["Always"];
  return [display.active.windowPhrase, display.active.limitBadge];
}

export interface SourceRules {
  title: string;
  text: string;
  badges: string[];
}

export function sourceRulesText(sourceId: string): SourceRules | null {
  const display = SOURCE_DISPLAY[sourceId];
  if (display === undefined) return null;
  return { title: sourceName(sourceId), text: display.text, badges: sourceBadges(sourceId) };
}

function poolUnit(sourceId: string): string {
  const display = SOURCE_DISPLAY[sourceId];
  const characterId = display?.characterId ?? null;
  const pool = characterId === null ? null : CHARACTER_DISPLAY[characterId]?.pool;
  return (pool?.name ?? "uses").toLowerCase();
}

/** What is left of a source right now: "1 left", "used", "2/3 herbs",
 * "1 supply". A passive is always on. */
export function chargeText(sourceId: string, remaining: ExpeditionRemainingView | null): string {
  if (remaining === null) return SOURCE_DISPLAY[sourceId]?.active === null ? "always on" : "";
  switch (remaining.kind) {
    case "uses":
      return remaining.left === 0 ? "used" : `${remaining.left} left`;
    case "pool":
      return `${remaining.balance}/${remaining.max} ${poolUnit(sourceId)}`;
    case "supplies":
      return `${remaining.cost} ${remaining.cost === 1 ? "supply" : "supplies"}`;
    case "crew":
      return remaining.earned === 0 ? "not earned" : remaining.left === 0 ? "used" : `${remaining.left} left`;
  }
}

/** Whether a source can't fire again until its limit resets. */
export function isSpent(remaining: ExpeditionRemainingView | null): boolean {
  if (remaining === null) return false;
  if (remaining.kind === "uses") return remaining.left === 0;
  if (remaining.kind === "pool") return remaining.balance < remaining.cost;
  if (remaining.kind === "crew") return remaining.left === 0;
  return false;
}
