"use client";

import type { HanabiView } from "@games/rules";
import { disabledReasonFor, type ActionContext } from "../../lib/hanabi-visual-logic";
import { Button } from "../Button";

export interface CardActionsProps {
  game: HanabiView;
  selectedCardId: string | null;
  ctx: ActionContext;
  onPlay: () => void;
  onDiscard: () => void;
}

/**
 * D-16/D-18: Play and Discard are always rendered (never hidden), disabled
 * with a visible inline reason from disabledReasonFor, linked by
 * aria-describedby (RULES-11).
 */
export function CardActions({ game, selectedCardId, ctx, onPlay, onDiscard }: CardActionsProps) {
  const playReason = disabledReasonFor(game, { kind: "play", selectedCardId }, ctx);
  const discardReason = disabledReasonFor(game, { kind: "discard", selectedCardId }, ctx);

  return (
    <div className="flex flex-col items-center gap-[3px]">
      <div className="flex gap-[length:var(--space-xs)]">
        <div className="flex flex-col items-center gap-[length:var(--space-xs)]">
          <Button
            variant="ghost"
            data-testid="play-button"
            disabled={playReason !== null}
            aria-describedby={playReason !== null ? "action-reason-play" : undefined}
            onClick={onPlay}
          >
            Play
          </Button>
          {playReason !== null && (
            <p
              id="action-reason-play"
              data-testid="action-reason-play"
              className="text-[length:var(--text-label)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              {playReason}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-[length:var(--space-xs)]">
          <Button
            variant="ghost"
            data-testid="discard-button"
            disabled={discardReason !== null}
            aria-describedby={discardReason !== null ? "action-reason-discard" : undefined}
            onClick={onDiscard}
          >
            Discard
          </Button>
          {discardReason !== null && (
            <p
              id="action-reason-discard"
              data-testid="action-reason-discard"
              className="text-[length:var(--text-label)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              {discardReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
