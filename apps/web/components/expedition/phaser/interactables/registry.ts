// SCENE-09 interactable registry (D-16, spec 5.4, ENG-01). Every entry is
// fun-only, click-reactive, and structurally unable to touch game state or
// reach the server: no import of the realtime connection module, the
// client-side room state container, or the scene's own state container, and
// no call into the action-handling chokepoint, a socket, or the network —
// enforced by interactables.contract.test.ts's source scan, which resolves
// each entry's file straight from this file's own imports (never a hand
// list).
//
// ENG-01's recipe, extended into apps/web: adding a fifth interactable is
// one new file under interactables/<id>.ts exporting an InteractableDef,
// plus one import and one object-literal line here.
//
// Mascot reactions to game events (a happy bounce, a sad collapse) are
// deferred to Phase 14 — do not add them to mascot.ts or this file.

import { campfire } from "./campfire";
import { fireflies } from "./fireflies";
import { lantern } from "./lantern";
import { mascot } from "./mascot";
import type { InteractableDef } from "./interactable-def";

export const INTERACTABLE_REGISTRY = {
  campfire,
  fireflies,
  lantern,
  mascot,
} satisfies Readonly<Record<string, InteractableDef>>;

export type InteractableId = keyof typeof INTERACTABLE_REGISTRY;
