"use client";

import type { Clue, HanabiView, Rank } from "@games/rules";
import { RANKS } from "@games/rules";
import { clueTouchCountForTarget, cluableColorsForView } from "../../lib/hanabi-board-logic";
import { disabledReasonFor, type ActionContext } from "../../lib/hanabi-visual-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { Button } from "../Button";
import { SuitGlyph } from "./SuitGlyph";

export interface ClueTarget {
  seatId: string;
  label: string;
}

export interface CluePickerProps {
  game: HanabiView;
  targets: ClueTarget[];
  clueTarget: string | null;
  clueValue: Clue | null;
  ctx: ActionContext;
  onSelectTarget: (seatId: string) => void;
  onSelectValue: (clue: Clue) => void;
  onPreview: (clue: Clue | null) => void;
  onGive: () => void;
}

/**
 * D-16/D-17/D-18/D-19: target + color/rank grid, hover/focus preview,
 * disabled-with-reason for every value and the give-clue button.
 */
export function CluePicker({
  game,
  targets,
  clueTarget,
  clueValue,
  ctx,
  onSelectTarget,
  onSelectValue,
  onPreview,
  onGive,
}: CluePickerProps) {
  const cluableColors = cluableColorsForView(game);
  const clueReason = disabledReasonFor(game, { kind: "clue", targetSeatId: clueTarget, clue: clueValue }, ctx);

  function isValueDisabled(clue: Clue): boolean {
    if (ctx.reconnecting || ctx.ended || !game.isYourTurn || game.clueTokens <= 0) return true;
    if (clueTarget !== null && clueTouchCountForTarget(game, clueTarget, clue) === 0) return true;
    return false;
  }

  const zeroTouchTarget =
    clueTarget !== null && targets.find((t) => t.seatId === clueTarget)
      ? targets.find((t) => t.seatId === clueTarget)
      : undefined;
  const hasZeroTouchOption =
    clueTarget !== null &&
    !ctx.reconnecting &&
    !ctx.ended &&
    game.isYourTurn &&
    game.clueTokens > 0 &&
    (cluableColors.some((color) => clueTouchCountForTarget(game, clueTarget, { type: "color", value: color }) === 0) ||
      RANKS.some((rank) => clueTouchCountForTarget(game, clueTarget, { type: "rank", value: rank }) === 0));

  return (
    // fix(06.2): the "Clue" / "Color or rank" captions used to sit on their
    // own rows above each button group (four stacked rows before the reason
    // text), which alone cost ~210px at 5 players and forced the whole
    // bottom controls row onto a third wrapped line (UI-11). Both captions
    // now sit inline, at the start of their own button row, and "Give clue"
    // joins the value row instead of sitting on a row by itself — same
    // controls, same disabled-reason captions, two rows instead of four.
    <div className="flex flex-col items-center gap-[3px]">
      <div className="flex flex-wrap items-center justify-center gap-[length:var(--space-sm)]">
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          Clue
        </span>
        {targets.map((target) => (
          <Button
            key={target.seatId}
            variant="ghost"
            data-testid={"clue-target-" + target.seatId}
            aria-pressed={clueTarget === target.seatId}
            disabled={ctx.reconnecting || ctx.ended}
            onClick={() => onSelectTarget(target.seatId)}
            className={clueTarget === target.seatId ? "outline outline-2 outline-offset-2 outline-[var(--color-text)]" : undefined}
          >
            {target.label}
          </Button>
        ))}
      </div>

      {/* fix(06.2): tightened to gap-xs (from gap-sm) — with the label plus
          5 colors, 5 ranks, and the give-clue button all sharing this one
          row (13 items, 12 gaps), the 4px saved per gap is what lets this
          row fit beside AudioControls/toggles instead of wrapping to its
          own third line (UI-11). */}
      <div className="flex flex-wrap items-center justify-center gap-[length:var(--space-xs)]">
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          Color or rank
        </span>
        {cluableColors.map((color) => {
          const clue: Clue = { type: "color", value: color };
          return (
            <Button
              key={color}
              variant="ghost"
              data-testid={"clue-value-" + color}
              aria-pressed={clueValue?.type === "color" && clueValue.value === color}
              disabled={isValueDisabled(clue)}
              onMouseEnter={() => onPreview(clue)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(clue)}
              onBlur={() => onPreview(null)}
              onClick={() => onSelectValue(clue)}
            >
              <SuitGlyph suit={color} size={16} />
              {SUIT_VISUALS[color].label}
            </Button>
          );
        })}
        {RANKS.map((rank: Rank) => {
          const clue: Clue = { type: "rank", value: rank };
          return (
            <Button
              key={rank}
              variant="ghost"
              data-testid={"clue-value-" + rank}
              aria-pressed={clueValue?.type === "rank" && clueValue.value === rank}
              disabled={isValueDisabled(clue)}
              onMouseEnter={() => onPreview(clue)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(clue)}
              onBlur={() => onPreview(null)}
              onClick={() => onSelectValue(clue)}
            >
              {rank}
            </Button>
          );
        })}

        <Button
          variant="ghost"
          data-testid="give-clue-button"
          disabled={clueReason !== null}
          aria-describedby={clueReason !== null ? "action-reason-clue" : undefined}
          onClick={onGive}
        >
          Give clue
        </Button>
      </div>

      {hasZeroTouchOption && zeroTouchTarget && (
        <p
          data-testid="zero-touch-reason"
          className="text-[length:var(--text-label)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          {`Dimmed options wouldn't touch any of ${zeroTouchTarget.label}'s cards`}
        </p>
      )}
      {clueReason !== null && (
        <p
          id="action-reason-clue"
          data-testid="action-reason-clue"
          className="text-[length:var(--text-label)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          {clueReason}
        </p>
      )}
    </div>
  );
}
