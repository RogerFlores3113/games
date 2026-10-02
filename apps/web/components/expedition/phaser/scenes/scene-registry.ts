/** The Phaser scene registry (§7.1): one factory per scene key. */
import type Phaser from "phaser";
import type { ExpeditionSceneStore } from "../../../../lib/expedition/expedition-scene-store";
import type { SceneKey } from "../../../../lib/expedition/build-scene-model";
import type { ObjectIndex } from "../object-index";
import { CampScene } from "./CampScene";
import { FiresideScene } from "./FiresideScene";
import { RunEndScene } from "./RunEndScene";

export interface SceneDeps {
  store: ExpeditionSceneStore;
  index: ObjectIndex;
}

export const SCENE_FACTORIES: Record<SceneKey, (deps: SceneDeps) => Phaser.Scene> = {
  camp: (deps) => new CampScene(deps),
  fireside: (deps) => new FiresideScene(deps),
  "run-end": (deps) => new RunEndScene(deps),
};
