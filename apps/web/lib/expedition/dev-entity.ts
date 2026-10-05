import type { ExpeditionView } from "@games/rules";
import { objectiveObjectId } from "./expedition-ids";
import { attemptOf } from "./view-access";

/** A thing on the Expedition table the dev tools can act on, named the way
 * the game's dev shortcuts target it (`DevShortcut.target.kind`). */
export type DevEntity = { readonly kind: "objective" | "mod"; readonly id: string };

/** The first of `objectIds` (the table objects under the pointer, innermost
 * first) that names an objective, a boss or a camp modifier chip. */
export function devEntityAt(objectIds: readonly string[], view: ExpeditionView): DevEntity | null {
  const objectives = attemptOf(view)?.camp.objectives ?? [];
  for (const objectId of objectIds) {
    const mod = /^(?:boss|mod):(.+)$/.exec(objectId);
    if (mod !== null) return { kind: "mod", id: mod[1]! };
    const objective = objectives.find((o) => objectiveObjectId(o) === objectId);
    if (objective !== undefined) return { kind: "objective", id: objective.id };
  }
  return null;
}
