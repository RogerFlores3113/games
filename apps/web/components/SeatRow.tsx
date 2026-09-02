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
}

export function SeatRow({ name, connected, isHost, isSelf }: SeatRowProps) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-[length:var(--spacing-sm)] rounded-md border px-[length:var(--spacing-sm)] py-[length:var(--spacing-sm)]",
        isSelf && "ring-2",
      )}
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        ...(isSelf ? { boxShadow: "0 0 0 2px var(--color-accent)" } : {}),
      }}
    >
      <div className="flex items-center gap-[length:var(--spacing-sm)]">
        <span
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          {name}
        </span>
        {isHost && (
          <span
            className="rounded px-[length:var(--spacing-xs)] text-[length:var(--text-label)] font-semibold"
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
      <div className="flex items-center gap-[length:var(--spacing-xs)]">
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
