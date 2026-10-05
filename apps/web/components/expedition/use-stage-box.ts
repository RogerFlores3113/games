"use client";

import { useEffect, useState } from "react";
import { STAGE_WIDTH } from "../../lib/expedition/compute-zoom";

/** Where the Phaser stage sits on the page: its canvas's top-left and its
 * whole-number zoom, so an HTML overlay can sit in a stage rectangle. */
export interface StageBox {
  left: number;
  top: number;
  zoom: number;
}

const MOUNT_SELECTOR = '[data-testid="expedition-canvas-mount"]';

/** The stage's box, measured from the canvas once it exists and again
 * whenever the window or the canvas changes size; null before then. */
export function useStageBox(): StageBox | null {
  const [box, setBox] = useState<StageBox | null>(null);
  useEffect(() => {
    let frame = 0;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const mount = document.querySelector<HTMLElement>(MOUNT_SELECTOR);
      const canvas = mount?.querySelector("canvas");
      if (!mount || !canvas) return false;
      const rect = canvas.getBoundingClientRect();
      // The canvas's own width, not the mount's data-zoom, which React sets a render later.
      const zoom = Math.max(1, Math.round(rect.width / STAGE_WIDTH));
      setBox((prev) => (prev?.left === rect.left && prev.top === rect.top && prev.zoom === zoom ? prev : { left: rect.left, top: rect.top, zoom }));
      return true;
    };
    const waitForCanvas = () => {
      if (!measure()) {
        frame = requestAnimationFrame(waitForCanvas);
        return;
      }
      observer = new ResizeObserver(() => measure());
      observer.observe(document.querySelector(MOUNT_SELECTOR)!);
    };
    const onResize = () => requestAnimationFrame(() => measure());
    waitForCanvas();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return box;
}
