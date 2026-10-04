// What happens when a location meets a weather. "never" keeps the pair off
// every route; otherwise the pairing cancels defs and may add its own.
// Pairings land with the locations and weathers they name.

import type { ModId } from "./mod-def";

export type PairingRule = {
  readonly location: ModId;
  readonly weathers: readonly ModId[];
  readonly result: "never" | { readonly cancels: readonly ModId[]; readonly adds: ModId | null };
};

export const PAIRINGS: readonly PairingRule[] = [];
