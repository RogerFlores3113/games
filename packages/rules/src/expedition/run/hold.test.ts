// Hold on between tricks (run/hold.ts): who may hold, what ends a hold, the
// refused lead, the absent seat's release, the dev bot, and a property that
// a camp driven with random holds still always finishes.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { currentActorSeatId } from "../camp";
import { defineItem, itemAbility } from "../content/source-def";
import { expeditionGame } from "../adapter/adapter";
import { toExpeditionPlayerView } from "../adapter/view";
import { botMove } from "../dev/autoplay";
import { absentSeatAction } from "./absent";
import { attemptOf, withAttempt } from "./attempt";
import { CATALOG } from "./catalog";
import { rulesFor } from "./compose";
import { holdLegality, holdingSeatIds } from "./hold";
import { advanceTo, enumerateLegalRunActions, setupRun, testCatalog } from "./run-test-support";
import { applyRunAction } from "./stages/registry";
import type { Catalog, RunAction, RunState } from "./types";
import { currentWindow } from "./windows";

const SEAT_IDS = ["p0", "p1", "p2", "p3"] as const;

// A between-tricks power that changes nothing, for the "an ability lets go" case.
const flare = defineItem({
  id: "test-flare",
  name: "Test Flare",
  rarity: "common",
  price: 2,
  uses: { kind: "per-camp" },
  text: "Nothing happens.",
  active: itemAbility({ window: "between-tricks", targets: [], apply: () => [] }),
});
const catalog = testCatalog({ items: { "test-flare": flare } });

function act(run: RunState, seatId: string, action: RunAction, cat: Catalog = catalog): RunState {
  const result = applyRunAction(run, seatId, action, cat);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

/** Four seats between tricks before the first lead; items mint in seat order. */
function between(items: Readonly<Record<string, readonly string[]>> = {}): RunState {
  return advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "hold-seed", catalog, items }), "between-tricks", catalog);
}

function leaderOf(run: RunState): string {
  return currentActorSeatId(attemptOf(run)!.camp, rulesFor(run, catalog))!;
}

function others(run: RunState): string[] {
  return run.seatIds.filter((id) => id !== leaderOf(run));
}

function lead(run: RunState) {
  const leader = leaderOf(run);
  const card = rulesFor(run, catalog).legalPlays(attemptOf(run)!.camp, leader)[0]!;
  return applyRunAction(run, leader, { type: "play-card", cardId: card.id }, catalog);
}

function playTrick(run: RunState): RunState {
  return run.seatIds.reduce((next) => {
    const actor = currentActorSeatId(attemptOf(next)!.camp, rulesFor(next, catalog))!;
    const card = rulesFor(next, catalog).legalPlays(attemptOf(next)!.camp, actor)[0]!;
    return act(next, actor, { type: "play-card", cardId: card.id });
  }, run);
}

describe("Hold on", () => {
  it("a seat off lead holds, and the lead is refused waiting_on_hold until it lets go", () => {
    const run = between();
    const holder = others(run)[0]!;
    const held = act(run, holder, { type: "hold" });
    expect(holdingSeatIds(held, catalog)).toEqual([holder]);
    expect(lead(held)).toEqual({ ok: false, error: "waiting_on_hold" });

    const released = act(held, holder, { type: "skip-window" });
    expect(holdingSeatIds(released, catalog)).toEqual([]);
    expect(lead(released).ok).toBe(true);
  });

  it("the lead waits on every holder", () => {
    const run = between();
    const [a, b] = others(run);
    const both = act(act(run, a!, { type: "hold" }), b!, { type: "hold" });
    expect([...holdingSeatIds(both, catalog)].sort()).toEqual([a!, b!].sort());
    const one = act(both, a!, { type: "skip-window" });
    expect(lead(one)).toEqual({ ok: false, error: "waiting_on_hold" });
    expect(lead(act(one, b!, { type: "skip-window" })).ok).toBe(true);
  });

  it("a seat may hold once per gap, the seat on lead never, and only between tricks", () => {
    const run = between();
    const holder = others(run)[0]!;
    expect(applyRunAction(run, leaderOf(run), { type: "hold" }, catalog)).toEqual({ ok: false, error: "hold_unavailable" });
    const held = act(run, holder, { type: "hold" });
    expect(applyRunAction(held, holder, { type: "hold" }, catalog)).toEqual({ ok: false, error: "hold_unavailable" });
    const released = act(held, holder, { type: "skip-window" });
    expect(applyRunAction(released, holder, { type: "hold" }, catalog)).toEqual({ ok: false, error: "hold_unavailable" });

    const inTrick = (lead(released) as { ok: true; state: RunState }).state;
    expect(currentWindow(inTrick, rulesFor(inTrick, catalog))).toBe("in-trick");
    const follower = others(inTrick).find((id) => id !== leaderOf(released))!;
    expect(applyRunAction(inTrick, follower, { type: "hold" }, catalog)).toEqual({ ok: false, error: "wrong_window" });

    const picking = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "hold-seed", catalog }), "objective-pick", catalog);
    expect(applyRunAction(picking, "p1", { type: "hold" }, catalog)).toEqual({ ok: false, error: "wrong_window" });
  });

  it("the next gap starts clean: the same seat may hold again", () => {
    const run = between();
    const holder = others(run)[0]!;
    const once = act(act(run, holder, { type: "hold" }), holder, { type: "skip-window" });
    // One open trick-count objective, so the first trick decides nothing.
    const attempt = attemptOf(once)!;
    const open = withAttempt(once, { ...attempt, camp: { ...attempt.camp, objectives: [{ id: "one", kind: "exactly-n", n: 1, ownerSeatId: "p0" }] } });
    const next = playTrick(open);
    expect(currentWindow(next, rulesFor(next, catalog))).toBe("between-tricks");
    const again = leaderOf(next) === holder ? others(next)[0]! : holder;
    expect(holdLegality(next, again, catalog)).toEqual({ legal: true });
    expect(holdingSeatIds(act(next, again, { type: "hold" }), catalog)).toEqual([again]);
  });

  it("a whisper lets go of the whisperer's hold", () => {
    const run = between();
    const holder = others(run)[0]!;
    const held = act(run, holder, { type: "hold" });
    const card = attemptOf(held)!.camp.hands.find((h) => h.seatId === holder)!.cards[0]!;
    const whispered = act(held, holder, { type: "whisper", targetSeatId: leaderOf(held), cardId: card.id });
    expect(holdingSeatIds(whispered, catalog)).toEqual([]);
    expect(lead(whispered).ok).toBe(true);
  });

  it("an ability lets go of its user's hold, and a ledger keeps both entries at the gap", () => {
    const probe = between();
    const holder = others(probe)[0]!;
    const run = between({ [holder]: ["test-flare"] });
    const held = act(run, holder, { type: "hold" });
    const key = run.seats.find((s) => s.seatId === holder)!.equipped[0]!;
    const used = act(held, holder, { type: "use-ability", sourceKey: key, targets: [] });
    expect(holdingSeatIds(used, catalog)).toEqual([]);
    const at = { camp: 1, attempt: 1, trick: 0 };
    expect(used.seats.find((s) => s.seatId === holder)!.ledger).toEqual([
      { kind: "held", at },
      { kind: "used", sourceKey: key, at },
      { kind: "released", at },
    ]);
  });

  it("skip-window between tricks with no hold is still wrong_window", () => {
    const run = between();
    expect(applyRunAction(run, others(run)[0]!, { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "wrong_window" });
  });

  it("the view names the holders, empties the leader's legal cards and says who may hold", () => {
    const run = between();
    const leader = leaderOf(run);
    const holder = others(run)[0]!;
    const attemptView = (state: RunState, seatId: string) => {
      const stage = toExpeditionPlayerView(state, seatId, catalog).stage;
      if (stage.tag !== "camp") throw new Error("not in camp");
      return stage.attempt;
    };
    expect(attemptView(run, holder).youMayHold).toBe(true);
    expect(attemptView(run, leader).youMayHold).toBe(false);
    expect(attemptView(run, "watcher").youMayHold).toBe(false);
    expect(attemptView(run, leader).camp.yourLegalCardIds.length).toBeGreaterThan(0);

    const held = act(run, holder, { type: "hold" });
    for (const seatId of [...SEAT_IDS, "watcher"]) expect(attemptView(held, seatId).holdingSeatIds).toEqual([holder]);
    expect(attemptView(held, holder).youMayHold).toBe(false);
    expect(attemptView(held, leader).camp.yourLegalCardIds).toEqual([]);
  });
});

describe("Hold on never stalls the table", () => {
  it("an absent holder lets go through the room's pass, and nobody else is awaited", () => {
    const run = between();
    const holder = others(run)[0]!;
    const held = act(run, holder, { type: "hold" });
    expect(absentSeatAction(held, holder, catalog)).toEqual({ type: "skip-window" });
    for (const seatId of SEAT_IDS.filter((id) => id !== holder)) expect(absentSeatAction(held, seatId, catalog)).toBeNull();
    const passed = act(held, holder, absentSeatAction(held, holder, catalog)!);
    expect(holdingSeatIds(passed, catalog)).toEqual([]);
    expect(absentSeatAction(run, holder, catalog)).toBeNull();
  });

  it("the adapter's autoPassRequest lets go of an absent holder's hold", () => {
    const run = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "hold-seed", catalog: CATALOG }), "between-tricks", CATALOG);
    const holder = run.seatIds.find((id) => id !== currentActorSeatId(attemptOf(run)!.camp, rulesFor(run, CATALOG)))!;
    const held = expeditionGame.applyAction(run, holder, { type: "hold" });
    if (!held.ok) throw new Error(held.error);
    const request = expeditionGame.autoPassRequest!(held.state, holder);
    expect(request).toEqual({ type: "skip-window" });
    const passed = expeditionGame.applyAction(held.state, holder, request);
    expect(passed.ok && holdingSeatIds(passed.state, CATALOG)).toEqual([]);
  });

  it("the dev bot lets go of a hold on a seat it plays, then leads", () => {
    const run = between();
    const holder = others(run)[0]!;
    const held = act(run, holder, { type: "hold" });
    expect(botMove(held, [leaderOf(held)], catalog)).toBeNull();
    const first = botMove(held, SEAT_IDS, catalog);
    expect(first).toEqual({ seatId: holder, request: { type: "skip-window" } });
    const released = act(held, first!.seatId, first!.request);
    expect(botMove(released, SEAT_IDS, catalog)?.request.type).toBe("play-card");
  });

  it("property: a camp driven with random holds, releases, whispers and plays always finishes", () => {
    const camps = fc.record({
      seatCount: fc.constantFrom(3, 4, 5),
      seed: fc.string({ minLength: 1, maxLength: 12 }),
      choices: fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 48 }),
    });
    let heldSteps = 0;
    fc.assert(
      fc.property(camps, ({ seatCount, seed, choices }) => {
        const seatIds = Array.from({ length: seatCount }, (_, i) => `s${i}`);
        let state = advanceTo(setupRun({ seatIds, seed, catalog: CATALOG }), "objective-pick", CATALOG);
        const camp = state.stage.tag === "camp" ? state.stage.camp.index : null;
        // Each gap allows at most a hold and a release per seat, so a camp's
        // steps are bounded by its plays, picks and those.
        for (let step = 0; step < 2000; step++) {
          if (state.stage.tag !== "camp" || state.stage.camp.index !== camp || attemptOf(state)!.attemptNumber !== 1) return;
          const holding = holdingSeatIds(state, CATALOG);
          if (holding.length > 0) {
            heldSteps++;
            const actor = currentActorSeatId(attemptOf(state)!.camp, rulesFor(state, CATALOG))!;
            const card = attemptOf(state)!.camp.hands.find((h) => h.seatId === actor)!.cards[0]!;
            expect(applyRunAction(state, actor, { type: "play-card", cardId: card.id }, CATALOG)).toEqual({ ok: false, error: "waiting_on_hold" });
          }
          const legal = enumerateLegalRunActions(state, CATALOG, { holds: true });
          expect(legal.length).toBeGreaterThan(0);
          const picked = legal[choices[step % choices.length]! % legal.length]!;
          state = act(state, picked.seatId, picked.action, CATALOG);
        }
        throw new Error("the camp did not finish in 2000 steps");
      }),
      { numRuns: 12 },
    );
    // The driver did hold the table somewhere.
    expect(heldSteps).toBeGreaterThan(0);
  }, 60_000);
});
