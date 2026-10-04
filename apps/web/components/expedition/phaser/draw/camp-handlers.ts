import type { PickEntity } from "../../../../lib/expedition/local-ui";

/** The click and hover callbacks every camp draw module wires to. */
export interface CampHandlers {
  /** A click on a card: selects it as a target or plays it. */
  onCard(cardId: string): void;
  /** The pointer went down on a hand card: a click or the start of a drag. */
  onCardPress(cardId: string): void;
  onCardHover(cardId: string | null): void;
  onObjective(objectiveId: string): void;
  onObjectiveHover(objectiveId: string | null): void;
  /** A click on a seat, a hand, a board card, the trick or the supplies
   * while targeting: picks it when the current step offers it. */
  onPick(entity: PickEntity, rawId: string): void;
  /** An option in the pick tray, by its choice id. */
  onTrayPick(choiceId: string): void;
  onTrayMore(): void;
  /** Your own character or kit source: starts its targeting. */
  onSource(sourceKey: string): void;
  onSourceHover(sourceKey: string | null): void;
  onMateSourceHover(mate: { seatId: string; sourceKey: string } | null): void;
  onWhisper(): void;
  onConfirm(): void;
  onCancel(): void;
  /** Use or pass in a gated window: before the deal, or a rescue. */
  onGateUse(sourceKey: string): void;
  onGateSkip(): void;
  onLastTrickHover(open: boolean): void;
}
