/**
 * The signboard over every scene (`scene-transitions.ts`): it drops on its
 * chains with the copy the store's transition carries, hangs, fades the
 * stage to black, and once the next scene is running fades it back in.
 * It swallows the pointer until the fade in is done. Poses come from the store's
 * clock, so a frame skipped never changes where the sign ends up.
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { LABEL_CELL, WORLD_LABEL_FONT } from "../font/font-keys";
import { placeArt } from "../art/place-art";
import { artTextureKey } from "../art/art-registry";
import { PALETTE, toPhaserColor } from "../palette";
import { SIGNBOARD, STAGE, signChars } from "../layout";
import { boardTops, fadeStep, signLines, signPose, type FadeState, type SignLine } from "../../../../lib/expedition/scene-transitions";
import type { ActiveTransition, ExpeditionSceneStore } from "../../../../lib/expedition/expedition-scene-store";

export const TRANSITION_SCENE_KEY = "transition";

const ART_W = 192;
const ART_H = 128;
/** Link pairs above the art's own: enough to reach past the stage's top through the bounce and swing. */
const EXTRA_LINKS = 5;
const TITLE_GAP = 4;
const SUB_GAP = 3;
const BETWEEN_GAP = 8;
/** The 5x7 glyphs' rows, and the lit cut line under each. */
const GLYPH_ROWS = 7;
const CUT = 1;

export class TransitionScene extends Phaser.Scene {
  private readonly sceneStore: ExpeditionSceneStore;
  private sign: Phaser.GameObjects.Container | null = null;
  private lettering: Phaser.GameObjects.Container | null = null;
  private black: Phaser.GameObjects.Rectangle | null = null;
  private blocker: Phaser.GameObjects.Zone | null = null;
  /** The transition the sign is lettered for. */
  private letteredSerial: number | null = null;
  private fade: FadeState = { fade: null, doneSerial: null };
  private blocking = false;

  constructor(deps: { store: ExpeditionSceneStore }) {
    super(TRANSITION_SCENE_KEY);
    this.sceneStore = deps.store;
  }

  create(): void {
    ensurePixelFonts(this);
    this.scene.bringToTop();
    this.black = this.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.letterbox)).setOrigin(0, 0).setAlpha(0).setDepth(2);
    this.blocker = this.add.zone(0, 0, STAGE.w, STAGE.h).setOrigin(0, 0).setDepth(3);
  }

  /** Builds the plank and its chains once the art is loaded (any scene's preload loads it). */
  private ensureSign(): Phaser.GameObjects.Container {
    if (this.sign !== null) return this.sign;
    const scale = SIGNBOARD.scale;
    const left = -(ART_W * scale) / 2;
    const sign = this.add.container(STAGE.w / 2, 0).setDepth(1);
    const board = placeArt(this, "signboard", 0, 0).setOrigin(0, 0).setScale(scale).setPosition(left, SIGNBOARD.top);
    const key = artTextureKey("signboard");
    const chain = SIGNBOARD.chain;
    if (this.textures.exists(key)) {
      // The art's own chains end in a short bar; the repeated links replace it.
      board.setCrop(0, chain.y, ART_W, ART_H - chain.y);
      const texture = this.textures.get(key);
      chain.xs.forEach((x, i) => {
        const frame = `chain-${i}`;
        if (!texture.has(frame)) texture.add(frame, 0, x, chain.y, chain.w, chain.h);
        for (let link = 1; link <= EXTRA_LINKS; link++) {
          const y = SIGNBOARD.top + (chain.y - chain.h * link) * scale;
          sign.add(this.add.image(left + x * scale, y, key, frame).setOrigin(0, 0).setScale(scale));
        }
      });
    }
    sign.add(board);
    this.lettering = this.add.container(0, 0);
    sign.add(this.lettering);
    this.sign = sign;
    return sign;
  }

  private letter(transition: ActiveTransition): void {
    const layer = this.lettering;
    if (layer === null) return;
    layer.removeAll(true);
    // Capitals: the 5x7 font has no descenders, so a carved "g" reads as "9".
    const { title, sub } = transition.copy;
    const lines = signLines({ title: title.toUpperCase(), sub: sub?.toUpperCase() ?? null }, signChars);
    const scale = SIGNBOARD.scale;
    const heights = lines.map((line) => GLYPH_ROWS * line.scale + CUT);
    const boards = SIGNBOARD.boards.map(([top, bottom]) => [SIGNBOARD.top + top * scale, SIGNBOARD.top + (bottom + 1) * scale - 1] as const);
    const tops = boardTops(heights, boards) ?? stacked(lines, SIGNBOARD.top + SIGNBOARD.face.y * scale, SIGNBOARD.face.h * scale);
    const ink = toPhaserColor(PALETTE.signInk[transition.tone]);
    const cut = toPhaserColor(PALETTE.signCut);
    lines.forEach((line, i) => {
      const x = -Math.floor((Array.from(line.text).length * LABEL_CELL.w * line.scale) / 2);
      const color = line.kind === "title" ? ink : toPhaserColor(PALETTE.signInk.neutral);
      layer.add(this.add.bitmapText(x, tops[i]! + CUT, WORLD_LABEL_FONT, line.text).setScale(line.scale).setTint(cut));
      layer.add(this.add.bitmapText(x, tops[i]!, WORLD_LABEL_FONT, line.text).setScale(line.scale).setTint(color));
    });
  }

  update(): void {
    const transition = this.sceneStore.getState().transition;
    const now = performance.now();
    if (transition?.phase === "sign") {
      this.fade = { ...this.fade, fade: null };
      this.drawSign(transition, now);
      return;
    }
    this.sign?.setVisible(false);
    // Black until the next scene has loaded its art and drawn.
    const key = this.sceneStore.getState().sceneKey;
    const step = fadeStep(this.fade, transition, key !== null && this.scene.manager.isActive(key), now);
    this.fade = step.state;
    this.black?.setAlpha(step.black);
    this.block(step.blocking);
  }

  /** Whether the stage swallows the pointer now. */
  get holdsInput(): boolean {
    return this.blocking;
  }

  /** Swallows the pointer over the whole stage while the sign hangs and the next scene fades in. */
  private block(on: boolean): void {
    if (on === this.blocking || this.blocker === null) return;
    this.blocking = on;
    if (on) this.blocker.setInteractive();
    else this.blocker.disableInteractive();
  }

  private drawSign(transition: ActiveTransition, now: number): void {
    this.block(true);
    const pose = signPose(transition.timing, transition, now - transition.startedAt);
    this.black?.setAlpha(pose.black);
    const sign = this.ensureSign();
    if (this.letteredSerial !== transition.serial) {
      this.letter(transition);
      this.letteredSerial = transition.serial;
    }
    const drop = SIGNBOARD.top + ART_H * SIGNBOARD.scale;
    sign.setVisible(true).setAlpha(pose.alpha).setAngle(pose.angle);
    sign.setY(Math.round(-drop * (1 - pose.fall) + pose.bounce));
  }
}

/** Lines stacked about the plank's middle, for copy too long to give each line a board. */
function stacked(lines: readonly SignLine[], top: number, height: number): number[] {
  const total = lines.reduce((sum, line, i) => sum + LABEL_CELL.h * line.scale + gapBefore(lines, i), 0);
  let y = Math.round(top + (height - total) / 2);
  return lines.map((line, i) => {
    y += gapBefore(lines, i);
    const at = y;
    y += LABEL_CELL.h * line.scale;
    return at;
  });
}

function gapBefore(lines: readonly SignLine[], i: number): number {
  if (i === 0) return 0;
  const line = lines[i]!;
  if (line.kind !== lines[i - 1]!.kind) return BETWEEN_GAP;
  return line.kind === "title" ? TITLE_GAP : SUB_GAP;
}
