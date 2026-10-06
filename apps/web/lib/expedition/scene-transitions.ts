/**
 * The signboard between scenes: which moves of the run get one, what it
 * says, and how long each beat lasts. Purely presentational: the store
 * holds the next view back while the sign hangs, so the server may already
 * be ahead. No phaser import.
 *
 * To tune: change a row of `TRANSITION_TIMING` (milliseconds) or a case's
 * copy in `TRANSITIONS`. Cases are tried in order; the first whose `when`
 * holds for (the view on screen, the view arriving) plays. Delete a case
 * to make that move instant again.
 */
import type { ExpeditionView } from "@games/rules";
import { MOD_DISPLAY, RUN_LENGTH_DISPLAY } from "@games/rules";

/** `full` normally; `reduced` under prefers-reduced-motion; `fast` the
 * same sequence compressed (e2e); `skip` none at all (a dev jump). */
export type TransitionSpeed = keyof typeof TRANSITION_TIMING | "skip";

export type TransitionTiming = {
  /** The sign drops on its chains, bounces and swings; otherwise it fades in where it hangs. */
  readonly motion: boolean;
  /** The drop (or the fade in) until the sign hangs at rest. */
  readonly enter: number;
  /** The sign hangs, readable: the "loading" beat. A case's own `hold` replaces it unless `fixedHold`. */
  readonly hold: number;
  readonly fixedHold: boolean;
  /** The scene and the sign fade to black. */
  readonly fadeOut: number;
  /** All black: the new scene swaps in here. */
  readonly black: number;
  /** The new scene fades in from black, once it has drawn. */
  readonly fadeIn: number;
  /** How far the chains give when the sign lands, and how far it swings, in stage px and degrees. */
  readonly bouncePx: number;
  readonly swingDeg: number;
};

export const TRANSITION_TIMING = {
  full: { motion: true, enter: 650, hold: 2500, fixedHold: false, fadeOut: 450, black: 150, fadeIn: 450, bouncePx: 5, swingDeg: 2.5 },
  reduced: { motion: false, enter: 200, hold: 2000, fixedHold: false, fadeOut: 200, black: 50, fadeIn: 200, bouncePx: 0, swingDeg: 0 },
  fast: { motion: true, enter: 80, hold: 100, fixedHold: true, fadeOut: 60, black: 20, fadeIn: 60, bouncePx: 5, swingDeg: 2.5 },
} as const satisfies Readonly<Record<string, TransitionTiming>>;

/** The ink the sign is lettered in. */
export type TransitionTone = "good" | "bad" | "boss" | "neutral";

/** What the plank says, carved in capitals. `sub` is the smaller line; "\n" breaks it. */
export type SignCopy = { readonly title: string; readonly sub: string | null };

export type TransitionCase = {
  readonly id: string;
  readonly tone: TransitionTone;
  /** Milliseconds the sign hangs, when this move deserves more or less than the speed's `hold`. */
  readonly hold?: number;
  readonly when: (shown: ExpeditionView, next: ExpeditionView) => boolean;
  readonly copy: (shown: ExpeditionView, next: ExpeditionView) => SignCopy;
};

const ROUTINE_HOLD = 2000;

export const TRANSITIONS: readonly TransitionCase[] = [
  {
    id: "run-won",
    tone: "good",
    hold: 3000,
    when: (shown, next) => shown.stage.tag !== "ended" && next.stage.tag === "ended" && next.stage.result === "won",
    copy: () => ({ title: "Expedition won!", sub: "The temple's treasure is yours" }),
  },
  {
    id: "run-lost",
    tone: "bad",
    hold: 3000,
    when: (shown, next) => shown.stage.tag !== "ended" && next.stage.tag === "ended" && next.stage.result === "lost",
    copy: (_, next) => ({ title: "Expedition lost", sub: next.supplies.count === 0 ? "Out of supplies" : "The crew turns back" }),
  },
  {
    id: "camp-won",
    tone: "good",
    when: (shown, next) => shown.stage.tag === "camp" && (next.stage.tag === "draft" || next.stage.tag === "shop") && next.history.at(-1)?.status === "cleared",
    copy: (_, next) => ({ title: "Camp won!", sub: `+${next.history.at(-1)?.coins ?? 0} coins` }),
  },
  {
    id: "camp-lost",
    tone: "bad",
    when: (shown, next) => shown.stage.tag === "camp" && (next.stage.tag === "loadout" || next.stage.tag === "shop") && next.history.at(-1)?.status === "failed",
    copy: (shown, next) => ({ title: "Camp lost", sub: suppliesLost(shown.supplies.count - next.supplies.count, next.supplies.count) }),
  },
  {
    id: "camp-restarted",
    tone: "neutral",
    when: (shown, next) => shown.stage.tag === "camp" && (next.stage.tag === "loadout" || next.stage.tag === "shop") && next.history.at(-1)?.status === "restarted",
    copy: () => ({ title: "Camp restarts", sub: "A smaller crew, at no cost" }),
  },
  {
    id: "run-start",
    tone: "neutral",
    when: (shown, next) => shown.stage.tag === "muster" && next.stage.tag === "draft",
    copy: (_, next) => {
      const length = next.length === null ? null : RUN_LENGTH_DISPLAY[next.length];
      if (length === undefined || length === null) return { title: "Setting out", sub: null };
      const flip = next.lastVote?.topic === "length" && next.lastVote.tied !== null;
      return { title: `${length.name} run`, sub: `${length.camps} camps${flip ? "\nA coin flip decided it" : ""}` };
    },
  },
  {
    id: "route-decided",
    tone: "neutral",
    when: (shown, next) => shown.stage.tag === "route" && next.stage.tag === "loadout",
    copy: (_, next) => {
      if (next.stage.tag !== "loadout") return { title: "On the trail", sub: null };
      const camp = next.stage.camp;
      const flip = next.lastVote?.topic === "route" && next.lastVote.tied !== null;
      return { title: `Heading to ${placeName(camp.location)}`, sub: `${weatherLine(camp.weather, camp.pairing)}${flip ? "\nA coin flip decided it" : ""}` };
    },
  },
  {
    id: "temple",
    tone: "boss",
    when: (shown, next) => shown.stage.tag === "loadout" && next.stage.tag === "camp" && plannedTier(next) === "temple",
    copy: (_, next) => ({ title: "The Temple", sub: `Press every plate in order${tryLine(next)}` }),
  },
  {
    id: "boss",
    tone: "boss",
    when: (shown, next) => shown.stage.tag === "loadout" && next.stage.tag === "camp" && (next.stage.camp.bossId ?? null) !== null,
    copy: (_, next) => ({ title: `Boss: ${placeName(next.stage.tag === "camp" ? (next.stage.camp.bossId ?? "") : "")}`, sub: `Camp ${campOf(next)?.index ?? "?"}${tryLine(next)}` }),
  },
  {
    id: "table",
    tone: "neutral",
    hold: ROUTINE_HOLD,
    when: (shown, next) => shown.stage.tag === "loadout" && next.stage.tag === "camp",
    copy: (_, next) => {
      const camp = campOf(next);
      const attempt = attemptOf(next);
      return { title: `Camp ${camp?.index ?? "?"}${attempt > 1 ? `, try ${attempt}` : ""}`, sub: camp === null ? null : weatherLine(camp.weather, camp.pairing, modName(camp.location)) };
    },
  },
];

function modName(id: string): string {
  return MOD_DISPLAY[id]?.name ?? id;
}

/** "the Clifftop", "the Magma pool", "the Tiger": a name that already
 * starts with "The" keeps its own. */
function placeName(id: string): string {
  const name = modName(id);
  return name.startsWith("The ") ? name : `the ${name}`;
}

function weatherLine(weather: string, pairing: string | null, location?: string): string {
  const sky = weather === "fair" ? "Fair weather" : modName(weather);
  const parts = [location, sky, pairing === null ? undefined : modName(pairing)].filter((p): p is string => p !== undefined);
  return parts.join(", ");
}

function suppliesLost(lost: number, left: number): string {
  const n = Math.max(1, lost);
  return `-${n} ${n === 1 ? "supply" : "supplies"}. ${left} left`;
}

function campOf(view: ExpeditionView): { index: number; location: string; weather: string; pairing: string | null } | null {
  const stage = view.stage;
  if (stage.tag === "loadout" || stage.tag === "camp") return stage.camp;
  if (stage.tag === "shop") return stage.camp;
  return null;
}

function plannedTier(view: ExpeditionView): string | null {
  const camp = campOf(view);
  return camp === null ? null : (view.plan.find((p) => p.at === camp.index)?.tier ?? null);
}

function attemptOf(view: ExpeditionView): number {
  return view.stage.tag === "camp" ? view.stage.attempt.attemptNumber : 1;
}

/** "\nTry 2" on a replay, "" on the first attempt. */
function tryLine(view: ExpeditionView): string {
  const attempt = attemptOf(view);
  return attempt > 1 ? `\nTry ${attempt}` : "";
}

/** A transition the move from `shown` to `next` plays, or null for none. */
export type SceneTransition = { readonly caseId: string; readonly tone: TransitionTone; readonly copy: SignCopy; readonly hold: number | null };

export function transitionFor(shown: ExpeditionView, next: ExpeditionView): SceneTransition | null {
  const found = TRANSITIONS.find((c) => c.when(shown, next));
  if (found === undefined) return null;
  return { caseId: found.id, tone: found.tone, copy: found.copy(shown, next), hold: found.hold ?? null };
}

/** The hold a transition gets at `timing`. */
export function holdOf(timing: TransitionTiming, transition: SceneTransition): number {
  return timing.fixedHold || transition.hold === null ? timing.hold : transition.hold;
}

/** When the screen is black and the next view swaps in, from the start. */
export function swapAt(timing: TransitionTiming, transition: SceneTransition): number {
  return timing.enter + holdOf(timing, transition) + timing.fadeOut + timing.black;
}

/** Where the sign is `t` ms after the transition started. `fall` is 0
 * above the stage to 1 at rest; `bounce` (stage px, down) and `angle`
 * (degrees, about the chains' top) settle after the landing; `black` is
 * the fade over everything. */
export type SignPose = { readonly fall: number; readonly bounce: number; readonly angle: number; readonly alpha: number; readonly black: number };

/** The share of `enter` spent falling; the rest is the landing. */
const FALL_SHARE = 0.55;

export function signPose(timing: TransitionTiming, transition: SceneTransition, t: number): SignPose {
  const fadeStart = timing.enter + holdOf(timing, transition);
  const black = timing.fadeOut === 0 ? (t >= fadeStart ? 1 : 0) : clamp01((t - fadeStart) / timing.fadeOut);
  if (!timing.motion) return { fall: 1, bounce: 0, angle: 0, alpha: timing.enter === 0 ? 1 : clamp01(t / timing.enter), black };
  const fallTime = timing.enter * FALL_SHARE;
  if (t < fallTime) {
    const p = clamp01(t / fallTime);
    return { fall: p * p, bounce: 0, angle: 0, alpha: 1, black };
  }
  // After the landing: the chains give a little and spring back, and the
  // sign swings about its top until it hangs still.
  const u = t - fallTime;
  const scale = timing.enter / TRANSITION_TIMING.full.enter;
  const bounce = timing.bouncePx * Math.exp(-u / (160 * scale)) * Math.sin((u * 2 * Math.PI) / (260 * scale));
  const angle = timing.swingDeg * Math.exp(-u / (900 * scale)) * Math.sin((u * 2 * Math.PI) / (1100 * scale));
  return { fall: 1, bounce, angle, alpha: 1, black };
}

/** How dark the screen still is `t` ms into a fade in of `fadeIn` ms. */
export function fadeInBlack(fadeIn: number, t: number): number {
  return fadeIn === 0 ? 0 : 1 - clamp01(t / fadeIn);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** The top of each line, each centred on its own board (`boards` are
 * inclusive [top, bottom] rows, top to bottom) and the block as near the
 * middle as it sits, so no line is cut by a seam between the boards. Null
 * when there are more lines than boards. */
export function boardTops(heights: readonly number[], boards: readonly (readonly [number, number])[]): number[] | null {
  const n = heights.length;
  if (n === 0 || n > boards.length) return null;
  const middle = (boards[0]![0] + boards[boards.length - 1]![1]) / 2;
  let start = 0;
  for (let s = 1; s + n <= boards.length; s++) {
    const centre = (from: number) => (boards[from]![0] + boards[from + n - 1]![1]) / 2;
    if (Math.abs(centre(s) - middle) < Math.abs(centre(start) - middle)) start = s;
  }
  return heights.map((h, i) => {
    const [top, bottom] = boards[start + i]!;
    return top + Math.floor((bottom - top + 1 - h) / 2);
  });
}

/** A line of lettering on the plank, at `scale` times the 5x7 font. */
export type SignLine = { readonly text: string; readonly scale: number; readonly kind: "title" | "sub" };

/** The plank's lettering: the title at 3x, or 2x when it will not fit two
 * lines, then the sub line at 2x (1x when it will not fit two lines).
 * `chars(scale)` is how many characters fit across the plank. */
export function signLines(copy: SignCopy, chars: (scale: number) => number): SignLine[] {
  const title = fitLines(copy.title, [3, 2], chars).map((l) => ({ ...l, kind: "title" as const }));
  const subs = copy.sub === null ? [] : copy.sub.split("\n").flatMap((part) => fitLines(part, [2, 1], chars)).map((l) => ({ ...l, kind: "sub" as const }));
  return [...title, ...subs];
}

function fitLines(text: string, scales: readonly number[], chars: (scale: number) => number): { text: string; scale: number }[] {
  for (const scale of scales) {
    const lines = wrap(text, chars(scale));
    if (lines.length <= 2 && lines.every((l) => l.length <= chars(scale))) return lines.map((l) => ({ text: l, scale }));
  }
  const smallest = scales[scales.length - 1]!;
  return wrap(text, chars(smallest)).map((l) => ({ text: l.slice(0, chars(smallest)), scale: smallest }));
}

/** Greedy lines no wider than `width`; two lines are balanced, so a
 * title breaks "Heading to / the Desert" rather than leaving one word. */
function wrap(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length !== 2) return lines;
  const splits = words.slice(1).map((_, i) => [words.slice(0, i + 1).join(" "), words.slice(i + 1).join(" ")]);
  return splits.filter((pair) => pair.every((l) => l.length <= width)).reduce((best, pair) => (Math.max(...pair.map((l) => l.length)) < Math.max(...best.map((l) => l.length)) ? pair : best), lines);
}
