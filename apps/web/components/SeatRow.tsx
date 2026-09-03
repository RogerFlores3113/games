import clsx from "clsx";

/**
 * Reused across the lobby and (later) Phase 6's in-game player list — kept
 * small and isolated per the UI-SPEC's "Component Notes". Props match the
 * spec exactly: `{name, connected, isHost, isSelf}`.
 */
export interface SeatRowProps {
  name: string;
  connected: boolean;
  isHost: boolean;
  isSelf: boolean;
  /** Optional, test-only observability hook — not part of the UI-SPEC's
   * required `{name, connected, isHost, isSelf}` shape. Exposed as a DOM
   * attribute only (never rendered as visible text) so Playwright specs can
   * identify which server-assigned seat a rendered row corresponds to
   * without parsing localStorage seat tokens (which are bearer credentials,
   * not seat identifiers). */
  seatId?: string;
}

export function SeatRow({ name, connected, isHost, isSelf, seatId }: SeatRowProps) {
  return (
    <div
      data-testid="seat-row"
      data-seat-id={seatId}
      data-self={isSelf ? "true" : "false"}
      data-connected={connected ? "true" : "false"}
      className={clsx(
        "flex items-center justify-between gap-[length:var(--space-sm)] rounded-md border px-[length:var(--space-sm)] py-[length:var(--space-sm)]",
        isSelf && "ring-2",
      )}
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        ...(isSelf ? { boxShadow: "0 0 0 2px var(--color-accent)" } : {}),
      }}
    >
      <div className="flex items-center gap-[length:var(--space-sm)]">
        <span
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          {name}
        </span>
        {isHost && (
          <span
            className="rounded px-[length:var(--space-xs)] text-[length:var(--text-label)] font-semibold"
            style={{
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              lineHeight: "var(--text-label--line-height)",
            }}
          >
            Host
          </span>
        )}
      </div>
      <div className="flex items-center gap-[length:var(--space-xs)]">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: connected ? "var(--color-status-connected)" : "var(--color-status-disconnected)",
          }}
        />
        <span
          className="text-[length:var(--text-label)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
    </div>
  );
}
