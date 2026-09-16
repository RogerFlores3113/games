/**
 * D-05: renders while the VIEWER's own socket is degraded (non-terminal
 * close, half-open pong timeout, zombie-sweep close) but a view has already
 * been received — the last known board stays on screen with this banner
 * above it rather than dropping to the full-screen "Connecting…" page.
 *
 * Trap (UI-SPEC Component Notes): do not conflate this with a per-seat
 * "Disconnected" label. This banner answers "is MY connection to the server
 * currently degraded?" — the per-seat status on `HanabiBoard` answers "is
 * THIS named player currently reachable by the server?" They are different
 * signals rendered in different places; never merge them into one.
 *
 * No accent, no destructive color, no animation (Phase 6 restyles).
 */
export function ReconnectingBanner() {
  return (
    <div
      role="status"
      data-testid="reconnecting-banner"
      className="flex w-full max-w-md items-center gap-[length:var(--space-xs)] rounded-md border p-[length:var(--space-md)]"
      style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: "var(--color-status-disconnected)" }}
      />
      <span
        className="text-[length:var(--text-label)] font-semibold"
        style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
      >
        Reconnecting…
      </span>
    </div>
  );
}
