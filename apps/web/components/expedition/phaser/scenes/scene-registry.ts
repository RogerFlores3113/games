/**
 * The Phaser scene registry (§7.1). Plan 12-08 registers only "camp"; Plan
 * 12-10 adds "between-camps" as one more import + object-literal line here.
 */
import type Phaser from "phaser";
import type { ExpeditionSceneStore } from "../../../../lib/expedition/expedition-scene-store";
import type { SceneKey } from "../../../../lib/expedition/build-scene-model";
import type { ObjectIndex } from "../object-index";
import { CampScene } from "./CampScene";
import { BetweenCampsScene } from "./BetweenCampsScene";

export interface SceneDeps {
  store: ExpeditionSceneStore;
  index: ObjectIndex;
}

export const SCENE_FACTORIES: Partial<Record<SceneKey, (deps: SceneDeps) => Phaser.Scene>> = {
  camp: (deps) => new CampScene(deps),
  "between-camps": (deps) => new BetweenCampsScene(deps),
};
