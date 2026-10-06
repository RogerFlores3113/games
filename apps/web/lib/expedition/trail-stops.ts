import type { ExpeditionView } from "@games/rules";
import { focusCampIndex, plannedBossAt } from "./view-access";

/**
 * The run's camps as the parchment trail map shows them, between camps and,
 * on the camp label's click, over the camp.
 */

type View = ExpeditionView;

/** A camp, or a boss camp by its tier. */
export type StopKind = "camp" | "animal" | "disaster" | "temple";

export interface TrailStop {
  index: number;
  state: "cleared" | "here" | "ahead";
  kind: StopKind;
  /** Second label line under the marker: "cleared", "next" ("here" in
   * camp) or "try 2"; empty ahead. */
  caption: string;
}

function stopKind(view: View, index: number): StopKind {
  return plannedBossAt(view, index)?.tier ?? "camp";
}

export function buildTrail(view: View): TrailStop[] | null {
  if (view.campCount === null) return null;
  const here = focusCampIndex(view);
  return Array.from({ length: view.campCount }, (_, i): TrailStop => {
    const index = i + 1;
    const results = view.history.filter((h) => h.camp === index && h.status !== "restarted");
    const cleared = results.some((h) => h.status === "cleared");
    const state = cleared ? "cleared" : index === here ? "here" : "ahead";
    const kind = stopKind(view, index);
    const parts: string[] = [];
    if (state === "cleared") parts.push("cleared");
    if (state === "here") parts.push(results.length > 0 ? `try ${results.length + 1}` : view.stage.tag === "camp" ? "here" : "next");
    return { index, state, kind, caption: parts.join(", ") };
  });
}

