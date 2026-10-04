// Full-information summary of a run for the dev panel. Seat ids stay raw.

import { currentActorSeatId, checkCampOutcome } from "../camp";
import { cardLabel } from "../deck";
import { describeObjective, evaluateObjective } from "../objectives";
import { rulesFor } from "../run/compose";
import { runPhase, runStatus } from "../run/lifecycle";
import type { Catalog, RunState } from "../run/types";
import type { DevInspectSection } from "../../adapter";

export function inspectRun(run: RunState, catalog: Catalog): DevInspectSection[] {
  const sections: DevInspectSection[] = [
    {
      title: "Run",
      lines: [
        `camp ${run.campNumber}, attempt ${run.attempt?.attemptNumber ?? "none"}, supplies ${run.supplies}`,
        `phase ${runPhase(run)}, status ${runStatus(run)}`,
        `history: ${run.history.map((h) => `${h.campNumber}.${h.attemptNumber} ${h.status}`).join(", ") || "empty"}`,
      ],
    },
    {
      title: "Crew",
      lines: run.seats.map(
        (s) =>
          `${s.seatId}: ${s.characterId ?? "no character"}, kit [${s.kit.join(", ")}], offer [${(s.draftOffer ?? []).join(", ")}], ${run.readySeatIds.includes(s.seatId) ? "ready" : "not ready"}`,
      ),
    },
  ];

  const camp = run.attempt?.camp;
  if (camp === undefined) return sections;
  const rules = rulesFor(run, catalog);

  sections.push({
    title: "Hands",
    lines: camp.hands.map((h) => `${h.seatId}: ${h.cards.map((c) => `${cardLabel(c.identity)} (${c.id})`).join(" ") || "empty"}`),
  });
  sections.push({
    title: "Objectives",
    lines: [
      `camp outcome: ${checkCampOutcome(camp, rules).status}`,
      ...camp.objectives.map((o) => `${o.id}: ${describeObjective(o)}, owner ${o.ownerSeatId ?? "none"}, ${evaluateObjective(camp, o)}`),
    ],
  });
  sections.push({
    title: "Trick",
    lines: [
      `trick ${camp.currentTrick.index + 1} of ${camp.totalTricks}, ${camp.completedTricks.length} completed, leader ${camp.currentTrick.leaderSeatId}`,
      `played: ${camp.currentTrick.plays.map((p) => `${p.seatId} ${cardLabel(p.card.identity)}`).join(", ") || "nothing"}`,
      `current actor: ${currentActorSeatId(camp, rules) ?? "none"}`,
    ],
  });
  return sections;
}
