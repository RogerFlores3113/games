// Tests for the v1 table gear (Plan 10-10, GEAR-03): Trained Monkey
// (pickpocket.ts) and Machete (commandeer.ts, D-09).
//
// Fixtures are driven through applyRunAction (run-actions.ts) and the
// run-test-support helpers (setupRun/advanceTo/enumerateLegalRunActions),
// per this plan's own <interfaces> note. checkUseGear is called directly
// only where a test needs the GEAR-06 reason string that applyRunAction's
// AdapterResult does not carry.

import { describe, expect, it } from "vitest";
import { currentActorSeatId } from "../camp";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, enumerateLegalRunActions, setupRun } from "../run/run-test-support";
import { checkUseGear } from "../run/use-gear";
import { rulesFor } from "../run/compose";
import type { BossDef } from "../boss/boss-def";
import type { CampState } from "../state";
import type { Catalog, CampNumber, RunState } from "../run/types";
import { pickpocket } from "./pickpocket";
import { commandeer } from "./commandeer";

const SEAT_IDS = ["p0", "p1", "p2"] as const;
const SEED = "table-gear-seed";

const NO_BOSSES: Record<string, BossDef> = {};

function makeCatalog(): Catalog {
  return { gear: { pickpocket, commandeer }, bosses: NO_BOSSES };
}

function setup(opts: {
  campNumber: CampNumber;
  loadouts?: Readonly<Record<string, readonly string[]>>;
  seed?: string;
}): { run: RunState; catalog: Catalog } {
  const catalog = makeCatalog();
  const run = advanceTo(
    setupRun({
      seatIds: [...SEAT_IDS],
      seed: opts.seed ?? SEED,
      catalog,
      campNumber: opts.campNumber,
      loadouts: opts.loadouts ?? {},
    }),
    "between-tricks",
    catalog,
  );
  return { run, catalog };
}

function campCardMultiset(camp: CampState): string[] {
  const ids: string[] = [];
  for (const hand of camp.hands) for (const card of hand.cards) ids.push(card.id);
  for (const trick of camp.completedTricks) for (const play of trick.plays) ids.push(play.card.id);
  for (const play of camp.currentTrick.plays) ids.push(play.card.id);
  return ids.sort();
}

describe("Trained Monkey (pickpocket)", () => {
  function setupMonkey(seed?: string): { run: RunState; catalog: Catalog } {
    return setup({ campNumber: 2, loadouts: { p0: ["pickpocket"] }, seed });
  }

  it("swaps the chosen own card for a random card from the teammate's hand, conserving all cards", () => {
    const { run, catalog } = setupMonkey();
    const camp = run.attempt!.camp!;
    const p0Before = camp.hands.find((h) => h.seatId === "p0")!.cards;
    const p1Before = camp.hands.find((h) => h.seatId === "p1")!.cards;
    const ownCardId = p0Before[0]!.id;
    const beforeMultiset = campCardMultiset(camp);

    const result = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "pickpocket", targets: ["p1", ownCardId] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextCamp = result.state.attempt!.camp!;
    const p0After = nextCamp.hands.find((h) => h.seatId === "p0")!.cards;
    const p1After = nextCamp.hands.find((h) => h.seatId === "p1")!.cards;

    // The given-up card is now in p1's hand.
    expect(p1After.some((c) => c.id === ownCardId)).toBe(true);
    // p0 gained exactly one card that was previously in p1's hand.
    const gained = p0After.filter((c) => !p0Before.some((before) => before.id === c.id));
    expect(gained.length).toBe(1);
    expect(p1Before.some((c) => c.id === gained[0]!.id)).toBe(true);
    // Hand sizes unchanged.
    expect(p0After.length).toBe(p0Before.length);
    expect(p1After.length).toBe(p1Before.length);
    // Card conservation across the whole camp.
    expect(campCardMultiset(nextCamp)).toEqual(beforeMultiset);
  });

  it("is deterministic: the same state and seed give the same taken card", () => {
    const { run, catalog } = setupMonkey();
    const camp = run.attempt!.camp!;
    const ownCardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const r1 = applyRunAction(run, "p0", { type: "use-gear", gearId: "pickpocket", targets: ["p1", ownCardId] }, catalog);
    const r2 = applyRunAction(run, "p0", { type: "use-gear", gearId: "pickpocket", targets: ["p1", ownCardId] }, catalog);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const gained1 = r1.state.attempt!.camp!.hands
      .find((h) => h.seatId === "p0")!
      .cards.find((c) => c.id !== ownCardId && !camp.hands.find((h) => h.seatId === "p0")!.cards.some((b) => b.id === c.id));
    const gained2 = r2.state.attempt!.camp!.hands
      .find((h) => h.seatId === "p0")!
      .cards.find((c) => c.id !== ownCardId && !camp.hands.find((h) => h.seatId === "p0")!.cards.some((b) => b.id === c.id));
    expect(gained1!.id).toBe(gained2!.id);
  });

  it("is non-constant: at least two distinct taken-card positions across 30 seeds", () => {
    const positions = new Set<number>();

    for (let i = 0; i < 30; i++) {
      const { run, catalog } = setupMonkey(`table-gear-seed-${i}`);
      const camp = run.attempt!.camp!;
      const p1Before = camp.hands.find((h) => h.seatId === "p1")!.cards;
      const ownCardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

      const result = applyRunAction(
        run,
        "p0",
        { type: "use-gear", gearId: "pickpocket", targets: ["p1", ownCardId] },
        catalog,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const p1After = result.state.attempt!.camp!.hands.find((h) => h.seatId === "p1")!.cards;
      // The card p1 kept from before, minus the one it lost (ownCardId is
      // now added in, so find which original position is now missing).
      const takenIndex = p1Before.findIndex((c) => !p1After.some((a) => a.id === c.id));
      positions.add(takenIndex);
    }

    expect(positions.size).toBeGreaterThanOrEqual(2);
  });

  it("a card id from a third seat's hand as the teammate's card is invalid_target", () => {
    const { run, catalog } = setupMonkey();
    const camp = run.attempt!.camp!;
    const p2CardId = camp.hands.find((h) => h.seatId === "p2")!.cards[0]!.id;

    const result = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "pickpocket", targets: ["p1", p2CardId] },
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_target");
  });

  it("targeting p0 (self) as the teammate is invalid_target", () => {
    const { run, catalog } = setupMonkey();
    const camp = run.attempt!.camp!;
    const ownCardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const result = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "pickpocket", targets: ["p0", ownCardId] },
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_target");
  });

  it("a target whose hand is emptied gives the reason 'They have no cards'", () => {
    const { run, catalog } = setupMonkey();
    const camp = run.attempt!.camp!;
    const ownCardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const emptiedCamp: CampState = {
      ...camp,
      hands: camp.hands.map((h) => (h.seatId === "p1" ? { ...h, cards: [] } : h)),
    };
    const emptiedRun: RunState = { ...run, attempt: { ...run.attempt!, camp: emptiedCamp } };

    const result = checkUseGear(emptiedRun, "p0", "pickpocket", ["p1", ownCardId], catalog);

    expect(result).toEqual({ ok: false, error: "gear_unavailable", reason: "They have no cards" });
  });
});

describe("Machete (commandeer, D-09)", () => {
  /** Discovers the expedition leader via a probe run sharing the same
   * seed/campNumber (dealing/leaderFor never depend on loadouts), then
   * builds the real fixture with `commandeer` equipped to a seat that is
   * NOT that leader ("M"), advanced to between-tricks BEFORE trick 1. */
  function setupMachete(): { run: RunState; catalog: Catalog; leaderSeatId: string; mSeatId: string } {
    const catalog = makeCatalog();
    const probe = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber: 2 }),
      "between-tricks",
      catalog,
    );
    const leaderSeatId = probe.attempt!.camp!.expeditionLeaderSeatId;
    const mSeatId = SEAT_IDS.find((id) => id !== leaderSeatId)!;

    const run = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber: 2, loadouts: { [mSeatId]: ["commandeer"] } }),
      "between-tricks",
      catalog,
    );
    return { run, catalog, leaderSeatId, mSeatId };
  }

  it("D-09: M becomes the next trick's leader before trick 1, without changing the expedition leader", () => {
    const { run, catalog, leaderSeatId, mSeatId } = setupMachete();
    const camp = run.attempt!.camp!;
    // Sanity: M is not the expedition leader, and no trick has been played yet.
    expect(camp.expeditionLeaderSeatId).toBe(leaderSeatId);
    expect(camp.currentTrick.leaderSeatId).toBe(leaderSeatId);
    expect(camp.completedTricks.length).toBe(0);

    const result = applyRunAction(run, mSeatId, { type: "use-gear", gearId: "commandeer", targets: [] }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextCamp = result.state.attempt!.camp!;
    const rules = rulesFor(result.state, catalog);
    expect(nextCamp.currentTrick.leaderSeatId).toBe(mSeatId);
    expect(nextCamp.expeditionLeaderSeatId).toBe(leaderSeatId);
    expect(currentActorSeatId(nextCamp, rules)).toBe(mSeatId);
  });

  it("the expedition leader holding a Machete gets 'You already lead the next trick'", () => {
    const catalog = makeCatalog();
    const probe = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber: 2 }),
      "between-tricks",
      catalog,
    );
    const leaderSeatId = probe.attempt!.camp!.expeditionLeaderSeatId;

    const run = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber: 2, loadouts: { [leaderSeatId]: ["commandeer"] } }),
      "between-tricks",
      catalog,
    );

    const check = checkUseGear(run, leaderSeatId, "commandeer", [], catalog);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("You already lead the next trick");
  });

  it("after Machete, the trick completes normally with M as leader and a valid winner (WR-05)", () => {
    const { run, catalog, mSeatId } = setupMachete();

    const used = applyRunAction(run, mSeatId, { type: "use-gear", gearId: "commandeer", targets: [] }, catalog);
    expect(used.ok).toBe(true);
    if (!used.ok) return;

    let state = used.state;
    for (let i = 0; i < SEAT_IDS.length; i++) {
      const legal = enumerateLegalRunActions(state, catalog);
      const play = legal.find((candidate) => candidate.action.type === "play-card")!;
      const result = applyRunAction(state, play.seatId, play.action, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }

    const completed = state.attempt!.camp!.completedTricks[0]!;
    expect(completed.leaderSeatId).toBe(mSeatId);
    expect(completed.plays.some((p) => p.seatId === completed.winnerSeatId)).toBe(true);
  });

  it("D-13: after M plays the first card, a whisper by any seat is wrong_window", () => {
    const { run, catalog, mSeatId } = setupMachete();

    const used = applyRunAction(run, mSeatId, { type: "use-gear", gearId: "commandeer", targets: [] }, catalog);
    expect(used.ok).toBe(true);
    if (!used.ok) return;

    const legal = enumerateLegalRunActions(used.state, catalog);
    const play = legal.find((candidate) => candidate.action.type === "play-card")!;
    const played = applyRunAction(used.state, play.seatId, play.action, catalog);
    expect(played.ok).toBe(true);
    if (!played.ok) return;

    const cardId = played.state.attempt!.camp!.hands.find((h) => h.seatId !== mSeatId)!.cards[0]!.id;
    const whispered = applyRunAction(
      played.state,
      SEAT_IDS.find((id) => id !== mSeatId)!,
      { type: "whisper", targetSeatId: mSeatId, cardId },
      catalog,
    );
    expect(whispered.ok).toBe(false);
    if (whispered.ok) return;
    expect(whispered.error).toBe("wrong_window");
  });

  it("a second Machete use in a later between-tricks window is gear_already_used", () => {
    const { run, catalog, mSeatId } = setupMachete();

    const used = applyRunAction(run, mSeatId, { type: "use-gear", gearId: "commandeer", targets: [] }, catalog);
    expect(used.ok).toBe(true);
    if (!used.ok) return;

    let state = used.state;
    for (let i = 0; i < SEAT_IDS.length; i++) {
      const legal = enumerateLegalRunActions(state, catalog);
      const play = legal.find((candidate) => candidate.action.type === "play-card")!;
      const result = applyRunAction(state, play.seatId, play.action, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }

    // Now between tricks again (trick 0 completed, trick 1 not yet started).
    expect(state.attempt!.camp!.currentTrick.plays.length).toBe(0);

    const second = applyRunAction(state, mSeatId, { type: "use-gear", gearId: "commandeer", targets: [] }, catalog);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("gear_already_used");
  });
});
