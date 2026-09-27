// Registered solely to keep BOARD_COMPONENTS exhaustive over GameId (D-11)
// after Phase 11 registers Expedition in the production registry. Phase 12
// (SCENE-01) replaces this file with the dynamically-imported Phaser mount.
// The landing picker's Expedition option stays disabled ("coming soon")
// until then (D-12) — this component reads no game state and offers no
// actions.

import type { RoomView } from "@games/schema";

export function ExpeditionBoard({ view }: { view: RoomView }) {
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-sm, 0.5rem)",
        textAlign: "center",
      }}
    >
      <h1>{view.gameDisplayName}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        This table isn&apos;t ready to play in the browser yet.
      </p>
    </main>
  );
}
