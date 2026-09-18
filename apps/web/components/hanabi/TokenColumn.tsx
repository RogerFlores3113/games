import {
  CLUE_TOKEN_COLUMNS,
  MAX_CLUE_TOKENS,
  MAX_FUSE_TOKENS,
  TOKEN_AREA_HEIGHT_PX,
  TOKEN_AREA_WIDTH_PX,
  TOKEN_DISC_PX,
  TOKEN_GAP_PX,
  tokenRunHeightPx,
} from "../../lib/layout-budget";
import { ClueTokenArt } from "./ClueTokenArt";
import { FuseTokenArt } from "./FuseTokenArt";

export interface TokenColumnProps {
  clueTokens: number;
  fusesRemaining: number;
}

const CLUE_RUN_HEIGHT_PX = tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS);
const FUSE_RUN_HEIGHT_PX = tokenRunHeightPx(MAX_FUSE_TOKENS, 1);

/**
 * D-16/D-18/D-19/BOARD-02/BOARD-03: the right-hand token area of the
 * tableau — a fixed grid of clue-token slots (black disc, blue-outlined "?")
 * beside a fixed column of fuse-token slots (black disc, yellow explosion,
 * orange-red rim), per the owner's literal description.
 *
 * Owner review (06.2-14, UAT gaps 1/4/5/6): the token area is now a FIXED
 * reservation, not one derived from a caller-supplied height. It always
 * renders `MAX_CLUE_TOKENS` clue slots (2 columns x 4 rows) and
 * `MAX_FUSE_TOKENS` fuse slots (1 column), each `TOKEN_DISC_PX` (40px, 2x
 * the pre-review 20px disc size) square, whether or not the token remains —
 * a spent token's slot stays reserved but empty (BOARD-03, D-19: removed
 * from the DOM, never dimmed or faded in place). The visible "{n} clues
 * left" / "{n} fuses left" text is gone from the board (UAT gap 6); it
 * survives only as an `sr-only` span inside the same fixed-size run
 * container so screen readers, `table-render.test.ts` and the Playwright
 * specs reading `textContent` all still see it.
 *
 * Filled slots are clamped to `MAX_CLUE_TOKENS`/`MAX_FUSE_TOKENS`
 * (T-06.2-35) so a malformed frame reporting an out-of-range count cannot
 * grow the reserved box past its fixed footprint.
 */
export function TokenColumn({ clueTokens, fusesRemaining }: TokenColumnProps) {
  const clueSlotsFilled = Math.max(0, Math.min(clueTokens, MAX_CLUE_TOKENS));
  const fuseSlotsFilled = Math.max(0, Math.min(fusesRemaining, MAX_FUSE_TOKENS));

  return (
    <div
      className="flex items-start"
      style={{ height: TOKEN_AREA_HEIGHT_PX, width: TOKEN_AREA_WIDTH_PX, gap: TOKEN_GAP_PX * 4 }}
    >
      <div data-testid="clue-tokens" data-count={clueTokens} style={{ height: CLUE_RUN_HEIGHT_PX }}>
        <div
          aria-hidden="true"
          className="grid"
          style={{ gridTemplateColumns: `repeat(${CLUE_TOKEN_COLUMNS}, ${TOKEN_DISC_PX}px)`, gap: TOKEN_GAP_PX }}
        >
          {Array.from({ length: MAX_CLUE_TOKENS }, (_, i) =>
            i < clueSlotsFilled ? (
              <span key={i} data-testid="clue-token" style={{ width: TOKEN_DISC_PX, height: TOKEN_DISC_PX }}>
                <ClueTokenArt size={TOKEN_DISC_PX} />
              </span>
            ) : (
              <span
                key={i}
                data-testid="clue-token-slot-empty"
                style={{ width: TOKEN_DISC_PX, height: TOKEN_DISC_PX }}
              />
            ),
          )}
        </div>
        <span className="sr-only">{clueTokens} clues left</span>
      </div>

      <div data-testid="fuse-tokens" data-count={fusesRemaining} style={{ height: FUSE_RUN_HEIGHT_PX }}>
        <div aria-hidden="true" className="flex flex-col" style={{ gap: TOKEN_GAP_PX }}>
          {Array.from({ length: MAX_FUSE_TOKENS }, (_, i) =>
            i < fuseSlotsFilled ? (
              <span key={i} data-testid="fuse-token" style={{ width: TOKEN_DISC_PX, height: TOKEN_DISC_PX }}>
                <FuseTokenArt size={TOKEN_DISC_PX} />
              </span>
            ) : (
              <span
                key={i}
                data-testid="fuse-token-slot-empty"
                style={{ width: TOKEN_DISC_PX, height: TOKEN_DISC_PX }}
              />
            ),
          )}
        </div>
        <span className="sr-only">{fusesRemaining} fuses left</span>
      </div>
    </div>
  );
}
