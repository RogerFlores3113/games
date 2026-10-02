/**
 * The end of a run: the outcome over the temple at dawn or the trail at
 * dusk, the tries each camp took, and the way back to the lobby. "New
 * expedition" is drawn for the host only; the worker refuses anyone else.
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { preloadArt, placeArt } from "../art/place-art";
import { PALETTE, toPhaserColor } from "../palette";
import { RUN_END_ZONES, STAGE, rowBoxes } from "../layout";
import { button, labelWidth, plate, text, type Layer } from "../draw/ui-kit";
import { LEAVE_ID, NEW_EXPEDITION_ID } from "../../../../lib/expedition/expedition-ids";
import type { RunEndCamp, RunEndModel } from "../../../../lib/expedition/run-end-model";
import type { ObjectIndex } from "../object-index";
import type { SceneDeps } from "./scene-registry";

const PANEL_ALPHA = 0.8;
const COLUMN_GAP = 4;

function runEndModel(store: SceneDeps["store"]): RunEndModel | null {
  const model = store.getState().model;
  return model?.sceneKey === "run-end" ? model : null;
}

function centred(scene: Phaser.Scene, cx: number, y: number, value: string, color: string = PALETTE.text): Phaser.GameObjects.BitmapText {
  return text(scene, cx - Math.floor(labelWidth(value) / 2), y, value, color);
}

function campStatus(camp: RunEndCamp): { label: string; color: string } {
  if (camp.cleared) return { label: "cleared ✓", color: PALETTE.done };
  if (camp.attempts > 0) return { label: "turned back", color: PALETTE.destructive };
  return { label: "", color: PALETTE.textDim };
}

export class RunEndScene extends Phaser.Scene {
  private readonly sceneStore: SceneDeps["store"];
  private readonly index: ObjectIndex;
  private unsubscribe: (() => void) | null = null;
  private layer: Layer | null = null;

  constructor(deps: SceneDeps) {
    super("run-end");
    this.sceneStore = deps.store;
    this.index = deps.index;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    ensurePixelFonts(this);
    this.layer = this.add.container(0, 0);
    this.unsubscribe = this.sceneStore.subscribe((next, prev) => {
      if (next.model !== prev.model) this.renderModel();
    });
    this.renderModel();

    // Strict Mode's dev-only double mount destroys the game without
    // stopping the scene, which fires DESTROY but never SHUTDOWN.
    const teardown = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.index.clearScene("run-end");
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  private renderModel(): void {
    const layer = this.layer;
    if (layer === null || this.unsubscribe === null) return;
    const model = runEndModel(this.sceneStore);
    if (model === null) return;
    layer.removeAll(true);
    this.index.clearScene("run-end");
    const won = model.outcome === "won";
    layer.add(placeArt(this, won ? "bg-temple-dawn" : "bg-trail-dusk", STAGE.w / 2, STAGE.h / 2));
    this.drawHeadline(layer, model);
    this.drawStrip(layer, model);
    const mascot = RUN_END_ZONES.mascot;
    layer.add(placeArt(this, won ? "mascot-cheer" : "mascot-flop", mascot.x + mascot.w / 2, mascot.y + mascot.h / 2));
    this.drawActions(layer, model);
  }

  private drawHeadline(layer: Layer, model: RunEndModel): void {
    const zone = RUN_END_ZONES.headline;
    const cx = zone.x + zone.w / 2;
    layer.add(plate(this, zone.x, zone.y, zone.w, zone.h).setAlpha(PANEL_ALPHA));
    const w = Array.from(model.headline).length * SIGN_CELL.w;
    const tint = model.outcome === "won" ? PALETTE.sun : PALETTE.text;
    layer.add(this.add.bitmapText(cx - Math.floor(w / 2), zone.y + 8, WORLD_SIGN_FONT, model.headline).setTint(toPhaserColor(tint)));
    layer.add(centred(this, cx, zone.y + 28, model.detail, PALETTE.textDim));
  }

  private drawStrip(layer: Layer, model: RunEndModel): void {
    const zone = RUN_END_ZONES.strip;
    layer.add(plate(this, zone.x, zone.y, zone.w, zone.h).setAlpha(PANEL_ALPHA));
    rowBoxes(zone.x + 4, zone.w - 8, model.history.length, COLUMN_GAP, zone.w).forEach((box, i) => {
      const camp = model.history[i]!;
      const cx = box.x + Math.floor(box.w / 2);
      const marker = camp.cleared ? "marker-cleared" : camp.boss ? "marker-boss" : "marker-camp";
      const art = placeArt(this, marker, cx, zone.y + 14);
      if (camp.attempts === 0) art.setAlpha(0.5);
      layer.add(art);
      layer.add(centred(this, cx, zone.y + 28, camp.boss ? `Camp ${camp.campNumber} boss` : `Camp ${camp.campNumber}`));
      layer.add(centred(this, cx, zone.y + 28 + LABEL_CELL.h + 3, camp.caption, camp.attempts === 0 ? PALETTE.textDim : PALETTE.text));
      const status = campStatus(camp);
      if (status.label !== "") layer.add(centred(this, cx, zone.y + 28 + (LABEL_CELL.h + 3) * 2, status.label, status.color));
    });
  }

  private drawActions(layer: Layer, model: RunEndModel): void {
    const zone = RUN_END_ZONES.actions;
    const cx = zone.x + zone.w / 2;
    if (model.isHost) {
      const start = button(this, cx, zone.y + 22, 208, 36, "New expedition", {
        onClick: () => this.sceneStore.getState().restartLobby(),
        outline: true,
        big: true,
      });
      layer.add(start);
      this.index.register("run-end", NEW_EXPEDITION_ID, start);
    } else {
      const waiting = "Waiting for the host to start a new expedition";
      layer.add(plate(this, zone.x, zone.y + 14, zone.w, 16).setAlpha(PANEL_ALPHA));
      layer.add(centred(this, cx, zone.y + 18, waiting, PALETTE.textDim));
    }
    const leave = button(this, cx, zone.y + 66, 120, 18, "Leave table", { onClick: () => window.location.assign("/") });
    layer.add(leave);
    this.index.register("run-end", LEAVE_ID, leave);
  }
}
