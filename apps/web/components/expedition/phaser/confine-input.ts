import type Phaser from "phaser";

/**
 * Phaser's default `input.windowEvents` also feeds every window-level
 * mousedown/touchstart that lands outside the canvas into the input
 * manager, so a click on an HTML overlay (dev panel, rules or settings
 * modal) presses the canvas button beneath it. The game config turns
 * window events off, and this puts back only the half that is wanted: a
 * mouseup outside the canvas, and only to finish a press that began on the
 * canvas (a drag released over an overlay).
 */
export function confineInputToCanvas(game: Phaser.Game): () => void {
  const canvas = game.canvas;
  let pressStartedOnCanvas = false;

  const onCanvasDown = () => {
    pressStartedOnCanvas = true;
  };
  const onWindowUp = (event: MouseEvent) => {
    const started = pressStartedOnCanvas;
    pressStartedOnCanvas = false;
    if (started && event.target !== canvas) game.input.mouse?.onMouseUpWindow(event);
  };

  canvas.addEventListener("mousedown", onCanvasDown);
  window.addEventListener("mouseup", onWindowUp);
  return () => {
    canvas.removeEventListener("mousedown", onCanvasDown);
    window.removeEventListener("mouseup", onWindowUp);
  };
}
