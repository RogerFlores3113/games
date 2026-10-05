// What happens when a location meets a weather. "never" keeps the pair off
// every route; otherwise the pairing cancels defs and may add its own.

import type { ModId } from "./mod-def";

export type PairingRule = {
  readonly location: ModId;
  readonly weathers: readonly ModId[];
  readonly result: "never" | { readonly cancels: readonly ModId[]; readonly adds: ModId | null };
};

export const PAIRINGS: readonly PairingRule[] = [
  { location: "magma", weathers: ["rain", "downpour", "thunderstorm"], result: { cancels: ["magma"], adds: "steam" } },
  { location: "cave", weathers: ["rain", "downpour"], result: { cancels: [], adds: "flooding" } },
  { location: "cave", weathers: ["night"], result: "never" },
  { location: "desert", weathers: ["rain", "downpour"], result: "never" },
];
