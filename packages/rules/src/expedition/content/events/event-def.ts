// An event waits on the trail after every other camp (run/trail.ts). Events
// have no effect yet; character events arrive later with this same shape.

export type EventId = string;
export type EventDef = { readonly id: EventId; readonly name: string; readonly text: string };

export function defineEvent(def: EventDef): EventDef {
  return def;
}
