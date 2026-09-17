export interface FuseTokenArtProps {
  size: number;
}

/**
 * D-18/D-20/BOARD-02: a fuse token's art — the owner's literal description
 * is the spec. A black disc (`--color-token-disc`, the same named token as
 * the clue disc) with a centered yellow explosion (`--color-suit-yellow`)
 * and an orange-red rim stroke (`--color-token-fuse-rim`, since neither
 * existing token matches "orange-red"). Inline SVG in the `suit-visuals.ts`
 * style (D-20) — never an image asset.
 *
 * Silhouette note: every `SUIT_VISUALS` entry (suit-visuals.ts) uses a
 * spike count of 6, 8 (or 8+8 for Black's double ring), 10, 12, 16 or 20
 * with at most a two-value outer-radius cycle. This explosion deliberately
 * uses a 9-spike silhouette with a three-value outer-radius cycle so it can
 * never read as one of the seven suit bursts — it is board furniture, not a
 * suit.
 *
 * `aria-hidden`/`focusable="false"`: the accessible fact this token
 * contributes is the remaining COUNT, rendered as text by `TokenColumn`
 * beside the column — never this art.
 */
const EXPLOSION_SPIKE_COUNT = 9;
const EXPLOSION_OUTER_RADII = [10, 8, 6] as const;
const EXPLOSION_INNER_RADIUS = 3;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Frozen at module load — deterministic trig, never recomputed per render. */
function explosionPath(): string {
  const totalVertices = EXPLOSION_SPIKE_COUNT * 2;
  const step = 360 / totalVertices;
  const segments: string[] = [];
  for (let i = 0; i < totalVertices; i++) {
    const angle = -90 + i * step;
    const isOuter = i % 2 === 0;
    const r = isOuter ? EXPLOSION_OUTER_RADII[(i / 2) % EXPLOSION_OUTER_RADII.length]! : EXPLOSION_INNER_RADIUS;
    const rad = (angle * Math.PI) / 180;
    const x = round(12 + r * Math.cos(rad));
    const y = round(12 + r * Math.sin(rad));
    segments.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
  }
  return `${segments.join(" ")} Z`;
}

const EXPLOSION_PATH = explosionPath();

export function FuseTokenArt({ size }: FuseTokenArtProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} focusable="false" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10.25"
        style={{ fill: "var(--color-token-disc)", stroke: "var(--color-token-fuse-rim)" }}
        strokeWidth={1.5}
      />
      <path d={EXPLOSION_PATH} style={{ fill: "var(--color-suit-yellow)" }} />
    </svg>
  );
}
