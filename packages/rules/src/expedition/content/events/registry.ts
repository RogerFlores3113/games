// One line per event. EVENT_POOL is what the trail draws from; EVENTS also
// holds the events kept out of it.

import { abandonedCamp, blankEvent, droppedPack, freshSpring } from "./event";
import type { EventDef } from "./event-def";

export const EVENTS = {
  event: blankEvent,
  "abandoned-camp": abandonedCamp,
  "fresh-spring": freshSpring,
  "dropped-pack": droppedPack,
} satisfies Readonly<Record<string, EventDef>>;

/** The events the trail draws. Quiet trail stays out. */
export const EVENT_POOL: readonly (keyof typeof EVENTS)[] = ["abandoned-camp", "dropped-pack", "fresh-spring"];
