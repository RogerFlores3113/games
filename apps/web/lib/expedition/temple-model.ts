import type { ExpeditionStatusPartView, ExpeditionView } from "@games/rules";
import { SUIT_GLYPH } from "./expedition-ids";

/**
 * The temple's plate path as the table shows it: each plate's suit (the Sun
 * last) and whether it is pressed, the next to press, or still ahead, with
 * a count and a hint for the lead. A pure display transform of the temple's
 * `path` status and its `temple` goal; never decides what presses a plate.
 */

type PathPart = Extract<ExpeditionStatusPartView, { kind: "path" }>;
export type PlateKind = PathPart["plates"][number];
export type PlateState = "pressed" | "next" | "ahead";

export interface PlateTile {
  plate: PlateKind;
  state: PlateState;
  objectId: string;
}

export interface TemplePath {
  plates: PlateTile[];
  pressed: number;
  /** "Plates 2/9". */
  count: string;
  /** What to lead next, or how the path ended. */
  hint: string;
  status: "pending" | "done" | "failed";
  /** Unique per camp and attempt, so a newly pressed plate is marked once. */
  key: string;
}

export const TEMPLE_PATH_ID = "temple-path";

export function plateObjectId(i: number): string {
  return `plate:${i}`;
}

function plateName(plate: PlateKind): string {
  return plate === "sun" ? "the Sun" : SUIT_GLYPH[plate];
}

function hintFor(status: TemplePath["status"], next: PlateKind | undefined): string {
  if (status === "done") return "Every plate pressed";
  if (status === "failed") return "The path is broken";
  return next === undefined ? "" : `Next: lead ${plateName(next)}`;
}

/** The path at a temple camp; null anywhere else. */
export function buildTemplePath(view: ExpeditionView): TemplePath | null {
  const stage = view.stage;
  if (stage.tag !== "camp") return null;
  const path = stage.mods.flatMap((m) => m.status).find((p): p is PathPart => p.kind === "path");
  if (path === undefined) return null;
  const goal = stage.attempt.camp.goals.find((g) => g.id === "temple");
  const status = goal?.status ?? "pending";
  const plates = path.plates.map((plate, i): PlateTile => ({
    plate,
    state: i < path.pressed ? "pressed" : i === path.pressed && status === "pending" ? "next" : "ahead",
    objectId: plateObjectId(i),
  }));
  return {
    plates,
    pressed: path.pressed,
    count: `Plates ${path.pressed}/${path.plates.length}`,
    hint: hintFor(status, path.plates[path.pressed]),
    status,
    key: `${stage.camp.index}:${stage.attempt.attemptNumber}`,
  };
}
