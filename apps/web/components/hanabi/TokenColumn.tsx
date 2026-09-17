import { TOKEN_GAP_PX, tokenPitchPx } from "../../lib/layout-budget";
import { ClueTokenArt } from "./ClueTokenArt";
import { FuseTokenArt } from "./FuseTokenArt";

export interface TokenColumnProps {
  clueTokens: number;
  fusesRemaining: number;
  columnHeightPx: number;
}

/** A sensible upper bound so a small token count never renders oversized
 * discs — `tokenPitchPx` already guarantees the column never exceeds
 * `columnHeightPx` (see layout-budget.ts's derivation), so this clamp only
 * ever shrinks, never grows, the computed pitch. */
const TOKEN_DISC_MAX_PX = 22;
const TOKEN_DISC_MIN_PX = 4;

/**
 * D-16/D-18/D-19/BOARD-02/BOARD-03: the right-hand column of the tableau —
 * a vertical run of clue tokens (black disc, blue "?") and a vertical run
 * of fuse tokens (black disc, yellow explosion, orange-red rim) beside them
 * in the same column, per the owner's literal description.
 *
 * Spent tokens are REMOVED from the DOM entirely (BOARD-03, D-19) — never
 * faded or made transparent in place — with a text count retained alongside
 * for accessibility and for test assertions, always present even at zero.
 *
 * Pitfall 1 mitigation (RESEARCH.md): the disc size is derived FROM the
 * supplied `columnHeightPx` via `tokenPitchPx`, never the reverse — this
 * column never forces the left column (and therefore the page) to grow.
 */
export function TokenColumn({ clueTokens, fusesRemaining, columnHeightPx }: TokenColumnProps) {
  const totalTokens = clueTokens + fusesRemaining;
  const rawPitch = tokenPitchPx(columnHeightPx, totalTokens);
  const discSize = Math.max(TOKEN_DISC_MIN_PX, Math.min(rawPitch, TOKEN_DISC_MAX_PX));

  return (
    <div
      className="flex flex-col items-center justify-center gap-[length:var(--space-md)]"
      style={{ height: columnHeightPx }}
    >
      <div className="flex flex-col items-center gap-[length:var(--space-xs)]">
        <p
          data-testid="clue-tokens"
          data-count={clueTokens}
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          {clueTokens} clues left
        </p>
        <div aria-hidden="true" className="flex flex-col items-center" style={{ gap: TOKEN_GAP_PX }}>
          {Array.from({ length: clueTokens }, (_, i) => (
            <span key={i} data-testid="clue-token">
              <ClueTokenArt size={discSize} />
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-[length:var(--space-xs)]">
        <p
          data-testid="fuse-tokens"
          data-count={fusesRemaining}
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          {fusesRemaining} fuses left
        </p>
        <div aria-hidden="true" className="flex flex-col items-center" style={{ gap: TOKEN_GAP_PX }}>
          {Array.from({ length: fusesRemaining }, (_, i) => (
            <span key={i} data-testid="fuse-token">
              <FuseTokenArt size={discSize} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
