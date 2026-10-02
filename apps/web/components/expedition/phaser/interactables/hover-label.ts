import type Phaser from "phaser";
import { WORLD_LABEL_FONT } from "../font/font-keys";

/** A name label `dy` px above the root's origin, shown only while hovered.
 * These labels are for fun; nothing about play depends on them. */
export function addHoverLabel(scene: Phaser.Scene, root: Phaser.GameObjects.Container, name: string, dy: number): void {
  const label = scene.add.bitmapText(0, dy, WORLD_LABEL_FONT, name).setOrigin(0.5, 1);
  label.setVisible(false);
  root.add(label);
  root.on("pointerover", () => label.setVisible(true));
  root.on("pointerout", () => label.setVisible(false));
}
