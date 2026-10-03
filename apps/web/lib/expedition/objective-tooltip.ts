import type { ExpeditionObjectiveView } from "@games/rules";
import type { Tooltip } from "./build-scene-model";
import { cardLabel } from "./expedition-ids";

const STATUS_TEXT = { pending: "still open", done: "done", failed: "failed" } as const;

/** Who an objective binds: "You" for the viewer, the seat's name once taken,
 * "Whoever takes it" while it is still face-up. */
export type ObjectiveHolder = { kind: "you" } | { kind: "seat"; name: string } | { kind: "nobody" };

function subject(holder: ObjectiveHolder): string {
  if (holder.kind === "you") return "You";
  return holder.kind === "seat" ? holder.name : "Whoever takes it";
}

/** What an objective means and where it stands, for the camp tooltip zone. */
export function objectiveTooltip(o: ExpeditionObjectiveView, holder: ObjectiveHolder): Tooltip {
  const status = STATUS_TEXT[o.status];
  const who = subject(holder);
  let title: string;
  let body: string;
  if (o.kind === "win-card") {
    title = cardLabel(o.target);
    body = `win the trick containing ${title}`;
  } else if (o.kind === "ordered") {
    const card = cardLabel(o.target);
    title = o.order === "last" ? `Last ${card}` : `#${o.order} ${card}`;
    body = o.order === "last" ? `win ${card} in the final trick` : `win ${card} before the other numbered objectives`;
  } else if (o.kind === "no-tricks") {
    title = "No tricks";
    body = `${who} must win no tricks`;
  } else {
    title = `Exactly ${o.n}`;
    body = `${who} must win exactly ${o.n} ${o.n === 1 ? "trick" : "tricks"}`;
  }
  return { title, text: `${body[0]!.toUpperCase()}${body.slice(1)}.`, badges: [`${status[0]!.toUpperCase()}${status.slice(1)}`], reason: null };
}
