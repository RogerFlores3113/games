"use client";

import { useEffect, useState } from "react";
import { computeBoardZoom } from "../../lib/board-zoom";

/**
 * UAT gap 11: tracks the live viewport and returns the current board zoom
 * factor (1 at/under the 1280x720 floor, growing on a larger window). Reacts
 * to `resize` so a window drag/OS display change rescales live, matching a
 * real browser page-zoom. `useState(1)` is the initializer (not the real
 * viewport) so SSR and first client render both match the 1280x720 floor
 * before the real viewport is measurable in a mount effect.
 */
export function useBoardZoom(): number {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    function update() {
      setZoom(computeBoardZoom(window.innerWidth, window.innerHeight));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return zoom;
}
