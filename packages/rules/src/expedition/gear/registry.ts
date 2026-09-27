// Phase 10 gear catalogue registry (Plan 10-15, ENG-01, ENG-02).
// GEAR_REGISTRY registers all ten v1 gear items by id, in spec §5.1 order:
// Signal Whistle (chatter), Spyglass (peek), Signal Flare (broadcast),
// Camouflage (ghost), Compass (reroll), Trained Monkey (pickpocket), Machete
// (commandeer), Rain Poncho (jam), Trail Map (reassign), Energy Tonic
// (overclock).
//
// ENG-01's recipe, now literally true for gear: adding an eleventh item is
// one new file under gear/<id>.ts exporting a GearDef, plus one import and
// one object-literal line here. gear.contract.test.ts (this plan) then
// covers the new entry automatically, with zero test edits — mirroring
// boss/registry.ts's own BOSS_REGISTRY (Plan 10-14).

import { chatter } from "./chatter";
import { peek } from "./peek";
import { broadcast } from "./broadcast";
import { ghost } from "./ghost";
import { reroll } from "./reroll";
import { pickpocket } from "./pickpocket";
import { commandeer } from "./commandeer";
import { jam } from "./jam";
import { reassign } from "./reassign";
import { overclock } from "./overclock";
import type { GearDef } from "./gear-def";

export const GEAR_REGISTRY = {
  chatter,
  peek,
  broadcast,
  ghost,
  reroll,
  pickpocket,
  commandeer,
  jam,
  reassign,
  overclock,
} satisfies Readonly<Record<string, GearDef>>;

export type GearId = keyof typeof GEAR_REGISTRY;
