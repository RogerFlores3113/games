// Contract for the target-kind registry: per kind, at 3, 4 and 5 players,
// choices are stable, each resolves to itself, a foreign id is refused, and
// a view carrying every seat's steps passes the per-seat leak check.

import { describe, expect, it } from "vitest";
import { applyCampAction } from "../actions";
import { currentActorSeatId } from "../camp";
import type { CampState, Objective, StandardIdentity, TrickPlay } from "../state";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import { CATALOG } from "./catalog";
import { attemptOf, withAttempt } from "./attempt";
import { rulesFor } from "./compose";
import { applyRunAction } from "./stages/registry";
import { advanceTo, setupRun } from "./run-test-support";
import { TARGET_KINDS, choicesFor, resolveTargets, stepsFor, type SeatScope, type TargetSpec } from "./targets";
import { campIndex } from "./plan";
import { routeOptions } from "./route";
import type { RunAt, RunState } from "./types";

const SEED = "0123456789abcdef0123456789abcdef";

const SPECS: readonly TargetSpec[] = [
  { kind: "self" },
  { kind: "player", who: "teammate" },
  { kind: "player", who: "anyone" },
  { kind: "hand" },
  { kind: "card", where: "my-hand" },
  { kind: "card", where: "board" },
  { kind: "objective", whose: "unclaimed" },
  { kind: "objective", whose: "mine" },
  { kind: "completed-objective" },
  { kind: "failed-objective" },
  { kind: "whisper", which: "sent" },
  { kind: "whisper", which: "received" },
  { kind: "whisper", which: "overheard" },
  { kind: "won-trick" },
  { kind: "card-value", spread: 1 },
  { kind: "card-value", spread: 2 },
  { kind: "board" },
  { kind: "supplies" },
  { kind: "item", where: "equipped" },
  { kind: "item", where: "backpack" },
  { kind: "item", where: "any" },
  { kind: "route-option" },
  { kind: "fanned-card" },
  { kind: "objective-value", spread: 1 },
  { kind: "option", prompt: "Pick one", options: (scope) => ["first", `rolled${scope.roll("pick", 5)}`] },
];

/** The kinds whose choices exist only at a route vote. */
const AT_ROUTE: readonly TargetSpec["kind"][] = ["route-option"];

function scopeFor(run: RunState, seatId: string): SeatScope {
  return { run, seatId, camp: attemptOf(run)?.camp ?? null, rules: rulesFor(run, CATALOG), catalog: CATALOG };
}

function playOne(run: RunState): RunState {
  const camp = attemptOf(run)!.camp;
  const rules = rulesFor(run, CATALOG);
  const actor = currentActorSeatId(camp, rules)!;
  const played = applyCampAction(camp, actor, { type: "play-card", cardId: rules.legalPlays(camp, actor)[0]!.id }, rules);
  if (!played.ok) throw new Error(played.error);
  return withAttempt(run, { ...attemptOf(run)!, camp: played.state });
}

function standardTarget(play: TrickPlay): StandardIdentity | null {
  return play.card.identity.kind === "standard" ? play.card.identity : null;
}

/** One trick won, one card on the table, a whisper from each seat to the
 * next, and objectives crafted to be done, failed, pending (one per seat)
 * and unclaimed. */
function richState(playerCount: 3 | 4 | 5): RunState {
  const seatIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  const items = Object.fromEntries(seatIds.map((seatId) => [seatId, ["bait", "parrot", "whetstone"]]));
  let run = advanceTo(setupRun({ seatIds, seed: SEED, catalog: CATALOG, camp: 2, items }), "between-tricks", CATALOG);
  seatIds.forEach((seatId, i) => {
    const cardId = attemptOf(run)!.camp.hands.find((h) => h.seatId === seatId)!.cards[0]!.id;
    const whispered = applyRunAction(run, seatId, { type: "whisper", targetSeatId: seatIds[(i + 1) % playerCount]!, cardId }, CATALOG);
    if (!whispered.ok) throw new Error(whispered.error);
    run = whispered.state;
  });
  const perSeat = seatIds.map((seatId): Objective => ({ id: `obj-${seatId}`, kind: "exactly-n", n: 1, ownerSeatId: seatId }));
  run = withAttempt(run, { ...attemptOf(run)!, camp: { ...attemptOf(run)!.camp, objectives: perSeat } });
  for (let i = 0; i <= playerCount; i++) run = playOne(run);

  const camp: CampState = attemptOf(run)!.camp;
  const trick = camp.completedTricks[0]!;
  const winner = trick.winnerSeatId;
  const loser = seatIds.find((id) => id !== winner)!;
  const [doneTarget, failedTarget] = trick.plays.map(standardTarget).filter((t): t is StandardIdentity => t !== null);
  const inHand = camp.hands.flatMap((h) => h.cards).find((c) => c.identity.kind === "standard")!.identity as StandardIdentity;
  const objectives: Objective[] = [
    { id: "obj-done", kind: "win-card", target: doneTarget!, ownerSeatId: winner },
    { id: "obj-failed", kind: "win-card", target: failedTarget!, ownerSeatId: loser },
    { id: "obj-open", kind: "win-card", target: inHand, ownerSeatId: null },
    ...perSeat,
  ];
  return withAttempt(run, { ...attemptOf(run)!, camp: { ...camp, objectives } });
}

/** The route vote after camp 1, for the kinds that pick a route. */
function routeState(playerCount: 3 | 4 | 5): RunState {
  const seatIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  const base = setupRun({ seatIds, seed: SEED, catalog: CATALOG });
  const draft = { ...base, stage: { tag: "draft", next: campIndex(2) } } as RunAt<"draft">;
  return { ...base, stage: { tag: "route", from: campIndex(1), options: routeOptions(draft, campIndex(1), CATALOG), ballots: {} } };
}

describe("target-kind registry", () => {
  it("the contract specs cover every registered kind", () => {
    expect(new Set(SPECS.map((s) => s.kind))).toEqual(new Set(Object.keys(TARGET_KINDS)));
  });

  it("offers the expected choices on a concrete 3-player table", () => {
    const run = richState(3);
    const camp = attemptOf(run)!.camp;
    const winner = camp.completedTricks[0]!.winnerSeatId;
    const loser = ["p0", "p1", "p2"].find((id) => id !== winner)!;
    const ids = (seatId: string, spec: TargetSpec) => choicesFor(scopeFor(run, seatId), spec).map((c) => c.id);

    expect(ids("p0", { kind: "self" })).toEqual(["seat:p0"]);
    expect(ids("p0", { kind: "player", who: "teammate" })).toEqual(["seat:p1", "seat:p2"]);
    expect(ids("p0", { kind: "whisper", which: "sent" })).toEqual(["whisper:0"]);
    expect(ids("p0", { kind: "whisper", which: "received" })).toEqual(["whisper:2"]);
    expect(ids("p0", { kind: "whisper", which: "overheard" })).toEqual(["whisper:1"]);
    expect(ids(winner, { kind: "won-trick" })).toEqual(["trick:0"]);
    expect(ids(loser, { kind: "won-trick" })).toEqual([]);
    expect(ids("p0", { kind: "objective", whose: "unclaimed" })).toEqual(["objective:obj-open"]);
    expect(ids("p1", { kind: "objective", whose: "mine" })).toEqual(["objective:obj-p1"]);
    expect(ids("p0", { kind: "completed-objective" })).toEqual(["objective:obj-done"]);
    expect(ids("p0", { kind: "board" })).toEqual(["board"]);
    expect(choicesFor(scopeFor(run, "p0"), { kind: "supplies" })).toEqual([
      { id: "supplies", target: { kind: "supplies", current: 3, max: 4 } },
    ]);
    const failed = choicesFor(scopeFor(run, "p0"), { kind: "failed-objective" });
    expect(failed.map((c) => [c.id, c.target.kind === "failed-objective" && c.target.cardWinnerSeatId])).toEqual([
      ["objective:obj-failed", winner],
    ]);
  });

  it("card-value offers each other rank within the spread, inside 2..14", () => {
    const run = richState(3);
    const own = attemptOf(run)!.camp.hands.find((h) => h.seatId === "p0")!.cards;
    const card = own.find((c) => c.identity.kind === "standard")!;
    const rank = (card.identity as StandardIdentity).rank;
    const ids = choicesFor(scopeFor(run, "p0"), { kind: "card-value", spread: 2 }).map((c) => c.id).filter((id) => id.startsWith(`value:${card.id}:`));
    const expected = [rank - 2, rank - 1, rank + 1, rank + 2].filter((r) => r >= 2 && r <= 14).map((r) => `value:${card.id}:${r}`);
    expect(ids).toEqual(expected);
  });

  it("refuses a malformed or wrong-length id list", () => {
    const scope = scopeFor(richState(3), "p0");
    expect(resolveTargets(scope, [{ kind: "supplies" }], "supplies").ok).toBe(false);
    expect(resolveTargets(scope, [{ kind: "supplies" }], []).ok).toBe(false);
    expect(resolveTargets(scope, [{ kind: "supplies" }], ["supplies"])).toEqual({
      ok: true,
      targets: [{ kind: "supplies", current: 3, max: 4 }],
    });
  });

  for (const playerCount of [3, 4, 5] as const) {
    describe(`at ${playerCount} players`, () => {
      const camp = richState(playerCount);
      const atRoute = routeState(playerCount);
      const seatIds = camp.seatIds;

      for (const spec of SPECS) {
        const label = JSON.stringify(spec);
        const run = AT_ROUTE.includes(spec.kind) ? atRoute : camp;

        it(`${label}: some seat has a choice, and choices are stable`, () => {
          expect(seatIds.some((seatId) => choicesFor(scopeFor(run, seatId), spec).length > 0)).toBe(true);
          const roundTripped: RunState = JSON.parse(JSON.stringify(run));
          for (const seatId of seatIds) {
            const first = choicesFor(scopeFor(run, seatId), spec);
            expect(choicesFor(scopeFor(run, seatId), spec)).toEqual(first);
            expect(choicesFor(scopeFor(roundTripped, seatId), spec)).toEqual(first);
          }
        });

        it(`${label}: each choice resolves to itself and a foreign id is refused`, () => {
          const everyId = new Set(seatIds.flatMap((seatId) => SPECS.flatMap((s) => choicesFor(scopeFor(run, seatId), s).map((c) => c.id))));
          for (const seatId of seatIds) {
            const scope = scopeFor(run, seatId);
            const own = choicesFor(scope, spec);
            for (const choice of own) {
              expect(resolveTargets(scope, [spec], [choice.id])).toEqual({ ok: true, targets: [choice.target] });
            }
            const ownIds = new Set(own.map((c) => c.id));
            const foreign = [...everyId].filter((id) => !ownIds.has(id)).concat(["seat:nobody", "card:zzzzzzzz"]);
            for (const id of foreign) {
              expect(resolveTargets(scope, [spec], [id]).ok).toBe(false);
            }
          }
        });
      }

      it("a view carrying every seat's steps passes the leak check", () => {
        for (const run of [camp, atRoute]) for (const seatId of seatIds) {
          const view = toExpeditionPlayerView(run, seatId, CATALOG);
          const carrying = { ...view, steps: stepsFor(scopeFor(run, seatId), SPECS) };
          const secrets = secretsForExpeditionSeat(run, seatId, CATALOG, SEED);
          expect(checkExpeditionViewForLeaks({ view: carrying, serialized: JSON.stringify(carrying), secrets })).toEqual([]);
        }
      });
    });
  }
});
