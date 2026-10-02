/** The click and hover callbacks every camp draw module wires to. */
export interface CampHandlers {
  onCard(cardId: string): void;
  onCardHover(cardId: string | null): void;
  onObjective(objectiveId: string): void;
  onObjectiveHover(objectiveId: string | null): void;
  onSeat(seatId: string): void;
  onGear(gearId: string): void;
  onGearHover(gearId: string | null): void;
  onMateGearHover(mate: { seatId: string; gearId: string } | null): void;
  onWhisper(): void;
  onConfirm(): void;
  onCancel(): void;
  onPreDealUse(gearId: string): void;
  onPreDealSkip(): void;
  onLastTrickHover(open: boolean): void;
}
