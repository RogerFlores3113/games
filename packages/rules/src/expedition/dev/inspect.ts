// Full-information summary of a run for the dev panel. Seat ids stay raw.

import { currentActorSeatId, checkCampOutcome } from "../camp";
import { cardLabel } from "../deck";
import { describeObjective } from "../objectives";
import { attemptOf } from "../run/attempt";
import { SUPPLIES_MAX } from "../run/balance";
import { rulesFor } from "../run/compose";
import { runStatus } from "../run/lifecycle";
import { campCount } from "../run/plan";
import { backpackOf } from "../run/usage";
import { campStack, modCtx, pairingOf, specOf } from "../run/stack";
import type { StatusPart } from "../content/mods/mod-def";
import type { CampSpec } from "../run/route";
import type { Catalog, PerSeat, RunState } from "../run/types";
import type { ResolvedPlay } from "../state";
import type { DevInspectSection } from "../../adapter";

function playLabel(play: ResolvedPlay): string {
  const countsAs = play.countsAs === null ? "" : ` as ${cardLabel(play.countsAs)}`;
  return `${play.seatId} ${cardLabel(play.card.identity)}${countsAs}${play.burned ? " (burned)" : ""}`;
}

function specLabel(spec: CampSpec, catalog: Catalog): string {
  const pairing = pairingOf(spec, catalog);
  return `camp ${spec.index}: ${spec.location}, ${spec.weather}${pairing === null ? "" : `, pairing ${pairing}`}, event ${spec.event ?? "none"}, slots [${spec.slots.map((s) => s.kind).join(", ")}]`;
}

function statusLabel(part: StatusPart): string {
  return part.kind === "chance" ? `${part.percent}% next, ${part.strikesLeft} strikes left` : "strike on this trick";
}

/** The camp's modifier stack in fold order with each layer's status, then
 * the attempt's effects with their origins. */
function stackLines(run: RunState, catalog: Catalog): string[] {
  const spec = specOf(run);
  if (spec === null) return [];
  const layers = campStack(run, catalog).map((layer) => {
    const status = layer.body.status?.(modCtx(run, spec, layer)) ?? [];
    return `mod ${layer.def.id} (${layer.def.kind}, ${layer.strength})${status.length === 0 ? "" : `: ${status.map(statusLabel).join("; ")}`}`;
  });
  const effects = (run.stage.tag === "camp" ? run.stage.attempt.effects : []).map((e) => {
    const origin = e.origin.kind === "seat" ? `${e.origin.seatId} ${e.origin.sourceId}` : `mod ${e.origin.modId}`;
    return `effect from ${origin} at trick ${e.atTrick + 1}, lasts ${e.lasts}${e.deferIfFatal ? ", waits if fatal" : ""}`;
  });
  return [...layers, ...effects];
}

function perSeat<V>(run: RunState, values: PerSeat<V>): string {
  return run.seatIds.map((seatId) => `${seatId} ${Object.hasOwn(values, seatId) ? String(values[seatId] ?? "abstain") : "-"}`).join(", ");
}

function stageLines(run: RunState, catalog: Catalog): string[] {
  const stage = run.stage;
  switch (stage.tag) {
    case "muster":
      return [`length ballots: ${perSeat(run, stage.ballots)}`];
    case "loadout":
      return [
        specLabel(stage.camp, catalog),
        `shop: ${stage.stock === null ? "closed" : stage.stock.map((e) => `${e.stockId} ${e.what.kind === "item" ? e.what.itemId : "supply"} ${e.price}${e.soldTo === null ? "" : ` sold to ${e.soldTo}`}`).join(", ")}`,
        `ready: ${perSeat(run, stage.ready)}`,
      ];
    case "camp":
      return [specLabel(stage.camp, catalog), `attempt ${stage.attempt.attemptNumber}`];
    case "draft":
      return [`cleared camp ${stage.cleared}, paid ${stage.payout}`];
    case "route":
      return [...stage.options.map((o) => `route ${o.id}: ${specLabel(o.next, catalog)}`), `route ballots: ${perSeat(run, stage.ballots)}`];
    case "event":
      return [`event ${stage.route.next.event ?? "none"} on route ${stage.route.id}`, specLabel(stage.route.next, catalog), `ready: ${perSeat(run, stage.ready)}`];
    case "ended":
      return [`run ${stage.result}`];
  }
}

export function inspectRun(run: RunState, catalog: Catalog): DevInspectSection[] {
  const vote = run.lastVote;
  const sections: DevInspectSection[] = [
    {
      title: "Run",
      lines: [
        `stage ${run.stage.tag}, status ${runStatus(run)}, ${run.plan === null ? "no plan yet" : `${run.plan.length} run of ${campCount(run.plan)} camps`}`,
        `supplies ${run.supplies} of ${SUPPLIES_MAX}, purse ${run.purse}, next item it${run.itemSerial}`,
        `bosses: ${run.plan?.bosses.map((b) => `${b.tier} at ${b.at} (${b.modId ?? "none drawn"})`).join(", ") || "none"}`,
        `history: ${run.history.map((h) => `${h.camp}.${h.attempt} ${h.status}${h.coins > 0 ? ` +${h.coins}` : ""}`).join(", ") || "empty"}`,
        `last vote: ${vote === null ? "none" : `${vote.topic} -> ${vote.result.winner}${vote.result.tied === null ? "" : ` (flip between ${vote.result.tied.join(", ")})`}`}`,
        ...stageLines(run, catalog),
        ...stackLines(run, catalog),
      ],
    },
    {
      title: "Crew",
      lines: run.seats.map((s) => {
        const item = (uid: string) => `${s.items.find((i) => i.uid === uid)?.itemId ?? "?"} ${uid}`;
        const offer = s.offers[0]?.bundles.map((bundle) => bundle.join(" + ")).join(" | ") ?? "none";
        return `${s.seatId}: ${s.characterId ?? "no character"}, upgrade ${s.upgradeId ?? "none"}, equipped [${s.equipped.map(item).join(", ")}], backpack [${backpackOf(s).map((i) => item(i.uid)).join(", ")}], offer ${offer}${s.offers.length > 1 ? ` (+${s.offers.length - 1} queued)` : ""}`;
      }),
    },
  ];

  const camp = attemptOf(run)?.camp;
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
      ...camp.objectives.map((o) => `${o.id}: ${describeObjective(o)}, owner ${o.ownerSeatId ?? "none"}, ${rules.objectiveStatus(camp, o)}`),
      ...rules.goals(camp).map((g) => `goal ${g.id}: ${g.status}`),
    ],
  });
  sections.push({
    title: "Trick",
    lines: [
      `trick ${camp.currentTrick.index + 1} of ${camp.totalTricks}, ${camp.completedTricks.length} completed, leader ${camp.currentTrick.leaderSeatId}`,
      `played: ${camp.currentTrick.plays.map((p) => `${p.seatId} ${cardLabel(p.card.identity)}`).join(", ") || "nothing"}`,
      ...camp.completedTricks.map((t) => `trick ${t.index + 1}: ${t.plays.map(playLabel).join(", ")}, ${t.winnerSeatId} won`),
      `discards: ${camp.discards.map((d) => `${cardLabel(d.card.identity)} after trick ${d.afterTrick}`).join(", ") || "none"}`,
      `current actor: ${currentActorSeatId(camp, rules) ?? "none"}`,
    ],
  });
  return sections;
}
