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
 * D-16/D-18: Play and Discard are always rendered (never hidden). RULES-11
 * ("illegal actions are visibly unavailable") is satisfied by the disabled
 * state itself — a visible, standard affordance. UAT gap 15 (second owner
 * review): the inline disabled-reason text ("Select a card in your hand
 * first", "Clue tokens are full…") was obtrusive and has been deleted along
 * with its rendering and its `aria-describedby` link; `disabledReasonFor` is
 * still used to compute WHETHER the button is disabled, just not to render
 * a caption. Each button still gets a real `aria-label` for the disabled
 * reason, kept out of the visual flow but still in the accessible name.
 */
export function CardActions({ game, selectedCardId, ctx, onPlay, onDiscard }: CardActionsProps) {
  const playReason = disabledReasonFor(game, { kind: "play", selectedCardId }, ctx);
  const discardReason = disabledReasonFor(game, { kind: "discard", selectedCardId }, ctx);

  return (
    <div className="flex gap-[length:var(--space-xs)]">
      <Button
        variant="ghost"
        data-testid="play-button"
        disabled={playReason !== null}
        aria-label={playReason !== null ? `Play (${playReason})` : "Play"}
        onClick={onPlay}
      >
        Play
      </Button>

      <Button
        variant="ghost"
        data-testid="discard-button"
        disabled={discardReason !== null}
        aria-label={discardReason !== null ? `Discard (${discardReason})` : "Discard"}
        onClick={onDiscard}
      >
        Discard
      </Button>
    </div>
  );
}
