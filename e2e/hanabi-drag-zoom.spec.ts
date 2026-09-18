import { expect, test } from "@playwright/test";
import { startTwoPlayerGame } from "./helpers";

/**
 * UAT gaps 27/28 (fourth owner review): "when i click + drag a tile, it
 * moves around 2x the speed of the cursor... when i drag around the pile
 * the tiles also move out of the way too far". The existing drag e2e specs
 * (hanabi-table-polish.spec.ts) all run at Playwright's default 1280x720
 * viewport, where `computeBoardZoom` returns exactly 1 (board-zoom.ts) —
 * that's exactly why the bug shipped unnoticed. This file's proofs run at
 * 1920x1080 (zoom 1.5, matching the owner's own report), and measure the
 * dragged tile's REAL on-screen position via `boundingBox()` mid-drag
 * (before `pointerup`), never just the final drop outcome — hit-testing
 * (which resolves the final drop) was never affected by this bug (it
 * compares two post-zoom screen-pixel quantities, `event.clientX/Y` against
 * `getBoundingClientRect()`), only the VISUAL translate() feedback was.
 */
test.describe("Hanabi zoomed-viewport drag tracking (UAT gaps 27/28)", () => {
  test("gap 27: a dragged own-hand tile tracks the cursor 1:1 on screen at a 1.5x-zoomed viewport, not 1.5x too fast", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, passivePage } = await startTwoPlayerGame(hostPage, browser);

    const slot1AtFloor = await passivePage.getByTestId("own-hand-slot-1").boundingBox();
    if (!slot1AtFloor) throw new Error("missing own-hand-slot-1 bounding box at the floor");

    // Grow past the 1280x720 floor so computeBoardZoom returns 1.5 — the
    // owner's own reported resolution (1920x1080). Wait for the zoom-driven
    // relayout to actually grow the tile before measuring (mirrors
    // start-game.spec.ts's own UI-11 zoom-resize poll).
    await passivePage.setViewportSize({ width: 1920, height: 1080 });
    await expect
      .poll(async () => (await passivePage.getByTestId("own-hand-slot-1").boundingBox())?.width ?? 0)
      .toBeGreaterThan(slot1AtFloor.width * 1.2);

    const sourceBox = await passivePage.getByTestId("own-hand-slot-1").boundingBox();
    if (!sourceBox) throw new Error("missing own-hand-slot-1 bounding box at 1920x1080");
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };

    await passivePage.mouse.move(start.x, start.y);
    await passivePage.mouse.down();
    // Clear DRAG_THRESHOLD_PX (hanabi-drag-logic.ts) before any offset is
    // meaningfully tracked, matching dragLocatorTo's own convention.
    await passivePage.mouse.move(start.x + 10, start.y + 10, { steps: 2 });

    // A deliberately arbitrary screen-pixel delta — this point need not
    // land inside any registered drop zone, since the dragged tile's own
    // visual offset (OwnHandCard.tsx's `dragTransform`) tracks the raw
    // pointer position regardless of what it's hovering.
    const intendedDx = 130;
    const intendedDy = 45;
    await passivePage.mouse.move(start.x + intendedDx, start.y + intendedDy, { steps: 8 });

    // Mid-drag (pointer still down): the dragged tile's own bounding box
    // has moved by the `transform: translate()` useHandDrag/OwnHandCard
    // apply. Compare how far it ACTUALLY moved on screen against how far
    // the cursor moved — before the fix this travelled ~1.5x too far (the
    // board's own zoom factor at 1920x1080); after the fix it tracks the
    // cursor within a few px of rounding/step-interpolation slack.
    const draggedBoxMidDrag = await passivePage.getByTestId("own-hand-slot-1").boundingBox();
    if (!draggedBoxMidDrag) throw new Error("missing dragged tile bounding box mid-drag");
    const actualDx = draggedBoxMidDrag.x - sourceBox.x;
    const actualDy = draggedBoxMidDrag.y - sourceBox.y;

    expect(Math.abs(actualDx - intendedDx)).toBeLessThan(15);
    expect(Math.abs(actualDy - intendedDy)).toBeLessThan(15);
    // The pre-fix bug would have produced ~195/~67 (1.5x) here — assert
    // clear separation from that wrong answer too, not just proximity to
    // the right one.
    expect(Math.abs(actualDx - intendedDx * 1.5)).toBeGreaterThan(30);

    // Release somewhere off every registered slot/zone (top-left corner) so
    // the drop resolves to "none" — a no-op, leaving the passive player's
    // hand order untouched for a clean test boundary.
    await passivePage.mouse.move(10, 10, { steps: 4 });
    await passivePage.mouse.up();

    await contextB.close();
  });

  test("gap 28: a shifted-aside neighbor tile moves by the real measured slot pitch during a hand reorder drag, not 1.5x that", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, passivePage } = await startTwoPlayerGame(hostPage, browser);

    const slot1AtFloor = await passivePage.getByTestId("own-hand-slot-1").boundingBox();
    if (!slot1AtFloor) throw new Error("missing own-hand-slot-1 bounding box at the floor");

    await passivePage.setViewportSize({ width: 1920, height: 1080 });
    await expect
      .poll(async () => (await passivePage.getByTestId("own-hand-slot-1").boundingBox())?.width ?? 0)
      .toBeGreaterThan(slot1AtFloor.width * 1.2);

    // Static (pre-drag) positions — the real, measured on-screen slot
    // pitch this test compares the mid-drag shift against.
    const slot1Box0 = await passivePage.getByTestId("own-hand-slot-1").boundingBox();
    const slot2Box0 = await passivePage.getByTestId("own-hand-slot-2").boundingBox();
    if (!slot1Box0 || !slot2Box0) throw new Error("missing own-hand slot bounding boxes at 1920x1080");
    const realPitch = slot2Box0.x - slot1Box0.x;

    const start = { x: slot1Box0.x + slot1Box0.width / 2, y: slot1Box0.y + slot1Box0.height / 2 };
    const slot2Center = { x: slot2Box0.x + slot2Box0.width / 2, y: slot2Box0.y + slot2Box0.height / 2 };

    await passivePage.mouse.move(start.x, start.y);
    await passivePage.mouse.down();
    await passivePage.mouse.move(start.x + 10, start.y + 10, { steps: 2 });
    // Move directly over slot 2's own registered zone — resolveDropTarget
    // (hanabi-drag-logic.ts) resolves this to a reorder targeting slot 2's
    // index, so shiftOffsetsForDrag shifts slot 2 aside by exactly one
    // measured slot pitch (its own final/original index differ by 1) while
    // slot 3 and beyond stay put.
    await passivePage.mouse.move(slot2Center.x, slot2Center.y, { steps: 8 });

    // Mid-drag (pointer still down): slot 2's own bounding box moves via
    // the `.tile-shift` translateX wrapper (OwnHandCard.tsx), which
    // transitions over 150ms (globals.css) rather than jumping instantly —
    // poll until two consecutive reads agree (the transition has settled)
    // so this doesn't assert against an in-transition, partially
    // interpolated position.
    let previousX: number | null = null;
    let slot2BoxMidDrag: { x: number; y: number; width: number; height: number } | null = null;
    await expect
      .poll(
        async () => {
          const box = await passivePage.getByTestId("own-hand-slot-2").boundingBox();
          slot2BoxMidDrag = box;
          const settled = box !== null && previousX !== null && Math.abs(box.x - previousX) < 0.5;
          previousX = box?.x ?? null;
          return settled;
        },
        { intervals: [50, 50, 50, 50, 50, 50] },
      )
      .toBe(true);
    if (!slot2BoxMidDrag) throw new Error("missing own-hand-slot-2 bounding box mid-drag");
    const observedShift = slot2BoxMidDrag.x - slot2Box0.x;

    // The dragged card moves ahead of slot 2, so slot 2 shifts back toward
    // slot 1's old position by one pitch (a negative x shift). Before the
    // fix this travelled ~1.5x too far.
    expect(Math.abs(observedShift - -realPitch)).toBeLessThan(Math.max(10, realPitch * 0.1));
    expect(Math.abs(observedShift - -realPitch * 1.5)).toBeGreaterThan(realPitch * 0.2);

    await passivePage.mouse.up();
    await contextB.close();
  });
});
