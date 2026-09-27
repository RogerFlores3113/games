// Tests for the v1 information gear (Plan 10-08, GEAR-01): Signal Whistle
// (chatter.ts), Spyglass (peek.ts) and Signal Flare (broadcast.ts, D-08).
//
// Fixtures are driven exclusively through applyRunAction (run-actions.ts)
// and the run-test-support helpers (setupRun/advanceTo), per this plan's own
// <interfaces> note — never a hand-rolled shortcut around the real
// dispatcher. checkUseGear is called directly only where a test needs the
// GEAR-06 reason string that applyRunAction's AdapterResult does not carry.

import { describe, expect, it } from "vitest";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { checkUseGear } from "../run/use-gear";
import { rulesFor } from "../run/compose";
import { currentActorSeatId } from "../camp";
import type { BossDef } from "../boss/boss-def";
import type { CampState } from "../state";
import type { Catalog, CampNumber, RunState } from "../run/types";
import { broadcast } from "./broadcast";
import { chatter } from "./chatter";
import { peek } from "./peek";

const SEAT_IDS = ["p0", "p1", "p2"] as const;

const FAKE_SILENCE: BossDef = {
  id: "fake-silence",
  name: "x",
  text: "x",
  modifiers: { whisperAllowed: () => () => false },
};

function makeCatalog(): Catalog {
  return { gear: { chatter, peek, broadcast }, bosses: { "fake-silence": FAKE_SILENCE } };
}

/** Fireside -> between-tricks fixture, driven exclusively through
 * applyRunAction (setupRun/advanceTo). `loadouts` defaults to p0 equipping
 * the Whistle and the Spyglass, per this plan's own fixture description;
 * Flare tests pass their own loadouts including "broadcast". */
function setup(opts?: {
  seed?: string;
  campNumber?: CampNumber;
  bossTwists?: { readonly 3: string | null; readonly 6: string | null };
  loadouts?: Readonly<Record<string, readonly string[]>>;
}): { run: RunState; catalog: Catalog } {
  const catalog = makeCatalog();
  const run = advanceTo(
    setupRun({
      seatIds: [...SEAT_IDS],
      seed: opts?.seed ?? "info-gear-seed",
      catalog,
      campNumber: opts?.campNumber ?? 2,
      bossTwists: opts?.bossTwists,
      loadouts: opts?.loadouts ?? { p0: ["chatter", "peek"] },
    }),
    "between-tricks",
    catalog,
  );
  return { run, catalog };
}

function firstOwnCardId(run: RunState, seatId: string): string {
  return run.attempt!.camp!.hands.find((h) => h.seatId === seatId)!.cards[0]!.id;
}

describe("Signal Whistle (chatter)", () => {
  it("without the Whistle, a second whisper is no_whispers_left", () => {
    const { run, catalog } = setup();
    const cardId = firstOwnCardId(run, "p0");

    const first = applyRunAction(run, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyRunAction(first.state, "p0", { type: "whisper", targetSeatId: "p2", cardId }, catalog);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("no_whispers_left");
  });

  it("after using the Whistle, a second whisper succeeds and a third is no_whispers_left", () => {
    const { run, catalog } = setup();
    const cardId = firstOwnCardId(run, "p0");

    const usedWhistle = applyRunAction(run, "p0", { type: "use-gear", gearId: "chatter", targets: [] }, catalog);
    expect(usedWhistle.ok).toBe(true);
    if (!usedWhistle.ok) return;

    const first = applyRunAction(usedWhistle.state, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyRunAction(first.state, "p0", { type: "whisper", targetSeatId: "p2", cardId }, catalog);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const third = applyRunAction(second.state, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.error).toBe("no_whispers_left");
  });

  it("the Whistle can be used AFTER the first whisper and still grants a second", () => {
    const { run, catalog } = setup();
    const cardId = firstOwnCardId(run, "p0");

    const first = applyRunAction(run, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const usedWhistle = applyRunAction(first.state, "p0", { type: "use-gear", gearId: "chatter", targets: [] }, catalog);
    expect(usedWhistle.ok).toBe(true);
    if (!usedWhistle.ok) return;

    const second = applyRunAction(usedWhistle.state, "p0", { type: "whisper", targetSeatId: "p2", cardId }, catalog);
    expect(second.ok).toBe(true);
  });

  it("using the Whistle twice is gear_already_used", () => {
    const { run, catalog } = setup();

    const first = applyRunAction(run, "p0", { type: "use-gear", gearId: "chatter", targets: [] }, catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyRunAction(first.state, "p0", { type: "use-gear", gearId: "chatter", targets: [] }, catalog);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("gear_already_used");
  });

  it("under a whisper-blocking boss, checkUseGear refuses with 'Whispers are blocked this camp'", () => {
    const { run, catalog } = setup({ campNumber: 3, bossTwists: { 3: "fake-silence", 6: null } });

    const result = checkUseGear(run, "p0", "chatter", [], catalog);

    expect(result).toEqual({ ok: false, error: "gear_unavailable", reason: "Whispers are blocked this camp" });
  });
});

describe("Spyglass (peek)", () => {
  it("use-gear peek adds exactly one reveal audience-scoped to the user, cardId in the teammate's hand", () => {
    const { run, catalog } = setup();

    const result = applyRunAction(run, "p0", { type: "use-gear", gearId: "peek", targets: ["p1"] }, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reveals = result.state.attempt!.reveals;
    expect(reveals.length).toBe(1);
    expect(reveals[0]!.audience).toEqual(["p0"]);
    expect(reveals[0]!.source).toBe("peek");
    const p1CardIds = result.state.attempt!.camp!.hands.find((h) => h.seatId === "p1")!.cards.map((c) => c.id);
    expect(p1CardIds).toContain(reveals[0]!.cardId);
  });

  it("is deterministic: the same seed and state pick the same card", () => {
    const { run, catalog } = setup();

    const r1 = applyRunAction(run, "p0", { type: "use-gear", gearId: "peek", targets: ["p1"] }, catalog);
    const r2 = applyRunAction(run, "p0", { type: "use-gear", gearId: "peek", targets: ["p1"] }, catalog);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.state.attempt!.reveals[0]!.cardId).toBe(r2.state.attempt!.reveals[0]!.cardId);
  });

  it("is non-constant: at least two distinct positions are chosen across 30 seeds", () => {
    const positions = new Set<number>();

    for (let i = 0; i < 30; i++) {
      const { run, catalog } = setup({ seed: `info-gear-seed-${i}` });
      const hand = run.attempt!.camp!.hands.find((h) => h.seatId === "p1")!.cards;

      const result = applyRunAction(run, "p0", { type: "use-gear", gearId: "peek", targets: ["p1"] }, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const idx = hand.findIndex((c) => c.id === result.state.attempt!.reveals[0]!.cardId);
      positions.add(idx);
    }

    expect(positions.size).toBeGreaterThanOrEqual(2);
  });

  it("survives one full trick (COMM-02)", () => {
    const { run, catalog } = setup();

    const used = applyRunAction(run, "p0", { type: "use-gear", gearId: "peek", targets: ["p1"] }, catalog);
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    const revealedCardId = used.state.attempt!.reveals[0]!.cardId;

    let state = used.state;
    for (let i = 0; i < state.seatIds.length; i++) {
      const rules = rulesFor(state, catalog);
      const camp = state.attempt!.camp!;
      const actor = currentActorSeatId(camp, rules)!;
      const legal = rules.legalPlays(camp, actor);
      const card = legal[0]!;
      const playResult = applyRunAction(state, actor, { type: "play-card", cardId: card.id }, catalog);
      expect(playResult.ok).toBe(true);
      if (!playResult.ok) return;
      state = playResult.state;
    }

    expect(state.attempt!.reveals).toEqual([
      { cardId: revealedCardId, fromSeatId: "p1", audience: ["p0"], source: "peek" },
    ]);
  });

  it("a target of self is invalid_target", () => {
    const { run, catalog } = setup();

    const result = applyRunAction(run, "p0", { type: "use-gear", gearId: "peek", targets: ["p0"] }, catalog);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_target");
  });

  it("a target whose hand is emptied gives the reason 'They have no cards'", () => {
    const { run, catalog } = setup();
    const camp = run.attempt!.camp!;
    const emptiedCamp: CampState = {
      ...camp,
      hands: camp.hands.map((h) => (h.seatId === "p1" ? { ...h, cards: [] } : h)),
    };
    const emptiedRun: RunState = { ...run, attempt: { ...run.attempt!, camp: emptiedCamp } };

    const result = checkUseGear(emptiedRun, "p0", "peek", ["p1"], catalog);

    expect(result).toEqual({ ok: false, error: "gear_unavailable", reason: "They have no cards" });
  });
});

describe("Signal Flare (broadcast, D-08)", () => {
  const FLARE_LOADOUTS = { p0: ["chatter", "peek", "broadcast"] };

  it("a flared whisper's audience is every seat", () => {
    const { run, catalog } = setup({ loadouts: FLARE_LOADOUTS });
    const cardId = firstOwnCardId(run, "p0");

    const flared = applyRunAction(run, "p0", { type: "use-gear", gearId: "broadcast", targets: [] }, catalog);
    expect(flared.ok).toBe(true);
    if (!flared.ok) return;

    const whispered = applyRunAction(flared.state, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(whispered.ok).toBe(true);
    if (!whispered.ok) return;

    expect(whispered.state.attempt!.reveals[0]!.audience).toEqual(["p0", "p1", "p2"]);
  });

  it("a Whistle-granted second whisper after the flared first is private again", () => {
    const { run, catalog } = setup({ loadouts: FLARE_LOADOUTS });
    const cardId = firstOwnCardId(run, "p0");

    const flared = applyRunAction(run, "p0", { type: "use-gear", gearId: "broadcast", targets: [] }, catalog);
    expect(flared.ok).toBe(true);
    if (!flared.ok) return;

    const usedWhistle = applyRunAction(flared.state, "p0", { type: "use-gear", gearId: "chatter", targets: [] }, catalog);
    expect(usedWhistle.ok).toBe(true);
    if (!usedWhistle.ok) return;

    const first = applyRunAction(usedWhistle.state, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.attempt!.reveals[0]!.audience).toEqual(["p0", "p1", "p2"]);

    const second = applyRunAction(first.state, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.attempt!.reveals[1]!.audience).toEqual(["p1"]);
  });

  it("checkUseGear refuses with 'You have already whispered this camp' once the owner has whispered", () => {
    const { run, catalog } = setup({ loadouts: FLARE_LOADOUTS });
    const cardId = firstOwnCardId(run, "p0");

    const whispered = applyRunAction(run, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(whispered.ok).toBe(true);
    if (!whispered.ok) return;

    const result = checkUseGear(whispered.state, "p0", "broadcast", [], catalog);

    expect(result).toEqual({ ok: false, error: "gear_unavailable", reason: "You have already whispered this camp" });
  });

  it("under a whisper-blocking boss, checkUseGear refuses with 'Whispers are blocked this camp'", () => {
    const { run, catalog } = setup({
      campNumber: 3,
      bossTwists: { 3: "fake-silence", 6: null },
      loadouts: FLARE_LOADOUTS,
    });

    const result = checkUseGear(run, "p0", "broadcast", [], catalog);

    expect(result).toEqual({ ok: false, error: "gear_unavailable", reason: "Whispers are blocked this camp" });
  });

  it("affects only its owner: a teammate's whisper after the Flare is still audience-scoped to the target", () => {
    const { run, catalog } = setup({ loadouts: FLARE_LOADOUTS });

    const flared = applyRunAction(run, "p0", { type: "use-gear", gearId: "broadcast", targets: [] }, catalog);
    expect(flared.ok).toBe(true);
    if (!flared.ok) return;

    const p1CardId = firstOwnCardId(flared.state, "p1");
    const result = applyRunAction(flared.state, "p1", { type: "whisper", targetSeatId: "p2", cardId: p1CardId }, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.attempt!.reveals[0]!.audience).toEqual(["p2"]);
  });
});
