/**
 * D-01 throwaway stub: this is the between-camps step's bare functional
 * scene (draft/loadout/ready), deliberately separate from `CampScene.ts` so
 * Phase 13 can delete this file, its registry line, and
 * `between-camps-model.ts` cleanly without touching the real camp scene.
 * Every click here only ever calls `store.dispatch` with a fixed request
 * literal built from `BetweenCampsModel` fields already computed by
 * `buildBetweenCampsModel` (spec §7.1) — this scene never decides legality;
 * the worker independently refuses `not_offered`/`over_capacity`/
 * `gear_not_owned`/`draft_pending` (T-12-23).
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { PALETTE, toPhaserColor } from "../palette";
import { WORLD_LABEL_FONT, WORLD_SIGN_FONT } from "../font/font-keys";
import type { BetweenCampsModel } from "../../../../lib/expedition/between-camps-model";
import type { SceneDeps } from "./scene-registry";

const STAGE_W = 640;
const STAGE_H = 360;

const SIGN_X = 16;
const SIGN_Y = 16;

const DRAFT_ROW_Y = 60;
const DRAFT_CARD_W = 160;
const DRAFT_CARD_H = 90;
const DRAFT_CARD_GAP = 16;

const OWNED_START_Y = 190;
const OWNED_ROW_H = 16;
const OWNED_X = 24;

const PACK_LABEL_X = 400;
const PACK_LABEL_Y = 190;

const SEAT_LIST_X = 400;
const SEAT_LIST_START_Y = 210;
const SEAT_ROW_H = 14;

const READY_X = 320;
const READY_Y = 320;
const READY_W = 100;
const READY_H = 24;

export class BetweenCampsScene extends Phaser.Scene {
  private readonly sceneStore: SceneDeps["store"];
  private readonly index: SceneDeps["index"];
  private unsubscribe: (() => void) | null = null;
  private layer: Phaser.GameObjects.Container | null = null;

  constructor(deps: SceneDeps) {
    super("between-camps");
    this.sceneStore = deps.store;
    this.index = deps.index;
  }

  create(): void {
    ensurePixelFonts(this);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(toPhaserColor(PALETTE.jungle), 1);
    backdrop.fillRect(0, 0, STAGE_W, STAGE_H);

    this.layer = this.add.container(0, 0);

    this.unsubscribe = this.sceneStore.subscribe((next, prev) => {
      if (next.betweenModel !== prev.betweenModel) {
        this.renderModel();
      }
    });
    this.renderModel();

    // Strict Mode's dev-only double mount calls `game.destroy(true)` on the
    // first `Phaser.Game` directly, without first calling `scene.stop()` —
    // that only fires DESTROY, never SHUTDOWN, on the scene. Listening to
    // BOTH events (matching CampScene's SHUTDOWN-only precedent plus this
    // scene's own DESTROY safety net) guarantees `this.unsubscribe` is torn
    // down before the store's next `setServer` can fire `renderModel` on a
    // scene whose `this.add` has already gone null.
    const teardown = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.index.clearScene("between-camps");
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  private renderModel(): void {
    if (this.layer === null || this.unsubscribe === null) return;
    const model = this.sceneStore.getState().betweenModel;
    this.layer.removeAll(true);
    this.index.clearScene("between-camps");
    if (model === null) return;

    this.drawSign(model);

    if (model.runStatus !== "in_progress") {
      return;
    }

    if (model.draftOffer !== null) {
      this.drawDraft(model.draftOffer);
    } else {
      this.drawOwned(model);
      this.drawPack(model);
      this.drawReady(model);
    }

    this.drawSeats(model);
  }

  private drawSign(model: BetweenCampsModel): void {
    if (this.layer === null) return;
    const bg = this.add.rectangle(SIGN_X + 70, SIGN_Y + 10, 148, 24, toPhaserColor(PALETTE.stump)).setOrigin(0.5);
    this.layer.add(bg);
    this.layer.add(this.add.bitmapText(SIGN_X + 4, SIGN_Y, WORLD_SIGN_FONT, model.sign.label));
    this.layer.add(
      this.add.bitmapText(
        SIGN_X + 4,
        SIGN_Y + 14,
        WORLD_LABEL_FONT,
        `Camp ${model.campNumber}/6  x${model.supplies}`,
      ),
    );
  }

  private drawDraft(draftOffer: NonNullable<BetweenCampsModel["draftOffer"]>): void {
    if (this.layer === null) return;
    const totalW = draftOffer.length * DRAFT_CARD_W + (draftOffer.length - 1) * DRAFT_CARD_GAP;
    const startX = Math.round(STAGE_W / 2 - totalW / 2);

    draftOffer.forEach((gear, i) => {
      const x = startX + i * (DRAFT_CARD_W + DRAFT_CARD_GAP);
      const y = DRAFT_ROW_Y;
      const container = this.add.container(x, y);
      const bg = this.add
        .rectangle(DRAFT_CARD_W / 2, DRAFT_CARD_H / 2, DRAFT_CARD_W, DRAFT_CARD_H, toPhaserColor(PALETTE.stump))
        .setInteractive({ useHandCursor: true });
      const name = this.add.bitmapText(6, 6, WORLD_LABEL_FONT, gear.name);
      const size = this.add.bitmapText(6, 20, WORLD_LABEL_FONT, `Size ${gear.size} - ${gear.window}`);
      container.add([bg, name, size]);
      container.setSize(DRAFT_CARD_W, DRAFT_CARD_H);
      bg.on("pointerdown", () => {
        this.sceneStore.getState().dispatch({ type: "pick-draft", gearId: gear.gearId });
      });
      bg.on("pointerover", () => {
        this.showTooltip(gear.text, x, y + DRAFT_CARD_H + 4);
      });
      bg.on("pointerout", () => this.clearTooltip());
      if (this.layer) this.layer.add(container);
      this.index.register("between-camps", gear.objectId, container);
    });
  }

  private tooltip: Phaser.GameObjects.BitmapText | null = null;

  private showTooltip(text: string, x: number, y: number): void {
    this.clearTooltip();
    if (this.layer === null || text.length === 0) return;
    this.tooltip = this.add.bitmapText(x, y, WORLD_LABEL_FONT, text);
    this.layer.add(this.tooltip);
  }

  private clearTooltip(): void {
    this.tooltip?.destroy();
    this.tooltip = null;
  }

  private drawOwned(model: BetweenCampsModel): void {
    if (this.layer === null) return;
    model.owned.forEach((item, i) => {
      const y = OWNED_START_Y + i * OWNED_ROW_H;
      const container = this.add.container(OWNED_X, y);
      const label = `${item.equipped ? "[x]" : "[ ]"} ${item.name} (${item.size})`;
      const text = this.add.bitmapText(0, 0, WORLD_LABEL_FONT, label).setOrigin(0, 0.5);
      if (item.equipped) {
        text.setTint(toPhaserColor(PALETTE.turn));
      } else if (!item.fits) {
        container.setAlpha(0.4);
      }
      container.add(text);
      container.setSize(text.width, text.height);
      container.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, -8, 160, 16), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
      container.on("pointerdown", () => {
        const equippedIds = model.owned.filter((o) => o.equipped).map((o) => o.gearId);
        const nextIds = item.equipped
          ? equippedIds.filter((id) => id !== item.gearId)
          : [...equippedIds, item.gearId];
        this.sceneStore.getState().dispatch({ type: "set-loadout", gearIds: nextIds });
      });
      this.layer!.add(container);
      this.index.register("between-camps", item.objectId, container);
    });
  }

  private drawPack(model: BetweenCampsModel): void {
    if (this.layer === null) return;
    const capacity = model.capacity ?? 0;
    this.layer.add(
      this.add.bitmapText(PACK_LABEL_X, PACK_LABEL_Y, WORLD_LABEL_FONT, `Pack ${model.capacityUsed}/${capacity}`),
    );
  }

  private drawReady(model: BetweenCampsModel): void {
    if (this.layer === null) return;
    if (model.youReady) return;
    const container = this.add.container(READY_X, READY_Y);
    const bg = this.add.rectangle(0, 0, READY_W, READY_H, toPhaserColor(PALETTE.stump));
    const text = this.add.bitmapText(0, 0, WORLD_LABEL_FONT, "Ready").setOrigin(0.5);
    container.add([bg, text]);
    container.setSize(READY_W, READY_H);
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", () => {
      this.sceneStore.getState().dispatch({ type: "ready" });
    });
    this.layer.add(container);
    this.index.register("between-camps", model.readyObjectId, container);
  }

  private drawSeats(model: BetweenCampsModel): void {
    if (this.layer === null) return;
    model.seats.forEach((seat, i) => {
      const y = SEAT_LIST_START_Y + i * SEAT_ROW_H;
      const status = seat.draftPending ? "drafting" : seat.ready ? "ready" : "not ready";
      const connectedGlyph = seat.connected ? "" : " (sleeping)";
      const label = `${seat.displayLabel}: ${status}${connectedGlyph}`;
      this.layer!.add(this.add.bitmapText(SEAT_LIST_X, y, WORLD_LABEL_FONT, label));
    });
  }
}
