import type { ExpeditionView } from "@games/rules";
import type { SfxId } from "./sound-bank";

/**
 * Which one-shot sounds a change of authoritative view should trigger.
 * A rule is a (cue, predicate over prev and next) row. `cuesFor` returns
 * the cues of every row that fires, once each, in table order. There is no
 * cue on the first snapshot, so joining or refreshing mid-game is silent.
 */

type Game = ExpeditionView;

function attemptKey(g: Game): string {
  return `${g.campNumber}:${g.attempt?.attemptNumber ?? 0}`;
}

function sameAttempt(prev: Game, next: Game): boolean {
  return prev.attempt !== null && next.attempt !== null && attemptKey(prev) === attemptKey(next);
}

function totalPlays(g: Game): number {
  const camp = g.attempt?.camp;
  if (!camp) return 0;
  return camp.completedTricks.reduce((n, t) => n + t.plays.length, 0) + camp.currentTrick.plays.length;
}

function logCount(g: Game, pred: (event: string) => boolean): number {
  return g.attempt?.log.filter((e) => pred(e.event)).length ?? 0;
}

function statusChanged(prev: Game, next: Game, to: "done" | "failed"): boolean {
  const before = new Map(prev.attempt?.camp?.objectives.map((o) => [o.id, o.status]) ?? []);
  return (
    next.attempt?.camp?.objectives.some((o) => {
      const was = before.get(o.id);
      return was !== undefined && was !== to && o.status === to;
    }) ?? false
  );
}

function ownedObjectiveIds(g: Game): Set<string> {
  return new Set(g.attempt?.camp?.objectives.filter((o) => o.ownerSeatId !== null).map((o) => o.id) ?? []);
}

/** Your character and kit: a pick at muster or at a draft changes it. */
function ownKit(g: Game): string {
  const you = g.seats.find((s) => s.seatId === g.yourSeatId);
  return you === undefined ? "" : [you.characterId ?? "", ...you.kit].join(",");
}

function newDeal(prev: Game, next: Game): boolean {
  const nextHasCamp = next.attempt?.camp != null;
  if (!nextHasCamp) return false;
  return prev.attempt?.camp == null || attemptKey(prev) !== attemptKey(next);
}

const RULES: ReadonlyArray<{ cue: SfxId; when: (prev: Game, next: Game) => boolean }> = [
  { cue: "sfx-card-deal", when: newDeal },
  { cue: "sfx-card-play", when: (p, n) => sameAttempt(p, n) && totalPlays(n) > totalPlays(p) },
  {
    cue: "sfx-card-pick",
    when: (p, n) => {
      if (!sameAttempt(p, n)) return false;
      const before = ownedObjectiveIds(p);
      return [...ownedObjectiveIds(n)].some((id) => !before.has(id));
    },
  },
  { cue: "sfx-objective-done", when: (p, n) => statusChanged(p, n, "done") },
  { cue: "sfx-objective-failed", when: (p, n) => statusChanged(p, n, "failed") },
  { cue: "sfx-whisper", when: (p, n) => sameAttempt(p, n) && logCount(n, (e) => e === "whisper") > logCount(p, (e) => e === "whisper") },
  { cue: "sfx-power", when: (p, n) => sameAttempt(p, n) && logCount(n, (e) => e === "use-ability") > logCount(p, (e) => e === "use-ability") },
  { cue: "sfx-supply-lost", when: (p, n) => n.supplies < p.supplies },
  {
    cue: "sfx-camp-cleared",
    when: (p, n) =>
      (n.history.length > p.history.length && n.history[n.history.length - 1]?.status === "succeeded") ||
      (p.runStatus === "in_progress" && n.runStatus === "won"),
  },
  { cue: "sfx-run-lost", when: (p, n) => p.runStatus === "in_progress" && n.runStatus === "lost" },
  { cue: "sfx-equip", when: (p, n) => n.attempt === null && ownKit(p) !== ownKit(n) },
];

export function cuesFor(prev: Game | null, next: Game | null): SfxId[] {
  if (prev === null || next === null) return [];
  return RULES.filter((r) => r.when(prev, next)).map((r) => r.cue);
}
