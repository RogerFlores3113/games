"use client";

/**
 * Owns the `Phaser.Game` instance's lifecycle (RESEARCH.md Pattern 1):
 * `gameRef` + a `destroyed` flag guard React Strict Mode's dev-only
 * mount->unmount->mount double invocation so exactly one `Phaser.Game`
 * (and one WebGL/canvas context) is ever alive, and the game's full
 * teardown call below (canvas removed too) tears it fully down on unmount.
 * Only mount/unmount create/destroy the game — every server-view update
 * flows in through the already-running `store`, never through a new
 * `Phaser.Game`.
 *
 * The dev/test-only bridge is attached ONLY inside the literal, un-aliased
 * non-production build-mode check below (never refactor it into a variable
 * or helper — RESEARCH.md Pitfall 3) so Next's dead-code elimination can
 * statically prune the whole branch, including the dynamic import, from a
 * production bundle.
 */
import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { PALETTE, toPhaserColor } from "./palette";
import { CURSOR } from "./cursors";
import { SCENE_FACTORIES } from "./scenes/scene-registry";
import { ObjectIndex } from "./object-index";
import { createAudioDirector } from "./audio-director";
import { confineInputToCanvas } from "./confine-input";
import { computeZoom, isBelowComfortSize, STAGE_HEIGHT, STAGE_WIDTH } from "../../../lib/expedition/compute-zoom";
import type { ExpeditionSceneStore } from "../../../lib/expedition/expedition-scene-store";
import { DEV_PANEL_ENABLED } from "../../../lib/dev/dev-gate";
import { toolbarReserve, useToolbarRoom } from "../../../lib/dev/toolbar-room";

/** The strip kept free under the stage for the dev toolbar, when there is one. */
function devReserve(width: number, height: number): number {
  if (!DEV_PANEL_ENABLED) return 0;
  const reserve = toolbarReserve(width, height);
  useToolbarRoom.getState().setFits(reserve > 0);
  return reserve;
}

export interface ExpeditionPhaserMountProps {
  store: ExpeditionSceneStore;
}

function syncActiveScene(game: Phaser.Game, store: ExpeditionSceneStore): void {
  const sceneKey = store.getState().sceneKey;
  for (const key of Object.keys(SCENE_FACTORIES)) {
    const shouldRun = key === sceneKey;
    const running = game.scene.isActive(key);
    if (shouldRun && !running) {
      game.scene.start(key);
    } else if (!shouldRun && running) {
      game.scene.stop(key);
    }
  }
}

export default function ExpeditionPhaserMount({ store }: ExpeditionPhaserMountProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [zoom, setZoom] = useState(1);
  const [belowComfort, setBelowComfort] = useState(false);
  const [reserve, setReserve] = useState(0);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;
    let destroyed = false;
    let uninstallBridge: (() => void) | null = null;
    let uninstallDevPicks: (() => void) | null = null;

    const index = new ObjectIndex();
    const initialZoom = computeZoom(window.innerWidth, window.innerHeight);
    setZoom(initialZoom);
    setBelowComfort(isBelowComfortSize(window.innerWidth, window.innerHeight));
    setReserve(devReserve(window.innerWidth, window.innerHeight));

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: toPhaserColor(PALETTE.jungle),
      scale: { mode: Phaser.Scale.NONE, zoom: initialZoom },
      banner: false,
      input: { windowEvents: false },
    });
    gameRef.current = game;
    game.canvas.style.imageRendering = "pixelated";
    game.input.setDefaultCursor(CURSOR.default);
    const releaseInput = confineInputToCanvas(game);

    for (const [key, factory] of Object.entries(SCENE_FACTORIES)) {
      game.scene.add(key, factory({ store, index }), false);
    }

    const unsubscribeScene = store.subscribe((next, prev) => {
      if (next.sceneKey !== prev.sceneKey) syncActiveScene(game, store);
    });
    syncActiveScene(game, store);
    const audio = createAudioDirector(game, store);

    if (process.env.NODE_ENV !== "production") {
      void import("./test-bridge").then(({ installTestBridge }) => {
        if (destroyed) return;
        uninstallBridge = installTestBridge({ game, store, index });
      });
    }

    if (DEV_PANEL_ENABLED) {
      void import("./dev-picks").then(({ installDevPicks }) => {
        if (destroyed) return;
        uninstallDevPicks = installDevPicks(game, index, store);
      });
    }

    function handleResize() {
      const nextZoom = computeZoom(window.innerWidth, window.innerHeight);
      game.scale.setZoom(nextZoom);
      setZoom(nextZoom);
      setBelowComfort(isBelowComfortSize(window.innerWidth, window.innerHeight));
      setReserve(devReserve(window.innerWidth, window.innerHeight));
    }
    window.addEventListener("resize", handleResize);

    return () => {
      destroyed = true;
      window.removeEventListener("resize", handleResize);
      unsubscribeScene();
      releaseInput();
      audio.destroy();
      uninstallBridge?.();
      uninstallDevPicks?.();
      game.destroy(true);
      gameRef.current = null;
    };
  }, [store]);

  return (
    <div
      style={{
        display: "flex",
        width: "100dvw",
        height: `calc(100dvh - ${reserve}px)`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "8px",
        backgroundColor: PALETTE.letterbox,
      }}
    >
      <div data-testid="expedition-canvas-mount" data-zoom={zoom} ref={containerRef} />
      {belowComfort && (
        <p
          data-testid="expedition-enlarge-hint"
          style={{ color: "var(--color-text-muted)", fontSize: "var(--text-label, 0.875rem)", margin: 0 }}
        >
          Make the window bigger or zoom out for a larger table.
        </p>
      )}
    </div>
  );
}
