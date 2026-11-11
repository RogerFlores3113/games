/**
 * The words for the attempt that just ended (`view.lastCamp`): why a camp
 * was lost, what it cost and what a clear paid, for the signboard and the
 * trail's "Last camp" lines. A pure display transform; `nameOf` names a
 * seat, "You" for the viewer. No phaser import.
 */
import type { ExpeditionCampRecapView, ExpeditionRecapObjectiveView } from "@games/rules";
import { MOD_DISPLAY } from "@games/rules";
import type { SceneServerInput } from "./build-scene-model";
import { cardLabel } from "./expedition-ids";
import { sourceName } from "./source-text";

export type NameOf = (seatId: string) => string;

/** Seat names as the trail shows them: "You", else the room's display label. */
export function seatNamer(server: SceneServerInput): NameOf {
  return (seatId) => (seatId === server.game.yourSeatId ? "You" : (server.roomSeats.find((r) => r.seatId === seatId)?.displayLabel ?? "A teammate"));
}

/** "Your" for you, else "Ana's". */
function possessive(name: string): string {
  return name === "You" ? "Your" : `${name}'s`;
}

/** "you" mid-sentence, else the name. */
function objectName(name: string): string {
  return name === "You" ? "you" : name;
}

function trickWord(n: number): string {
  return n === 1 ? "trick" : "tricks";
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];

/** What an objective asks, owned: "Ana's 10♣", "Your 10♣ (second)", "Ben's no tricks". */
export function objectiveName(entry: ExpeditionRecapObjectiveView, nameOf: NameOf): string {
  const o = entry.objective;
  const owner = o.ownerSeatId === null ? "The" : possessive(nameOf(o.ownerSeatId));
  switch (o.kind) {
    case "win-card":
      return `${owner} ${cardLabel(o.target)}`;
    case "ordered":
      return `${owner} ${cardLabel(o.target)} (${o.order === "last" ? "last" : (ORDINALS[o.order - 1] ?? `#${o.order}`)})`;
    case "no-tricks":
      return `${owner} no tricks`;
    case "exactly-n":
      return `${owner} exactly ${o.n}`;
    case "hidden":
      return `${owner} hidden objective`;
  }
}

/** Why one failed objective failed: "Ana's 10♣ was won by Ben", "You won a trick". */
export function failureReason(entry: ExpeditionRecapObjectiveView, nameOf: NameOf): string {
  const o = entry.objective;
  const owner = o.ownerSeatId === null ? null : nameOf(o.ownerSeatId);
  const fate = entry.fate;
  if (o.kind === "win-card" || o.kind === "ordered") {
    const named = objectiveName(entry, nameOf);
    if (fate?.kind === "won" && fate.bySeatId !== o.ownerSeatId) return `${named} was won by ${objectName(nameOf(fate.bySeatId))}`;
    if (fate?.kind === "won") return o.kind === "ordered" && o.order === "last" ? `${named} was not won last` : `${named} was won out of order`;
    if (fate?.kind === "lost") return `${named} was lost`;
    return `${named} was never won`;
  }
  if (o.kind === "no-tricks" && owner !== null) return `${owner} won a trick`;
  if (o.kind === "exactly-n" && owner !== null && entry.ownerTricksWon !== null) {
    return `${owner} won ${entry.ownerTricksWon} ${trickWord(entry.ownerTricksWon)}, needed exactly ${o.n}`;
  }
  return `${objectiveName(entry, nameOf)} failed`;
}

/** A camp-wide rule that failed, by its goal id. */
function goalReason(goalId: string, nameOf: NameOf): string {
  const [kind, seatId] = goalId.split(":");
  if ((kind === "hermit" || kind === "camouflage") && seatId !== undefined) return `${nameOf(seatId)} won a trick`;
  if (kind === "crocodile") return "The crocodile's mark won a trick";
  if (kind === "temple") return "The plates were not all pressed";
  return "A camp rule failed";
}

/** Why the camp was lost, naming the first failure: "Ana's 10♣ was won by
 * Ben", with ", and 1 more" when several failed. Null for a clear. */
export function lossLine(recap: ExpeditionCampRecapView, nameOf: NameOf): string | null {
  if (recap.status !== "failed") return null;
  const reasons = [
    ...recap.objectives.filter((o) => o.objective.status === "failed").map((o) => failureReason(o, nameOf)),
    ...recap.failedGoalIds.map((id) => goalReason(id, nameOf)),
  ];
  if (reasons.length === 0) return null;
  return reasons.length === 1 ? reasons[0]! : `${reasons[0]}, and ${reasons.length - 1} more`;
}

/** What each source took: "-1 failed camp, -1 Heavy Pack". Null when only
 * the base cost was paid (the sign says "-1 supply" then) or nothing was. */
export function supplyCostLine(recap: ExpeditionCampRecapView): string | null {
  const parts = recap.supplyCost;
  if (parts.length === 0 || parts.every((p) => p.origin.kind === "base")) return null;
  return parts
    .map((p) => {
      const what = p.origin.kind === "base" ? "failed camp" : p.origin.kind === "mod" ? (MOD_DISPLAY[p.origin.modId]?.name ?? p.origin.modId) : sourceName(p.origin.sourceId);
      return `${p.amount < 0 ? "+" : "-"}${Math.abs(p.amount)} ${what}`;
    })
    .join(", ");
}

/** "In 5 of 8 tricks": how fast a camp was cleared, which the payout counts. */
export function clearLine(recap: ExpeditionCampRecapView): string {
  return `In ${recap.tricksPlayed} of ${recap.totalTricks} ${trickWord(recap.totalTricks)}`;
}

/** "Final trick, won by Ben: You 7♣, Ana 10♣ burned, Ben J♣". Null when no trick completed. */
export function finalTrickLine(recap: ExpeditionCampRecapView, nameOf: NameOf): string | null {
  const trick = recap.lastTrick;
  if (trick === null) return null;
  const plays = trick.plays.map((p) => {
    const card = cardLabel(p.card.identity);
    const as = p.countsAs === null ? "" : ` as ${cardLabel(p.countsAs)}`;
    return `${nameOf(p.seatId)} ${card}${as}${p.burned ? " burned" : ""}`;
  });
  return `Final trick, won by ${objectName(nameOf(trick.winnerSeatId))}: ${plays.join(", ")}`;
}

/** "Objectives: Ana's 10♣ failed in trick 5, Your no tricks done, Ben's exactly 2 open". */
export function objectivesLine(recap: ExpeditionCampRecapView, nameOf: NameOf): string | null {
  if (recap.objectives.length === 0) return null;
  const states = recap.objectives.map((entry) => {
    const status = entry.objective.status;
    const state = status === "done" ? "done" : status === "failed" ? (entry.failedAtTrick === null ? "failed" : `failed in trick ${entry.failedAtTrick + 1}`) : "open";
    return `${objectiveName(entry, nameOf)} ${state}`;
  });
  return `Objectives: ${states.join(", ")}`;
}

/** The trail's "Last camp" lines, from the attempt that just ended: what
 * happened (with why it was lost, or what it paid), the final trick, and
 * every objective's end. Null with no recap. */
export interface LastCampStrip {
  tone: "good" | "bad";
  lines: string[];
}

/** The strip's lines as drawn: at most `rows`, each cut to `chars` with a
 * trailing "…". */
export function stripRows(strip: LastCampStrip, chars: number, rows: number): string[] {
  return strip.lines.slice(0, Math.max(0, rows)).map((line) => {
    const glyphs = Array.from(line);
    return glyphs.length <= chars ? line : `${glyphs.slice(0, Math.max(0, chars - 1)).join("")}…`;
  });
}

export function lastCampStrip(recap: ExpeditionCampRecapView | null, nameOf: NameOf): LastCampStrip | null {
  if (recap === null) return null;
  const tryText = recap.attempt > 1 ? `, try ${recap.attempt}` : "";
  let head: string;
  if (recap.status === "cleared") {
    head = `Last camp: Camp ${recap.camp}${tryText} cleared in ${recap.tricksPlayed} of ${recap.totalTricks} ${trickWord(recap.totalTricks)}, +${recap.coins} coins`;
  } else {
    const spent = recap.supplyCost.reduce((sum, p) => sum + p.amount, 0);
    const cost = supplyCostLine(recap) ?? `-${spent} ${spent === 1 ? "supply" : "supplies"}`;
    const consolation = recap.coins > 0 ? `+${recap.coins} ${recap.coins === 1 ? "coin" : "coins"} consolation` : null;
    head = [`Last camp: Camp ${recap.camp}${tryText} lost`, lossLine(recap, nameOf), cost, consolation].filter((p): p is string => p !== null).join(". ");
  }
  const lines = [head, finalTrickLine(recap, nameOf), objectivesLine(recap, nameOf)].filter((l): l is string => l !== null);
  return { tone: recap.status === "cleared" ? "good" : "bad", lines };
}
