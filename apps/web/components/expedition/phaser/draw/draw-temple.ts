/**
 * The temple's plate path along the foot of the table: "Plates 2/9", one
 * tile per plate with its suit's pip (the Sun last), and what to lead next.
 * A pressed plate is lit, the next one outlined with a pulsing ring,
 * those ahead dark. Hovering the row shows the temple's rules.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { PLATE_TILE, pathLayout } from "../layout";
import { FULL_PIPS } from "../card-packs/pips";
import type { ObjectIndex } from "../object-index";
import type { CampHandlers } from "./camp-handlers";
import type { SceneModel } from "../../../../lib/expedition/build-scene-model";
import { TEMPLE_PATH_ID, type PlateKind, type PlateTile } from "../../../../lib/expedition/temple-model";
import { PANEL_ALPHA, labelWidth, plate, text, type Layer } from "./ui-kit";

const PULSE_MS = 600;
const POP_MS = 700;
const PIP = 7;

function pipColor(kind: PlateKind): string {
  return kind === "sun" ? PALETTE.sun : PALETTE.suitBigIndex[kind];
}

const TILE_STYLE: Readonly<Record<PlateTile["state"], { face: string; edge: string; pip: (kind: PlateKind) => string }>> = {
  pressed: { face: PALETTE.glow, edge: PALETTE.done, pip: pipColor },
  next: { face: PALETTE.cardFace, edge: PALETTE.turn, pip: pipColor },
  ahead: { face: PALETTE.plate, edge: PALETTE.plateEdge, pip: () => PALETTE.textDim },
};

function tile(scene: Phaser.Scene, x: number, y: number, t: PlateTile): Phaser.GameObjects.Container {
  const style = TILE_STYLE[t.state];
  const container = scene.add.container(x, y);
  container.add(plate(scene, 0, 0, PLATE_TILE, PLATE_TILE, style.face).setStrokeStyle(1, toPhaserColor(style.edge)));
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(style.pip(t.plate)), 1);
  const at = Math.floor((PLATE_TILE - PIP) / 2);
  FULL_PIPS[t.plate].forEach((row, ry) => Array.from(row).forEach((ch, rx) => ch === "#" && g.fillRect(at + rx, at + ry, 1, 1)));
  container.add(g);
  container.setSize(PLATE_TILE, PLATE_TILE);
  return container;
}

const HINT_COLOR: Readonly<Record<NonNullable<SceneModel["temple"]>["status"], string>> = {
  pending: PALETTE.text,
  done: PALETTE.done,
  failed: PALETTE.destructive,
};

/** Draws the path; `popPressed` marks the plate just pressed with a pop. */
export function drawTemplePath(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers, popPressed: boolean): void {
  const path = model.temple;
  if (path === null) return;
  const geo = pathLayout(path.plates.length, labelWidth(path.count), labelWidth(path.hint), LABEL_CELL.h);
  const row = scene.add.container(0, 0);
  row.add(plate(scene, geo.row.x, geo.row.y, geo.row.w, geo.row.h).setAlpha(PANEL_ALPHA));
  row.add(text(scene, geo.countX, geo.textY, path.count, PALETTE.sun));
  path.plates.forEach((t, i) => {
    const piece = tile(scene, geo.tileXs[i]!, geo.tileY, t);
    row.add(piece);
    index.register("camp", t.objectId, piece);
    if (t.state === "next") {
      const ring = scene.add.rectangle(geo.tileXs[i]! - 1, geo.tileY - 1, PLATE_TILE + 2, PLATE_TILE + 2, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      row.add(ring);
      scene.tweens.add({ targets: ring, alpha: { from: 1, to: 0.2 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
    }
    if (popPressed && i === path.pressed - 1) {
      const c = PLATE_TILE / 2;
      const ring = scene.add.rectangle(geo.tileXs[i]! + c, geo.tileY + c, PLATE_TILE, PLATE_TILE, 0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.glow));
      row.add(ring);
      scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: POP_MS, ease: "Quad.Out", onComplete: () => ring.destroy() });
    }
  });
  row.add(text(scene, geo.hintX, geo.textY, path.hint, HINT_COLOR[path.status]));
  const hit = scene.add.zone(geo.row.x, geo.row.y, geo.row.w, geo.row.h).setOrigin(0, 0);
  hit.setInteractive();
  hit.on("pointerover", () => handlers.onModHover("temple"));
  hit.on("pointerout", () => handlers.onModHover(null));
  row.add(hit);
  layer.add(row);
  index.register("camp", TEMPLE_PATH_ID, hit);
}
