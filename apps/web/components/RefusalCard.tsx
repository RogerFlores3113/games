/**
 * ONE shared refusal screen for both D-06 ("room full") and D-14
 * ("game in progress") — do not create two components (UI-SPEC §
 * "Component Notes", CONTEXT.md § "Specific Ideas"). Structurally
 * identical markup; only the copy differs, keyed by `reason`.
 *
 * No call-to-action button — there is nothing to retry into.
 */
export type RefusalCardReason = "full" | "in_progress";

const COPY: Record<RefusalCardReason, { heading: string; body: string }> = {
  full: {
    heading: "This room is full",
    body: "All 5 seats are taken. Ask the host to open a new room.",
  },
  in_progress: {
    heading: "This game is already in progress",
    body: "You can't join mid-game. Ask the host for a new room, or wait for this one to finish.",
  },
};

export interface RefusalCardProps {
  reason: RefusalCardReason;
}

export function RefusalCard({ reason }: RefusalCardProps) {
  const { heading, body } = COPY[reason];

  return (
    <div
      role="alert"
      data-testid="refusal-card"
      className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border-2 p-[length:var(--space-lg)] text-center"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-destructive)",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="32"
        height="32"
        fill="none"
        stroke="var(--color-destructive)"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="13" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h1
        className="text-[length:var(--text-heading)] font-semibold"
        style={{ color: "var(--color-text)", lineHeight: "var(--text-heading--line-height)" }}
      >
        {heading}
      </h1>
      <p
        className="text-[length:var(--text-body)]"
        style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
      >
        {body}
      </p>
    </div>
  );
}
