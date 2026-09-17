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
    <div className="flex flex-col items-center gap-[3px]">
      <span
        className="text-[length:var(--text-label)] font-semibold"
        style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
      >
        Clue
      </span>
      <div className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
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

      <span
        className="text-[length:var(--text-label)] font-semibold"
        style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
      >
        Color or rank
      </span>
      <div className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
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

      <Button
        variant="ghost"
        data-testid="give-clue-button"
        disabled={clueReason !== null}
        aria-describedby={clueReason !== null ? "action-reason-clue" : undefined}
        onClick={onGive}
      >
        Give clue
      </Button>
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
