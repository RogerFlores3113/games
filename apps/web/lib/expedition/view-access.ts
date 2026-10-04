import type { ExpeditionAttemptView, ExpeditionCampView, ExpeditionLogEntryView, ExpeditionPlanBossView, ExpeditionView } from "@games/rules";

/**
 * Reads that every scene model shares: the dealt attempt, which camp the
 * crew is at or heading to, and how that camp is labelled. Pure display
 * transforms of the view.
 */

export function attemptOf(view: ExpeditionView): ExpeditionAttemptView | null {
  return view.stage.tag === "camp" ? view.stage.attempt : null;
}

/** The suit the current trick was led in, face up or face down; null
 * before the lead or when a joker led. */
export function ledSuit(camp: ExpeditionCampView): "spades" | "hearts" | "diamonds" | "clubs" | null {
  const lead = camp.currentTrick.plays[0];
  if (lead === undefined) return null;
  if (lead.hidden) return lead.suit === "joker" ? null : lead.suit;
  return lead.card.identity.kind === "standard" ? lead.card.identity.suit : null;
}

/** The attempt's whispers in order; a whisper always has a sender. */
export function whisperLog(view: ExpeditionView): (ExpeditionLogEntryView & { actorSeatId: string })[] {
  return (attemptOf(view)?.log ?? []).filter((l): l is ExpeditionLogEntryView & { actorSeatId: string } => l.event === "whisper" && l.actorSeatId !== null);
}

/** The camp the crew is at, or the next one it heads to; null at muster and
 * once the run ends. */
export function focusCampIndex(view: ExpeditionView): number | null {
  const stage = view.stage;
  switch (stage.tag) {
    case "loadout":
    case "camp":
      return stage.camp.index;
    case "draft":
      return stage.cleared + 1;
    case "route":
      return stage.options[0]?.next.index ?? null;
    case "event":
      return stage.next.index;
    case "muster":
    case "ended":
      return null;
  }
}

export function plannedBossAt(view: ExpeditionView, index: number): ExpeditionPlanBossView | null {
  return view.plan.find((boss) => boss.at === index) ?? null;
}

const TIER_LABEL: Readonly<Record<ExpeditionPlanBossView["tier"], string>> = {
  animal: "Animal boss",
  disaster: "Disaster boss",
  temple: "The Temple",
};

/** "Animal boss", "Disaster boss", "The Temple"; null for a plain camp. */
export function bossLabel(view: ExpeditionView, index: number): string | null {
  const boss = plannedBossAt(view, index);
  return boss === null ? null : TIER_LABEL[boss.tier];
}

/** "Camp 3 of 6 - Animal boss", or "Choosing the run" at muster. */
export function campHeadline(view: ExpeditionView): string {
  const index = focusCampIndex(view);
  if (index === null || view.campCount === null) return view.stage.tag === "muster" ? "Choosing the run" : "";
  const boss = bossLabel(view, index);
  return boss === null ? `Camp ${index} of ${view.campCount}` : `Camp ${index} of ${view.campCount} - ${boss}`;
}

/** Location and weather ids read as words until the camp modifiers bring
 * their own names: "jungle" reads "Jungle". */
export function modName(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
