import { describe, expect, it } from "vitest";
import type { ExpeditionAttemptView, ExpeditionView } from "@games/rules";
import { cuesFor } from "./cues";

type Attempt = ExpeditionAttemptView;
type Camp = Attempt["camp"];
type Obj = Camp["objectives"][number];
type Log = Attempt["log"];

const club3 = { id: "c3", identity: { kind: "standard", suit: "clubs", rank: 3 } } as const;
const club4 = { id: "c4", identity: { kind: "standard", suit: "clubs", rank: 4 } } as const;

const preview = { index: 1, location: "jungle", weather: "fair", event: null, slotKinds: [], bossId: null, shop: false };

function objective(id: string, status: Obj["status"], ownerSeatId: string | null = null): Obj {
  return { id, kind: "no-tricks", ownerSeatId, status };
}

function camp(over: Partial<Camp> = {}): Camp {
  return {
    playerCount: 3,
    expeditionLeaderSeatId: "a",
    totalTricks: 10,
    removedCards: [],
    goals: [],
    discards: [],
    objectives: [objective("o1", "pending")],
    yourHand: [],
    yourLegalCardIds: [],
    handSizes: [],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "a", plays: [] },
    campPhase: "playing",
    currentActorSeatId: "a",
    ...over,
  };
}

/** Old-style kit ids as a seat's upgrade and equipped items; an item's uid
 * here is its item id, so ability keys in these fixtures read by name. */
function kitOf(kit: readonly string[]): Pick<ExpeditionView["seats"][number], "upgradeId" | "items"> {
  const items = kit.filter((id) => !id.includes("."));
  return {
    upgradeId: kit.find((id) => id.includes(".")) ?? null,
    items: { equipped: items.map((id) => ({ uid: id, itemId: id, remaining: null })), backpack: [], concealed: false },
  };
}

function seat(seatId: string, characterId: string | null, kit: string[] = []): ExpeditionView["seats"][number] {
  return { seatId, characterId, ...kitOf(kit), pool: null, usage: [] };
}

function game(over: Partial<ExpeditionView> = {}, campOver: Partial<Camp> = {}, log: Log = [], attemptNumber = 1): ExpeditionView {
  return {
    yourSeatId: "a",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 5, max: 5 },
    plan: [],
    seats: [seat("a", "scout")],
    yourAbilities: [],
    history: [],
    lastVote: null,
    stage: {
      tag: "camp",
      camp: preview,
      attempt: {
        attemptNumber,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log,
        yourWhisper: { allowed: true, left: 1 },
        camp: camp(campOver),
      },
    },
    ...over,
  };
}

const loadout: ExpeditionView["stage"] = { tag: "loadout", camp: preview, yourSlots: 2, shop: null, readySeatIds: [] };
const draft: ExpeditionView["stage"] = { tag: "draft", cleared: 1, payout: 8, yourOffer: null, pendingSeatIds: [] };

describe("cuesFor", () => {
  it("is silent on the first snapshot", () => {
    expect(cuesFor(null, game())).toEqual([]);
  });

  it("is silent when nothing changed", () => {
    expect(cuesFor(game(), game())).toEqual([]);
  });

  it("plays card-play when a card joins the current trick", () => {
    const next = game({}, { currentTrick: { index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: club3, effectiveRank: null }] } });
    expect(cuesFor(game(), next)).toEqual(["sfx-card-play"]);
  });

  it("plays card-play once when the last card closes the trick", () => {
    const prev = game({}, { currentTrick: { index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: club3, effectiveRank: null }] } });
    const next = game({}, {
      completedTricks: [{ index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: club3, effectiveRank: null, countsAs: null, burned: false }, { seatId: "b", card: club4, effectiveRank: null, countsAs: null, burned: false }], winnerSeatId: "b" }],
      currentTrick: { index: 1, leaderSeatId: "b", plays: [] },
    });
    expect(cuesFor(prev, next)).toEqual(["sfx-card-play"]);
  });

  it("plays card-deal when a camp attempt begins, and again on a retry", () => {
    expect(cuesFor(game({ stage: loadout }), game())).toEqual(["sfx-card-deal"]);
    expect(cuesFor(game(), game({}, {}, [], 2))).toEqual(["sfx-card-deal"]);
  });

  it("plays objective-done and objective-failed on status transitions", () => {
    const prev = game({}, { objectives: [objective("o1", "pending"), objective("o2", "pending")] });
    expect(cuesFor(prev, game({}, { objectives: [objective("o1", "done"), objective("o2", "pending")] }))).toEqual(["sfx-objective-done"]);
    expect(cuesFor(prev, game({}, { objectives: [objective("o1", "pending"), objective("o2", "failed")] }))).toEqual(["sfx-objective-failed"]);
  });

  it("dedupes two objectives finishing in the same snapshot", () => {
    const prev = game({}, { objectives: [objective("o1", "pending"), objective("o2", "pending")] });
    const next = game({}, { objectives: [objective("o1", "done"), objective("o2", "done")] });
    expect(cuesFor(prev, next)).toEqual(["sfx-objective-done"]);
  });

  it("plays card-pick when an objective gains an owner", () => {
    const next = game({}, { objectives: [objective("o1", "pending", "a")] });
    expect(cuesFor(game(), next)).toEqual(["sfx-card-pick"]);
  });

  it("plays whisper and power for new log entries of those events", () => {
    const entry = (event: string, sourceId: string | null = null) => ({ event, actorSeatId: "a", subjectSeatIds: ["b"], sourceId, private: false });
    expect(cuesFor(game(), game({}, {}, [entry("whisper")]))).toEqual(["sfx-whisper"]);
    expect(cuesFor(game(), game({}, {}, [entry("use-ability", "scout")]))).toEqual(["sfx-power"]);
    const had = game({}, {}, [entry("whisper")]);
    expect(cuesFor(had, game({}, {}, [entry("whisper")]))).toEqual([]);
  });

  it("plays supply-lost when supplies drop and the camp is cleared in the same step", () => {
    const next = game({ supplies: { count: 4, max: 5 }, stage: draft, history: [{ camp: 1, attempt: 1, status: "cleared", coins: 8 }] });
    expect(cuesFor(game(), next)).toEqual(["sfx-supply-lost", "sfx-camp-cleared"]);
  });

  it("plays run-lost when the run is lost", () => {
    expect(cuesFor(game(), game({ runStatus: "lost", stage: { tag: "ended", result: "lost" } }))).toEqual(["sfx-run-lost"]);
  });

  it("plays equip when your character or kit changes at the trail or muster", () => {
    const onTrail = (characterId: string | null, kit: string[]) => game({ stage: draft, seats: [seat("a", characterId, kit)] });
    expect(cuesFor(onTrail(null, []), onTrail("scout", []))).toEqual(["sfx-equip"]);
    expect(cuesFor(onTrail("scout", []), onTrail("scout", ["bait"]))).toEqual(["sfx-equip"]);
    expect(cuesFor(onTrail("scout", ["bait"]), onTrail("scout", ["bait"]))).toEqual([]);
  });

  it("does not play equip for a teammate's kit change", () => {
    const onTrail = (mateKit: string[]) =>
      game({ stage: draft, seats: [seat("a", "scout"), seat("b", "guide", mateKit)] });
    expect(cuesFor(onTrail([]), onTrail(["bait"]))).toEqual([]);
  });
});
