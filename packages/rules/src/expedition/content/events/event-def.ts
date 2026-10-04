// An event waits on every route between two camps. Events have no effect
// yet; character events arrive later with this same shape.

export type EventId = string;
export type EventDef = { readonly id: EventId; readonly name: string; readonly text: string };

export function defineEvent(def: EventDef): EventDef {
  return def;
}
