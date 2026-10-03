// Tests for the v1 objective gear (Plan 10-09, GEAR-02): Compass
// (reroll.ts), Trail Map (reassign.ts, D-10) and Camouflage (ghost.ts,
// D-11).
//
// Fixtures are driven through applyRunAction (run-actions.ts) and the
// run-test-support helpers (setupRun/advanceTo) wherever the behavior under
// test is a normal action sequence. Where a test needs a "spread" camp (a
// completed trick engineered to force an objective done, or to force a
// trick win) the plan's own instruction applies: build the CampState by
// hand and evaluate it with rulesFor/checkUseGear directly — never push a
// hand-built state through applyRunAction, which would re-validate it as a
// fresh transition target.

import { describe, expect, it } from "vitest";
import { currentActorSeatId } from "../camp";
import { evaluateObjective } from "../objectives";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { checkUseGear } from "../run/use-gear";
import { rulesFor } from "../run/compose";
import { currentWindow } from "../run/windows";
import type { BossDef } from "../boss/boss-def";
import type { CampState, CompletedTrick, StandardIdentity } from "../state";
import type { Catalog, CampNumber, RunState } from "../run/types";
import { reroll } from "./reroll";
import { reassign } from "./reassign";
import { ghost } from "./ghost";
import { blindOrders } from "../boss/blind-orders";

const SEAT_IDS = ["p0", "p1", "p2"] as const;
const SEED = "objective-gear-seed";

const NO_BOSSES: Record<string, BossDef> = {};

function makeCatalog(): Catalog {
  return { gear: { reroll, reassign, ghost }, bosses: NO_BOSSES };
}

function setup(opts: {
  campNumber: CampNumber;
  loadouts?: Readonly<Record<string, readonly string[]>>;
  target: "objective-pick" | "between-tricks";
}): { run: RunState; catalog: Catalog } {
  const catalog = makeCatalog();
  const run = advanceTo(
    setupRun({
      seatIds: [...SEAT_IDS],
      seed: SEED,
      catalog,
      campNumber: opts.campNumber,
      loadouts: opts.loadouts ?? {},
    }),
    opts.target,
    catalog,
  );
  return { run, catalog };
}

/** Forces a win-card objective to "done" by appending a synthetic completed
 * trick whose single play carries the objective's own target identity, won
 * by the objective's current owner. Only valid for an owned win-card
 * objective; throws otherwise (a fixture-construction bug, not something a
 * test should ever hit). */
function forceWinCardDone(camp: CampState, objectiveId: string, cardId: string): CampState {
  const objective = camp.objectives.find((o) => o.id === objectiveId);
  if (objective === undefined || objective.kind !== "win-card" || objective.ownerSeatId === null) {
    throw new Error(`forceWinCardDone: "${objectiveId}" is not an owned win-card objective`);
  }
  const target: StandardIdentity = objective.target;
  const winnerSeatId = objective.ownerSeatId;
  const trick: CompletedTrick = {
    index: camp.completedTricks.length,
    leaderSeatId: winnerSeatId,
    plays: [{ seatId: winnerSeatId, card: { id: cardId, identity: target } }],
    winnerSeatId,
  };
  return { ...camp, completedTricks: [...camp.completedTricks, trick] };
}

/** Appends a synthetic completed trick won by `winnerSeatId`, unrelated to
 * any objective's target — used only to make countTricksWon(state,
 * winnerSeatId) positive for Camouflage's failure-check tests. */
function forceTrickWonBy(camp: CampState, winnerSeatId: string, cardId: string): CampState {
  const trick: CompletedTrick = {
    index: camp.completedTricks.length,
    leaderSeatId: winnerSeatId,
    plays: [{ seatId: winnerSeatId, card: { id: cardId, identity: { kind: "standard", suit: "clubs", rank: 2 } } }],
    winnerSeatId,
  };
  return { ...camp, completedTricks: [...camp.completedTricks, trick] };
}

function withCamp(run: RunState, camp: CampState): RunState {
  return { ...run, attempt: { ...run.attempt!, camp } };
}

describe("Compass (reroll)", () => {
  /** Camp `campNumber` (defaults to 4: an ordered ①② pair plus two win-card
   * slots), with `reroll` equipped to a seat determined NOT to be the first
   * objective-pick actor (a probe run, sharing the same seed/campNumber so
   * the deal and leader are identical, discovers that seat first — dealing
   * never depends on loadouts). */
  function setupCompass(
    campNumber: CampNumber = 4,
  ): { run: RunState; catalog: Catalog; nonPickerSeatId: string; pickerSeatId: string } {
    const catalog = makeCatalog();
    const probe = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber }),
      "objective-pick",
      catalog,
    );
    const probeRules = rulesFor(probe, catalog);
    const pickerSeatId = currentActorSeatId(probe.attempt!.camp!, probeRules)!;
    const nonPickerSeatId = SEAT_IDS.find((id) => id !== pickerSeatId)!;

    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber,
        loadouts: { [nonPickerSeatId]: ["reroll"] },
      }),
      "objective-pick",
      catalog,
    );
    return { run, catalog, nonPickerSeatId, pickerSeatId };
  }

  it("rerolls an unowned ordered objective, keeping its id/kind/order and replacing target with the deck's top card", () => {
    const { run, catalog, nonPickerSeatId, pickerSeatId } = setupCompass();
    const camp = run.attempt!.camp!;
    const rules = rulesFor(run, catalog);

    // Demonstrates the gear is usable by a seat that is NOT the current picker.
    expect(currentActorSeatId(camp, rules)).toBe(pickerSeatId);
    expect(nonPickerSeatId).not.toBe(pickerSeatId);

    const ordered1 = camp.objectives.find((o) => o.kind === "ordered" && o.order === 1)!;
    const topOfDeck = camp.objectiveDeck[0]!;
    const deckLenBefore = camp.objectiveDeck.length;

    const result = applyRunAction(
      run,
      nonPickerSeatId,
      { type: "use-gear", gearId: "reroll", targets: [ordered1.id] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextCamp = result.state.attempt!.camp!;
    const rerolled = nextCamp.objectives.find((o) => o.id === ordered1.id)!;
    expect(rerolled.kind).toBe("ordered");
    expect(rerolled.kind === "ordered" && rerolled.order).toBe(1);
    expect(rerolled.kind === "ordered" && rerolled.target).toEqual(topOfDeck);
    expect(nextCamp.objectiveDeck.length).toBe(deckLenBefore - 1);
  });

  it("CR-01: rerolls an unowned win-card objective at camp 2 (all win-card), keeping id/kind and replacing target with the deck's top card", () => {
    const { run, catalog, nonPickerSeatId } = setupCompass(2);
    const camp = run.attempt!.camp!;

    const winCard = camp.objectives.find((o) => o.kind === "win-card" && o.ownerSeatId === null)!;
    const topOfDeck = camp.objectiveDeck[0]!;
    const deckBefore = camp.objectiveDeck;
    const othersBefore = camp.objectives.filter((o) => o.id !== winCard.id);

    const result = applyRunAction(
      run,
      nonPickerSeatId,
      { type: "use-gear", gearId: "reroll", targets: [winCard.id] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextCamp = result.state.attempt!.camp!;
    const rerolled = nextCamp.objectives.find((o) => o.id === winCard.id)!;
    expect(rerolled.kind).toBe("win-card");
    expect(rerolled.ownerSeatId).toBeNull();
    expect(rerolled.kind === "win-card" && rerolled.target).toEqual(topOfDeck);
    expect(nextCamp.objectiveDeck).toEqual(deckBefore.slice(1));
    expect(nextCamp.objectives.filter((o) => o.id !== winCard.id)).toEqual(othersBefore);
  });

  it("CR-01: rerolls an unowned win-card objective at camp 4 (mixed)", () => {
    const { run, catalog, nonPickerSeatId } = setupCompass();
    const camp = run.attempt!.camp!;

    const winCard = camp.objectives.find((o) => o.kind === "win-card" && o.ownerSeatId === null)!;
    const topOfDeck = camp.objectiveDeck[0]!;
    const deckBefore = camp.objectiveDeck;
    const othersBefore = camp.objectives.filter((o) => o.id !== winCard.id);

    const result = applyRunAction(
      run,
      nonPickerSeatId,
      { type: "use-gear", gearId: "reroll", targets: [winCard.id] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextCamp = result.state.attempt!.camp!;
    const rerolled = nextCamp.objectives.find((o) => o.id === winCard.id)!;
    expect(rerolled.kind).toBe("win-card");
    expect(rerolled.ownerSeatId).toBeNull();
    expect(rerolled.kind === "win-card" && rerolled.target).toEqual(topOfDeck);
    expect(nextCamp.objectiveDeck).toEqual(deckBefore.slice(1));
    expect(nextCamp.objectives.filter((o) => o.id !== winCard.id)).toEqual(othersBefore);
  });

  it("a second use is gear_already_used", () => {
    const { run, catalog, nonPickerSeatId } = setupCompass();
    const camp = run.attempt!.camp!;
    const ordered1 = camp.objectives.find((o) => o.kind === "ordered" && o.order === 1)!;
    const ordered2 = camp.objectives.find((o) => o.kind === "ordered" && o.order === 2)!;

    const first = applyRunAction(
      run,
      nonPickerSeatId,
      { type: "use-gear", gearId: "reroll", targets: [ordered1.id] },
      catalog,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyRunAction(
      first.state,
      nonPickerSeatId,
      { type: "use-gear", gearId: "reroll", targets: [ordered2.id] },
      catalog,
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("gear_already_used");
  });

  it("targeting an owned objective is invalid_target", () => {
    const { run, catalog, nonPickerSeatId, pickerSeatId } = setupCompass();
    const camp = run.attempt!.camp!;
    const winCard = camp.objectives.find((o) => o.kind === "win-card")!;

    const picked = applyRunAction(
      run,
      pickerSeatId,
      { type: "pick-objective", objectiveId: winCard.id },
      catalog,
    );
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;

    const result = applyRunAction(
      picked.state,
      nonPickerSeatId,
      { type: "use-gear", gearId: "reroll", targets: [winCard.id] },
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_target");
  });

  it("targeting a no-tricks/exactly-n objective (camp 5) gives 'Only card objectives can be rerolled'", () => {
    const { run, catalog } = setup({ campNumber: 5, loadouts: { p0: ["reroll"] }, target: "objective-pick" });
    const camp = run.attempt!.camp!;
    const cardless = camp.objectives.find((o) => o.kind === "no-tricks" || o.kind === "exactly-n")!;

    const check = checkUseGear(run, "p0", "reroll", [cardless.id], catalog);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("Only card objectives can be rerolled");
  });

  it("using it between tricks is wrong_window", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber: 4, loadouts: { p0: ["reroll"] } }),
      "between-tricks",
      catalog,
    );

    const check = checkUseGear(run, "p0", "reroll", [], catalog);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.error).toBe("wrong_window");
  });
});

describe("Trail Map (reassign, D-10)", () => {
  function setupTrailMap(): { run: RunState; catalog: Catalog } {
    return setup({ campNumber: 2, loadouts: { p0: ["reassign"] }, target: "between-tricks" });
  }

  it("swaps only the pending objectives between the user and the chosen teammate", () => {
    const { run, catalog } = setupTrailMap();
    const camp = run.attempt!.camp!;
    const beforeP0 = camp.objectives.find((o) => o.ownerSeatId === "p0")!;
    const beforeP1 = camp.objectives.find((o) => o.ownerSeatId === "p1")!;
    const beforeP2 = camp.objectives.find((o) => o.ownerSeatId === "p2")!;

    const result = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "reassign", targets: ["p1"] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextObjectives = result.state.attempt!.camp!.objectives;
    expect(nextObjectives.find((o) => o.id === beforeP0.id)!.ownerSeatId).toBe("p1");
    expect(nextObjectives.find((o) => o.id === beforeP1.id)!.ownerSeatId).toBe("p0");
    expect(nextObjectives.find((o) => o.id === beforeP2.id)!.ownerSeatId).toBe("p2");
  });

  it("D-10: a done objective stays with its owner even though it is targeted by the swap", () => {
    const { run, catalog } = setupTrailMap();
    const camp = run.attempt!.camp!;
    const p0Objective = camp.objectives.find((o) => o.ownerSeatId === "p0")!;
    const p1Objective = camp.objectives.find((o) => o.ownerSeatId === "p1")!;

    const spreadCamp = forceWinCardDone(camp, p0Objective.id, "forced-done-1");
    expect(evaluateObjective(spreadCamp, spreadCamp.objectives.find((o) => o.id === p0Objective.id)!)).toBe("done");

    const spreadRun = withCamp(run, spreadCamp);
    const result = applyRunAction(
      spreadRun,
      "p0",
      { type: "use-gear", gearId: "reassign", targets: ["p1"] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextObjectives = result.state.attempt!.camp!.objectives;
    // Done, so it stays with p0 despite being targeted by the swap.
    expect(nextObjectives.find((o) => o.id === p0Objective.id)!.ownerSeatId).toBe("p0");
    // Still pending, so it moves as usual.
    expect(nextObjectives.find((o) => o.id === p1Objective.id)!.ownerSeatId).toBe("p0");
  });

  it("a self target is invalid_target", () => {
    const { run, catalog } = setupTrailMap();
    const result = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "reassign", targets: ["p0"] },
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_target");
  });

  it("gives 'Neither of you has an unresolved objective' when both are already done", () => {
    const { run, catalog } = setupTrailMap();
    const camp = run.attempt!.camp!;
    const p0Objective = camp.objectives.find((o) => o.ownerSeatId === "p0")!;
    const p1Objective = camp.objectives.find((o) => o.ownerSeatId === "p1")!;

    let spreadCamp = forceWinCardDone(camp, p0Objective.id, "forced-done-p0");
    spreadCamp = forceWinCardDone(spreadCamp, p1Objective.id, "forced-done-p1");
    const spreadRun = withCamp(run, spreadCamp);

    const check = checkUseGear(spreadRun, "p0", "reassign", ["p1"], catalog);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("Neither of you has an unresolved objective");
  });

  describe("WR-02: under Thick Fog (face-down)", () => {
    const FOG_SEED = "trail-map-fog-seed";
    const FOG_SEAT_IDS = ["p0", "p1", "p2", "p3", "p4"];

    function fogCatalog(): Catalog {
      return { gear: { reassign }, bosses: { "blind-orders": blindOrders } };
    }

    function setupFogTrailMap(): { run: RunState; catalog: Catalog } {
      const catalog = fogCatalog();
      const loadouts = Object.fromEntries(FOG_SEAT_IDS.map((id) => [id, ["reassign"]]));
      const run = advanceTo(
        setupRun({
          seatIds: FOG_SEAT_IDS,
          seed: FOG_SEED,
          catalog,
          campNumber: 3 as CampNumber,
          bossTwists: { 3: "blind-orders", 6: null },
          loadouts,
        }),
        "objective-pick",
        catalog,
      );
      return { run, catalog };
    }

    it("WR-02: fixture sanity check — between-tricks window, exactly two seats own no objective", () => {
      const { run, catalog } = setupFogTrailMap();
      const rules = rulesFor(run, catalog);
      expect(currentWindow(run, rules)).toBe("between-tricks");

      const camp = run.attempt!.camp!;
      const ownerlessSeats = FOG_SEAT_IDS.filter(
        (seatId) => !camp.objectives.some((o) => o.ownerSeatId === seatId),
      );
      expect(ownerlessSeats.length).toBe(2);
    });

    it("WR-02: checkUseGear(reassign) gives the same result for every teammate, when the user owns no objective", () => {
      const { run, catalog } = setupFogTrailMap();
      const camp = run.attempt!.camp!;
      const ownerlessSeats = FOG_SEAT_IDS.filter(
        (seatId) => !camp.objectives.some((o) => o.ownerSeatId === seatId),
      );
      const self = ownerlessSeats[0]!;
      const teammates = FOG_SEAT_IDS.filter((id) => id !== self);

      for (const teammate of teammates) {
        const check = checkUseGear(run, self, "reassign", [teammate], catalog);
        expect(check.ok).toBe(true);
      }
    });

    it("WR-02: a swap between two objective-less seats applies as a legal no-op", () => {
      const { run, catalog } = setupFogTrailMap();
      const camp = run.attempt!.camp!;
      const ownerlessSeats = FOG_SEAT_IDS.filter(
        (seatId) => !camp.objectives.some((o) => o.ownerSeatId === seatId),
      );
      expect(ownerlessSeats.length).toBe(2);
      const [self, teammate] = ownerlessSeats as [string, string];

      const beforeOwnership = camp.objectives.map((o) => ({ id: o.id, ownerSeatId: o.ownerSeatId }));

      const result = applyRunAction(
        run,
        self,
        { type: "use-gear", gearId: "reassign", targets: [teammate] },
        catalog,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const afterOwnership = result.state.attempt!.camp!.objectives.map((o) => ({
        id: o.id,
        ownerSeatId: o.ownerSeatId,
      }));
      expect(afterOwnership).toEqual(beforeOwnership);

      const secondUse = applyRunAction(
        result.state,
        self,
        { type: "use-gear", gearId: "reassign", targets: [teammate] },
        catalog,
      );
      expect(secondUse.ok).toBe(false);
      if (secondUse.ok) return;
      expect(secondUse.error).toBe("gear_already_used");
    });

    it("WR-02: a swap between an objective-less seat and an objective owner moves the pending objective", () => {
      const { run, catalog } = setupFogTrailMap();
      const camp = run.attempt!.camp!;
      const ownerlessSeats = FOG_SEAT_IDS.filter(
        (seatId) => !camp.objectives.some((o) => o.ownerSeatId === seatId),
      );
      const self = ownerlessSeats[0]!;
      const owner = FOG_SEAT_IDS.find((id) => camp.objectives.some((o) => o.ownerSeatId === id))!;
      const ownerObjective = camp.objectives.find((o) => o.ownerSeatId === owner)!;

      const result = applyRunAction(
        run,
        self,
        { type: "use-gear", gearId: "reassign", targets: [owner] },
        catalog,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const nextObjectives = result.state.attempt!.camp!.objectives;
      expect(nextObjectives.find((o) => o.id === ownerObjective.id)!.ownerSeatId).toBe(self);
    });
  });
});

describe("Camouflage (ghost, D-11)", () => {
  function setupCamouflage(): { run: RunState; catalog: Catalog } {
    return setup({ campNumber: 2, loadouts: { p0: ["ghost"] }, target: "between-tricks" });
  }

  it("removes the chosen objective from play and records the activation effect", () => {
    const { run, catalog } = setupCamouflage();
    const camp = run.attempt!.camp!;
    const ownObjective = camp.objectives.find((o) => o.ownerSeatId === "p0")!;

    const result = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "ghost", targets: [ownObjective.id] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextCamp = result.state.attempt!.camp!;
    expect(nextCamp.objectives.some((o) => o.id === ownObjective.id)).toBe(false);
    expect(result.state.attempt!.effects).toContainEqual({ gearId: "ghost", seatId: "p0", atTrick: 0, lasts: "attempt", params: {}, audience: "public" });
  });

  it("failureChecks is empty right after activation, but includes ghost-broke-cover once the owner wins a trick", () => {
    const { run, catalog } = setupCamouflage();
    const camp = run.attempt!.camp!;
    const ownObjective = camp.objectives.find((o) => o.ownerSeatId === "p0")!;

    const used = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "ghost", targets: [ownObjective.id] },
      catalog,
    );
    expect(used.ok).toBe(true);
    if (!used.ok) return;

    const usedCamp = used.state.attempt!.camp!;
    const rules = rulesFor(used.state, catalog);
    expect(rules.failureChecks(usedCamp)).toEqual([]);

    // D-11: the whole-camp check, evaluated against a spread camp where p0
    // has since won a trick.
    const spreadCamp = forceTrickWonBy(usedCamp, "p0", "forced-win");
    expect(rules.failureChecks(spreadCamp)).toContain("ghost-broke-cover");
  });

  it("canUse refuses once the owner has already won a trick this camp", () => {
    const { run, catalog } = setupCamouflage();
    const camp = run.attempt!.camp!;
    const ownObjective = camp.objectives.find((o) => o.ownerSeatId === "p0")!;

    const spreadCamp = forceTrickWonBy(camp, "p0", "forced-early-win");
    const spreadRun = withCamp(run, spreadCamp);

    const check = checkUseGear(spreadRun, "p0", "ghost", [ownObjective.id], catalog);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("You have already won a trick this camp");
  });

  it("targeting a teammate's objective is invalid_target", () => {
    const { run, catalog } = setupCamouflage();
    const camp = run.attempt!.camp!;
    const p1Objective = camp.objectives.find((o) => o.ownerSeatId === "p1")!;

    const result = applyRunAction(
      run,
      "p0",
      { type: "use-gear", gearId: "ghost", targets: [p1Objective.id] },
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_target");
  });

  it("dropping the last open objective settles the camp as succeeded immediately", () => {
    const catalog = makeCatalog();
    const probe = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber: 1 }),
      "objective-pick",
      catalog,
    );
    const probeRules = rulesFor(probe, catalog);
    const leaderSeatId = currentActorSeatId(probe.attempt!.camp!, probeRules)!;

    const run = advanceTo(
      setupRun({ seatIds: [...SEAT_IDS], seed: SEED, catalog, campNumber: 1, loadouts: { [leaderSeatId]: ["ghost"] } }),
      "between-tricks",
      catalog,
    );
    const camp = run.attempt!.camp!;
    const ownObjective = camp.objectives.find((o) => o.ownerSeatId === leaderSeatId)!;
    const otherObjective = camp.objectives.find((o) => o.ownerSeatId !== leaderSeatId)!;

    const spreadCamp = forceWinCardDone(camp, otherObjective.id, "forced-other-done");
    const spreadRun = withCamp(run, spreadCamp);

    const result = applyRunAction(
      spreadRun,
      leaderSeatId,
      { type: "use-gear", gearId: "ghost", targets: [ownObjective.id] },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.attempt).toBe(null);
    const lastHistory = result.state.history[result.state.history.length - 1]!;
    expect(lastHistory.status).toBe("succeeded");
  });
});
