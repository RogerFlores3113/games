// One line per event.

import { blankEvent } from "./event";
import type { EventDef } from "./event-def";

export const EVENTS = {
  event: blankEvent,
} satisfies Readonly<Record<string, EventDef>>;
