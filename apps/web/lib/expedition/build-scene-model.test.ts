import { describe, expect, it } from "vitest";
import type { ExpeditionAbilityView, ExpeditionAttemptView, ExpeditionCampView, ExpeditionStageView, ExpeditionCardIdentityView, ExpeditionObjectiveView, ExpeditionStatusPartView, ExpeditionView } from "@games/rules";
import { initialLocalUi } from "./local-ui";
import type { LocalUiState } from "./local-ui";
import { cardLabel, handObjectId, objectiveObjectId, seatObjectId, sourceObjectId, trickObjectId, WHISPER_ID } from "./expedition-ids";
import type { RoomSeatInfo, SceneServerInput, ShownPlayModel, TrickPlayModel } from "./build-scene-model";
import { buildSceneModel, sceneKeyFor } from "./build-scene-model";

function shown(play: TrickPlayModel): ShownPlayModel {
  if (play.hidden) throw new Error(`expected ${play.seatId}'s play face up`);
  return play;
}

const AS: ExpeditionCardIdentityView = { kind: "standard", suit: "spades", rank: 14 }; // A♠
const KD: ExpeditionCardIdentityView = { kind: "standard", suit: "diamonds", rank: 13 }; // K♦
const TH: ExpeditionCardIdentityView = { kind: "standard", suit: "hearts", rank: 10 }; // 10♥
const SUN: ExpeditionCardIdentityView = { kind: "joker", joker: "sun" };
const MOON: ExpeditionCardIdentityView = { kind: "joker", joker: "moon" };

function roomSeats(overrides: Partial<Record<string, Partial<RoomSeatInfo>>> = {}): RoomSeatInfo[] {
  const base: RoomSeatInfo[] = [
    { seatId: "s1", displayLabel: "Alice", connected: true },
    { seatId: "s2", displayLabel: "Bob", connected: true },
    { seatId: "s3", displayLabel: "Cara", connected: true },
  ];
  return base.map((s) => ({ ...s, ...(overrides[s.seatId] ?? {}) }));
}

function makeCamp(overrides: Partial<ExpeditionCampView> = {}): ExpeditionCampView {
  return {
    playerCount: 3,
    expeditionLeaderSeatId: "s1",
    totalTricks: 17,
    removedCards: [],
    goals: [],
    discards: [], voidedTricks: [],
    objectives: [],
    yourHand: [{ id: "c-as", identity: AS, effectiveRank: null, countsAs: null }],
    yourLegalCardIds: ["c-as"],
    handSizes: [
      { seatId: "s1", size: 17 },
      { seatId: "s2", size: 17 },
      { seatId: "s3", size: 17 },
    ],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "s2", plays: [] },
    campPhase: "playing",
    currentActorSeatId: "s2",
    ...overrides,
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
  return { seatId, characterId, ...kitOf(kit), usage: [] };
}

function ability(sourceKey: string, step?: { kind: ExpeditionAbilityView["steps"][number]["kind"]; choices: string[] }, usableNow = true, reason: string | null = null): ExpeditionAbilityView {
  return { sourceKey, usableNow, reason, steps: usableNow && step ? [{ kind: step.kind, prompt: "Pick one", choices: step.choices }] : [] };
}

type ViewOverrides = Partial<ExpeditionView> & { attempt?: ExpeditionAttemptView; campIndex?: number };

function makeAttempt(): ExpeditionAttemptView {
  return {
    attemptNumber: 1,
    window: null,
    pendingSeatIds: [],
    rescue: null,
    effects: [],
    reveals: [],
    log: [],
    yourWhisper: { allowed: true, left: 1 },
    camp: makeCamp(),
  };
}

function attemptOf(view: ExpeditionView): ExpeditionAttemptView {
  if (view.stage.tag !== "camp") throw new Error("fixture is not in a camp");
  return view.stage.attempt;
}

function makeView({ attempt, campIndex = 2, ...overrides }: ViewOverrides = {}): ExpeditionView {
  return {
    yourSeatId: "s2",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 5, max: 5 },
    plan: [],
    seats: [
      seat("s1", "leader"),
      seat("s2", "explorer"),
      seat("s3", "jd"),
    ],
    kicked: [],
    yourAbilities: [],
    history: [],
    lastVote: null,
    stage: { tag: "camp", camp: { index: campIndex, location: "jungle", weather: "fair", pairing: null, event: null, slotKinds: [], bossId: null, shop: false, survey: null }, mods: [], attempt: attempt ?? makeAttempt() },
    ...overrides,
  };
}

function server(view: ExpeditionView, seats = roomSeats()): SceneServerInput {
  return { game: view, roomSeats: seats, hostSeatId: "s1" };
}

function ui(overrides: Partial<LocalUiState> = {}): LocalUiState {
  return { ...initialLocalUi(), ...overrides };
}

describe("sceneKeyFor", () => {
  const preview = { index: 1, location: "jungle", weather: "fair", pairing: null, event: null, slotKinds: [], bossId: null, shop: false, survey: null };
  const stages: [ExpeditionStageView, string][] = [
    [{ tag: "muster", ballots: [], lockedSeatIds: [] }, "trail"],
    [{ tag: "loadout", camp: preview, mods: [], yourSlots: 2, shop: null, readySeatIds: [] }, "trail"],
    [{ tag: "draft", cleared: 1, payout: 8, yourOffer: null, pendingSeatIds: [] }, "trail"],
    [{ tag: "route", options: [], ballots: [] }, "trail"],
    [{ tag: "event", event: "storm", next: preview, readySeatIds: [] }, "trail"],
    [{ tag: "camp", camp: preview, mods: [], attempt: makeAttempt() }, "camp"],
    [{ tag: "ended", result: "won" }, "run-end"],
  ];
  it.each(stages)("maps the %j stage to the %s scene", (stage, key) => {
    expect(sceneKeyFor(makeView({ stage }))).toBe(key);
  });
});

describe("seat order and identity", () => {
  it("rotates so the viewer is ring 0, others follow turn order", () => {
    const model = buildSceneModel(server(makeView()), ui(), "big-index");
    expect(model.seats.map((s) => s.seatId)).toEqual(["s2", "s3", "s1"]);
    expect(model.seats[0]!.ring).toBe(0);
    expect(model.seats[0]!.isYou).toBe(true);
    expect(model.seats[1]!.isYou).toBe(false);
  });

  it("keeps view order and no isYou seat when unseated", () => {
    const model = buildSceneModel(server(makeView({ yourSeatId: null })), ui(), "big-index");
    expect(model.seats.map((s) => s.seatId)).toEqual(["s1", "s2", "s3"]);
    expect(model.seats.every((s) => !s.isYou)).toBe(true);
  });

  it("falls back to '?' and disconnected for a seat missing from roomSeats", () => {
    const model = buildSceneModel(server(makeView(), [{ seatId: "s2", displayLabel: "Bob", connected: true }]), ui(), "big-index");
    const s1 = model.seats.find((s) => s.seatId === "s1")!;
    expect(s1.displayLabel).toBe("?");
    expect(s1.connected).toBe(false);
  });

  it("derives handSize/tricksWon/isExpeditionLeader/objectId from view fields", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({
          completedTricks: [{ index: 0, leaderSeatId: "s1", plays: [], winnerSeatId: "s3" }],
        }),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const s3 = model.seats.find((s) => s.seatId === "s3")!;
    expect(s3.tricksWon).toBe(1);
    expect(s3.objectId).toBe(seatObjectId("s3"));
    const s1 = model.seats.find((s) => s.seatId === "s1")!;
    expect(s1.isExpeditionLeader).toBe(true);
    expect(model.seats.find((s) => s.seatId === "s2")!.handSize).toBe(17);
  });
});

describe("mayAct", () => {
  it("a gated window: reads attempt.pendingSeatIds", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: "rescue",
        pendingSeatIds: ["s1", "s3"],
        rescue: { failedObjectiveIds: [] },
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({ campPhase: "ended", currentActorSeatId: null }),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s1")!.mayAct).toBe(true);
    expect(model.seats.find((s) => s.seatId === "s2")!.mayAct).toBe(false);
  });

  it("otherwise: reads camp.currentActorSeatId", () => {
    const model = buildSceneModel(server(makeView()), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s2")!.mayAct).toBe(true);
    expect(model.seats.find((s) => s.seatId === "s1")!.mayAct).toBe(false);
  });
});

describe("objectives", () => {
  const winCard: ExpeditionObjectiveView = { id: "o1", kind: "win-card", target: KD, ownerSeatId: "s1", status: "pending" };
  const ordered: ExpeditionObjectiveView = { id: "o2", kind: "ordered", target: TH, order: "last", ownerSeatId: "s1", status: "done" };
  const noTricks: ExpeditionObjectiveView = { id: "o3", kind: "no-tricks", ownerSeatId: null, status: "pending" };
  const exactlyN: ExpeditionObjectiveView = { id: "o4", kind: "exactly-n", n: 2, ownerSeatId: null, status: "failed" };

  function viewWithObjectives(objectives: ExpeditionObjectiveView[], patch: Partial<ExpeditionCampView> = {}): ExpeditionView {
    return makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({ objectives, ...patch }),
      },
    });
  }

  it("attaches owned objectives to their owner seat, and labels/badges correctly", () => {
    const model = buildSceneModel(server(viewWithObjectives([winCard, ordered])), ui(), "big-index");
    const s1 = model.seats.find((s) => s.seatId === "s1")!;
    expect(s1.objectives).toHaveLength(2);
    const wc = s1.objectives.find((o) => o.objectiveId === "o1")!;
    expect(wc.label).toBe(cardLabel(KD));
    expect(wc.orderBadge).toBeNull();
    expect(wc.objectId).toBe(objectiveObjectId(winCard));
    const ord = s1.objectives.find((o) => o.objectiveId === "o2")!;
    expect(ord.orderBadge).toBe("L");
    expect(ord.status).toBe("done");
  });

  it("no-tricks and exactly-n labels", () => {
    const model = buildSceneModel(server(viewWithObjectives([noTricks, exactlyN])), ui(), "big-index");
    const nt = model.faceUpObjectives.find((o) => o.objectiveId === "o3")!;
    expect(nt.label).toBe("No tricks");
    const en = model.faceUpObjectives.find((o) => o.objectiveId === "o4")!;
    expect(en.label).toBe("=2 tricks");
  });

  it("faceUpObjectives are exactly the ownerSeatId-null objectives", () => {
    const model = buildSceneModel(server(viewWithObjectives([winCard, noTricks, exactlyN])), ui(), "big-index");
    expect(model.faceUpObjectives.map((o) => o.objectiveId).sort()).toEqual(["o3", "o4"]);
  });

  it("pickable only during objective-pick, viewer as actor, no active targeting", () => {
    const pickableView = viewWithObjectives([noTricks], { campPhase: "objective-pick", currentActorSeatId: "s2" });
    const model = buildSceneModel(server(pickableView), ui(), "big-index");
    expect(model.faceUpObjectives[0]!.pickable).toBe(true);

    const notActorView = viewWithObjectives([noTricks], { campPhase: "objective-pick", currentActorSeatId: "s1" });
    const model2 = buildSceneModel(server(notActorView), ui(), "big-index");
    expect(model2.faceUpObjectives[0]!.pickable).toBe(false);

    const targetingActive = ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: [], heldId: null } });
    const model3 = buildSceneModel(server(pickableView), targetingActive, "big-index");
    expect(model3.faceUpObjectives[0]!.pickable).toBe(false);
  });

  it("owned objectives are never pickable", () => {
    const model = buildSceneModel(server(viewWithObjectives([winCard], { campPhase: "objective-pick", currentActorSeatId: "s1" })), ui(), "big-index");
    const s1 = model.seats.find((s) => s.seatId === "s1")!;
    expect(s1.objectives[0]!.pickable).toBe(false);
  });
});

describe("hand: dimming, sort, lift, targeting", () => {
  function handView(cards: { id: string; identity: ExpeditionCardIdentityView; effectiveRank: number | null; countsAs: ExpeditionCardIdentityView | null }[], legalIds: string[], patch: Partial<ExpeditionCampView> = {}): ExpeditionView {
    return makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({ yourHand: cards, yourLegalCardIds: legalIds, ...patch }),
      },
    });
  }

  it("sorts spades, hearts, clubs, diamonds ascending, then moon, then sun", () => {
    const cards = [
      { id: "sun", identity: SUN, effectiveRank: null, countsAs: null },
      { id: "moon", identity: MOON, effectiveRank: null, countsAs: null },
      { id: "kd", identity: KD, effectiveRank: null, countsAs: null },
      { id: "as", identity: AS, effectiveRank: null, countsAs: null },
      { id: "th", identity: TH, effectiveRank: null, countsAs: null },
    ];
    const model = buildSceneModel(server(handView(cards, [])), ui(), "big-index");
    expect(model.hand.map((c) => c.id)).toEqual(["as", "th", "kd", "moon", "sun"]);
  });

  it("dims exactly the illegal cards on your turn to play", () => {
    const cards = [
      { id: "as", identity: AS, effectiveRank: null, countsAs: null },
      { id: "kd", identity: KD, effectiveRank: null, countsAs: null },
    ];
    const model = buildSceneModel(server(handView(cards, ["as"], { currentActorSeatId: "s2" })), ui(), "big-index");
    expect(model.hand.find((c) => c.id === "as")!.dimmed).toBe(false);
    expect(model.hand.find((c) => c.id === "kd")!.dimmed).toBe(true);
    expect(model.hand.find((c) => c.id === "as")!.playable).toBe(true);
  });

  it("badges a card with what it counts as: a recounted rank keeps its suit, a counted-as card shows that card", () => {
    const cards = [
      { id: "kd", identity: KD, effectiveRank: 12, countsAs: null },
      { id: "th", identity: TH, effectiveRank: null, countsAs: { kind: "standard" as const, suit: "hearts" as const, rank: 9 as const } },
      { id: "as", identity: AS, effectiveRank: null, countsAs: null },
    ];
    const model = buildSceneModel(server(handView(cards, [])), ui(), "big-index");
    expect(model.hand.map((c) => [c.id, c.countsAs])).toEqual([
      ["as", null],
      ["th", { kind: "standard", suit: "hearts", rank: 9 }],
      ["kd", { ...KD, rank: 12 }],
    ]);
  });

  it("dims nothing when it is not your turn", () => {
    const cards = [{ id: "kd", identity: KD, effectiveRank: null, countsAs: null }];
    const model = buildSceneModel(server(handView(cards, [], { currentActorSeatId: "s1" })), ui(), "big-index");
    expect(model.hand[0]!.dimmed).toBe(false);
  });

  it("lifted reflects hoveredCardId", () => {
    const cards = [{ id: "as", identity: AS, effectiveRank: null, countsAs: null }];
    const model = buildSceneModel(server(handView(cards, [])), ui({ hoveredCardId: "as" }), "big-index");
    expect(model.hand[0]!.lifted).toBe(true);
  });

  it("dims non-candidate cards during own-card targeting", () => {
    const cards = [
      { id: "as", identity: AS, effectiveRank: null, countsAs: null },
      { id: "kd", identity: KD, effectiveRank: null, countsAs: null },
    ];
    const view = handView(cards, [], { currentActorSeatId: "s1" });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "whisper", selected: [] } }), "big-index");
    // own-card is the whisper's first target kind; all hand cards are candidates, so nothing is dimmed here,
    // but targetable should be true for both.
    expect(model.hand.every((c) => c.targetable)).toBe(true);
    expect(model.hand.every((c) => !c.dimmed)).toBe(true);
  });
});

describe("drag and drop", () => {
  const cards = [
    { id: "as", identity: AS, effectiveRank: null, countsAs: null },
    { id: "kd", identity: KD, effectiveRank: null, countsAs: null },
  ];
  function dragView(patch: Partial<ExpeditionCampView>): ExpeditionView {
    return makeView({
      attempt: { ...makeAttempt(), camp: makeCamp({ yourHand: cards, yourLegalCardIds: ["as"], ...patch }) },
    });
  }

  it("names the suit you must follow for a card the server did not list as legal", () => {
    const led = { seatId: "s1", hidden: false as const, card: { id: "led", identity: AS }, effectiveRank: null, countsAs: null };
    const model = buildSceneModel(
      server(dragView({ currentActorSeatId: "s2", currentTrick: { index: 0, leaderSeatId: "s1", plays: [led] }, yourLegalCardIds: ["as"] })),
      ui(),
      "big-index",
    );
    expect(model.hand.map((c) => c.blockedReason)).toEqual([null, "Must follow ♠"]);
  });

  it("says it is not your turn off-turn, and nothing for a legal card", () => {
    const model = buildSceneModel(server(dragView({ currentActorSeatId: "s1", yourLegalCardIds: [] })), ui(), "big-index");
    expect(model.hand.map((c) => c.blockedReason)).toEqual(["Not your turn yet", "Not your turn yet"]);
  });

  it("a dragged card leaves its slot, stops lifting, and the model names the held card and its legality", () => {
    const model = buildSceneModel(
      server(dragView({ currentActorSeatId: "s2" })),
      ui({ hoveredCardId: "as", drag: { phase: "dragging", cardId: "as", legal: true, reason: null } }),
      "big-index",
    );
    expect(model.hand.map((c) => ({ id: c.id, dragging: c.dragging, lifted: c.lifted }))).toEqual([
      { id: "as", dragging: true, lifted: false },
      { id: "kd", dragging: false, lifted: false },
    ]);
    expect(model.drag).toEqual({ cardId: "as", legal: true });
  });

  it("a rejected drop shows the reason in the tooltip until the card settles", () => {
    const model = buildSceneModel(
      server(dragView({ currentActorSeatId: "s2" })),
      ui({ drag: { phase: "returning", cardId: "kd", reason: "Must follow ♠" } }),
      "big-index",
    );
    expect(model.tooltip).toEqual({ title: "Can't play K♦", text: "", badges: [], reason: "Must follow ♠" });
    expect(model.drag).toBeNull();
  });
});

describe("trick and lastTrick", () => {
  it("marks the first play as led, trick is null when camp is null", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({
          currentTrick: {
            index: 0,
            leaderSeatId: "s2",
            plays: [
              { seatId: "s2", hidden: false, card: { id: "c1", identity: AS }, effectiveRank: null, countsAs: null },
              { seatId: "s3", hidden: false, card: { id: "c2", identity: KD }, effectiveRank: null, countsAs: null },
            ],
          },
        }),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.trick!.leaderSeatId).toBe("s2");
    expect(model.trick!.plays[0]!.isLed).toBe(true);
    expect(model.trick!.plays[1]!.isLed).toBe(false);
    expect(shown(model.trick!.plays[0]!).card.objectId).toBe(trickObjectId(AS));

    const noAttempt = makeView({ stage: { tag: "loadout", camp: { index: 2, location: "jungle", weather: "fair", pairing: null, event: null, slotKinds: [], bossId: null, shop: false, survey: null }, mods: [], yourSlots: 2, shop: null, readySeatIds: [] } });
    const model2 = buildSceneModel(server(noAttempt), ui(), "big-index");
    expect(model2.trick).toBeNull();
  });

  it("lastTrick exposes leader/winner/plays and open reflects ui.lastTrickOpen", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({
          completedTricks: [
            { index: 0, leaderSeatId: "s1", winnerSeatId: "s3", plays: [{ seatId: "s1", card: { id: "c1", identity: AS }, effectiveRank: null, countsAs: null, burned: false }] },
          ],
        }),
      },
    });
    const model = buildSceneModel(server(view), ui({ lastTrickOpen: true }), "big-index");
    expect(model.lastTrick).not.toBeNull();
    expect(model.lastTrick!.leaderSeatId).toBe("s1");
    expect(model.lastTrick!.winnerSeatId).toBe("s3");
    expect(model.lastTrick!.open).toBe(true);
  });

  it("lastTrick plays carry burned and counts-as; the current trick's never do", () => {
    const view = makeView({
      attempt: {
        ...makeAttempt(),
        camp: makeCamp({
          completedTricks: [
            {
              index: 0,
              leaderSeatId: "s1",
              winnerSeatId: "s2",
              plays: [
                { seatId: "s1", card: { id: "c1", identity: AS }, effectiveRank: null, countsAs: null, burned: true },
                { seatId: "s2", card: { id: "c2", identity: KD }, effectiveRank: null, countsAs: { kind: "standard", suit: "hearts", rank: 13 }, burned: false },
              ],
            },
          ],
          currentTrick: { index: 1, leaderSeatId: "s2", plays: [{ seatId: "s2", hidden: false, card: { id: "c3", identity: TH }, effectiveRank: null, countsAs: null }] },
        }),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.lastTrick!.plays.map((p) => [p.card.label, p.burned, p.countsAs])).toEqual([
      ["A♠", true, null],
      ["K♦", false, { kind: "standard", suit: "hearts", rank: 13 }],
    ]);
    expect(model.trick!.plays.map((p) => [shown(p).burned, shown(p).countsAs])).toEqual([[false, null]]);
  });

  it("a board card step makes the offered card on the table targetable", () => {
    const view = makeView({
      yourAbilities: [ability("bait", { kind: "card", choices: ["card:c2"] })],
      attempt: {
        ...makeAttempt(),
        camp: makeCamp({
          currentTrick: {
            index: 0,
            leaderSeatId: "s1",
            plays: [
              { seatId: "s1", hidden: false, card: { id: "c1", identity: AS }, effectiveRank: null, countsAs: null },
              { seatId: "s3", hidden: false, card: { id: "c2", identity: KD }, effectiveRank: null, countsAs: null },
            ],
          },
        }),
      },
    });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceKey: "bait", selected: [], heldId: null } }), "big-index");
    expect(model.trick!.plays.map((p) => [shown(p).card.id, shown(p).card.targetable])).toEqual([
      ["c1", false],
      ["c2", true],
    ]);
  });

  it("lastTrick is null with no completed tricks", () => {
    const model = buildSceneModel(server(makeView()), ui(), "big-index");
    expect(model.lastTrick).toBeNull();
  });
});

describe("HUD: top bar", () => {
  it("shows supplies against their cap, the purse, and the camp label that opens the map", () => {
    const view = makeView({ campIndex: 2, supplies: { count: 2, max: 5 }, purse: 11 });
    expect(buildSceneModel(server(view), ui(), "big-index").topBar).toEqual({
      stores: true,
      supplies: 2,
      suppliesMax: 5,
      purse: 11,
      camp: "Camp 2 of 6",
      map: true,
      suppliesPick: null,
    });
  });

  it("names the focus camp as the model's campIndex", () => {
    expect(buildSceneModel(server(makeView({ campIndex: 4 })), ui(), "big-index").campIndex).toBe(4);
  });

  it("labels a planned boss camp by its tier", () => {
    const plan = [
      { at: 3, tier: "animal" as const, bossId: null },
      { at: 6, tier: "temple" as const, bossId: null },
    ];
    expect(buildSceneModel(server(makeView({ campIndex: 3, plan })), ui(), "big-index").topBar.camp).toBe("Camp 3 of 6 - Animal boss");
    expect(buildSceneModel(server(makeView({ campIndex: 6, plan })), ui(), "big-index").topBar.camp).toBe("Camp 6 of 6 - The Temple");
  });

  it("puts the boss on the table: the chip names it, its mark sits on the watched seat, and a dammed card says why", () => {
    const plan = [{ at: 3, tier: "animal" as const, bossId: "crocodile" }];
    const base = makeView({ campIndex: 3, plan });
    const croc = { id: "crocodile", kind: "animal" as const, strength: "full" as const, status: [{ kind: "facing" as const, seatId: "s3" }] };
    const view = { ...base, stage: { ...base.stage, mods: [croc] } } as ExpeditionView;
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.topBar.camp).toBe("Camp 3 of 6");
    expect(model.boss).toMatchObject({ id: "crocodile", caption: "Watching Cara", facingSeatId: "s3" });
    expect(model.seats.map((s) => [s.seatId, s.bossMark])).toEqual([
      ["s2", null],
      ["s3", { label: "watched", alert: true }],
      ["s1", null],
    ]);

    const beaver = { id: "beaver", kind: "animal" as const, strength: "full" as const, status: [{ kind: "dam" as const, suit: "spades" as const }] };
    const attempt = makeAttempt();
    const camp = makeCamp({ currentActorSeatId: "s2", yourHand: [{ id: "c-as", identity: AS, effectiveRank: null, countsAs: null }, { id: "c-th", identity: TH, effectiveRank: null, countsAs: null }], yourLegalCardIds: ["c-th"] });
    const dammed = { ...base, stage: { ...base.stage, mods: [beaver], attempt: { ...attempt, camp } } } as ExpeditionView;
    const hand = buildSceneModel(server(dammed), ui(), "big-index").hand;
    expect(hand.map((c) => [c.label, c.blockedReason])).toEqual([
      ["A♠", "The beaver dams ♠"],
      ["10♥", null],
    ]);
  });
});

describe("source chips", () => {
  it("lists each seat's character then kit, naming sources and falling back to the id for an unknown one", () => {
    const view = makeView({ seats: [seat("s1", "leader", ["bait", "not-a-real-source"]), seat("s2", "explorer"), seat("s3", null)] });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const s1 = model.seats.find((s) => s.seatId === "s1")!;
    expect(s1.sources.map((c) => c.name)).toEqual(["Megaphone", "Bait", "not-a-real-source"]);
    expect(s1.sources.map((c) => c.kind)).toEqual(["character", "item", "item"]);
    expect(s1.sources[1]!.objectId).toBe(sourceObjectId("bait"));
    expect(s1.sources[1]!.objectId).toBe("source:bait");
    expect(model.seats.find((s) => s.seatId === "s3")!.sources).toEqual([]);
  });

  it("a teammate's spent source comes from the seat's usage: no use or whisper left", () => {
    const view = makeView({
      seats: [
        { ...seat("s1", "leader"), usage: [{ sourceKey: "leader", remaining: { kind: "whispers", left: 0 } }] },
        seat("s2", "explorer"),
        { ...seat("s3", "jd"), usage: [{ sourceKey: "jd", remaining: { kind: "unlimited" } }] },
      ],
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s1")!.sources[0]!.spent).toBe(true);
    expect(model.seats.find((s) => s.seatId === "s3")!.sources[0]!.spent).toBe(false);
  });

  it("usable and pulse for your own chip come from yourAbilities, and pulse stops while targeting", () => {
    const view = makeView({ yourAbilities: [ability("explorer", { kind: "hand", choices: ["hand:s1"] })] });
    const s2 = (m: ReturnType<typeof buildSceneModel>) => m.seats.find((s) => s.seatId === "s2")!;
    const idle = s2(buildSceneModel(server(view), ui(), "big-index")).sources[0]!;
    expect(idle).toMatchObject({ sourceKey: "explorer", usable: true, pulse: true, reason: null });

    const targeting = ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: [], heldId: null } });
    expect(s2(buildSceneModel(server(view), targeting, "big-index")).sources[0]).toMatchObject({ usable: true, pulse: false });
  });

  it("an unusable source of yours carries the server's reason and never pulses; a teammate's chip is never usable", () => {
    const view = makeView({ yourAbilities: [ability("explorer", undefined, false, "Already used this camp")] });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s2")!.sources[0]).toMatchObject({ usable: false, pulse: false, reason: "Already used this camp" });
    expect(model.seats.find((s) => s.seatId === "s1")!.sources[0]).toMatchObject({ usable: false, pulse: false, reason: null });
  });

  it("tooltip carries the hovered source's rules text, and the reason only while it is unusable", () => {
    const blocked = makeView({ yourAbilities: [ability("explorer", undefined, false, "Already used this camp")] });
    expect(buildSceneModel(server(blocked), ui({ tooltipSourceId: "explorer" }), "big-index").tooltip).toEqual({
      title: "Compass",
      text: "A card in your hand counts one rank higher or lower.",
      badges: ["Between tricks or on your turn", "Once per camp"],
      reason: "Already used this camp",
    });

    const usable = makeView({ yourAbilities: [ability("explorer", { kind: "hand", choices: ["hand:s1"] })] });
    expect(buildSceneModel(server(usable), ui({ tooltipSourceId: "explorer" }), "big-index").tooltip).toEqual({
      title: "Compass",
      text: "A card in your hand counts one rank higher or lower.",
      badges: ["Between tricks or on your turn", "Once per camp"],
      reason: null,
    });
    expect(buildSceneModel(server(usable), ui(), "big-index").tooltip).toBeNull();
  });

  it("tooltip explains a hovered objective for a teammate, for you and while face-up", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({
          objectives: [
            { id: "o-mate", kind: "exactly-n", n: 2, ownerSeatId: "s3", status: "pending" },
            { id: "o-you", kind: "no-tricks", ownerSeatId: "s2", status: "done" },
            { id: "o-up", kind: "win-card", target: KD, ownerSeatId: null, status: "pending" },
          ],
        }),
      },
    });
    const tip = (id: string) => buildSceneModel(server(view), ui({ tooltipObjectiveId: id }), "big-index").tooltip;
    expect(tip("o-mate")).toEqual({ title: "Exactly 2", text: "Cara must win exactly 2 tricks.", badges: ["Still open"], reason: null });
    expect(tip("o-you")).toEqual({ title: "No tricks", text: "You must win no tricks.", badges: ["Done"], reason: null });
    expect(tip("o-up")).toEqual({ title: "K♦", text: "Win the trick containing K♦.", badges: ["Still open"], reason: null });
    expect(tip("gone")).toBeNull();
  });

  it("tooltip shows a hovered teammate source's rules, read-only", () => {
    const view = makeView();
    expect(buildSceneModel(server(view), ui({ tooltipMateSource: { seatId: "s3", sourceKey: "bait" } }), "big-index").tooltip).toEqual({
      title: "Bait",
      text: "A card on the table can't win this trick.",
      badges: ["On your turn", "Single use"],
      reason: null,
    });
  });
});

describe("reveals", () => {
  it("places a reveal only at fromSeatId, never any other seat", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [{ cardId: "c1", fromSeatId: "s3", source: "whisper", identity: AS, toSeatId: "s2" }],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const s3 = model.seats.find((s) => s.seatId === "s3")!;
    expect(s3.reveals).toHaveLength(1);
    expect(s3.reveals[0]!.sourceTag).toBe("whisper");
    for (const seat of model.seats) {
      if (seat.seatId !== "s3") expect(seat.reveals).toHaveLength(0);
    }
  });

  it("tags an ability-sourced reveal with the source's display name", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [{ cardId: "c1", fromSeatId: "s1", source: "explorer", identity: KD, toSeatId: null }],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const reveal = model.seats.find((s) => s.seatId === "s1")!.reveals[0]!;
    expect(reveal.sourceTag).toBe("ability");
    expect(reveal.sourceName).toBe("Compass");
  });
});

describe("disasters on the table", () => {
  const disaster = (id: string, status: Extract<ExpeditionStageView, { tag: "camp" }>["mods"][number]["status"] = []) => ({ id, kind: "disaster" as const, strength: "full" as const, status });
  const withMods = (view: ExpeditionView, mods: ReturnType<typeof disaster>[]): ExpeditionView => ({ ...view, stage: { ...(view.stage as Extract<ExpeditionStageView, { tag: "camp" }>), mods } });

  it("a hand card under the Blood Moon says the suit it follows now; the trick's cards too", () => {
    const view = makeView({
      attempt: {
        ...makeAttempt(),
        camp: makeCamp({
          yourHand: [
            { id: "c-as", identity: AS, effectiveRank: null, countsAs: { kind: "standard", suit: "diamonds", rank: 14 } },
            { id: "c-th", identity: TH, effectiveRank: null, countsAs: null },
          ],
          currentTrick: { index: 1, leaderSeatId: "s1", plays: [{ seatId: "s1", hidden: false, card: { id: "c3", identity: { kind: "standard", suit: "clubs", rank: 5 } }, effectiveRank: null, countsAs: { kind: "standard", suit: "hearts", rank: 5 } }] },
        }),
      },
    });
    const model = buildSceneModel(server(withMods(view, [disaster("blood-moon", [{ kind: "alternating", activeNow: true }])])), ui(), "big-index");
    expect(model.hand.map((c) => [c.label, c.countsAs])).toEqual([
      ["A♠", { kind: "standard", suit: "diamonds", rank: 14 }],
      ["10♥", null],
    ]);
    expect(model.trick!.plays.map((p) => shown(p).countsAs)).toEqual([{ kind: "standard", suit: "hearts", rank: 5 }]);
    expect(model.sky.bloodMoon).toBe(true);
  });

  it("keys the last trick per camp and attempt, and says the Meteor vaporizes what burns", () => {
    const completed = [{ index: 3, leaderSeatId: "s1", winnerSeatId: "s3", plays: [{ seatId: "s1", card: { id: "c1", identity: AS }, effectiveRank: null, countsAs: null, burned: true }] }];
    const view = makeView({ campIndex: 6, attempt: { ...makeAttempt(), attemptNumber: 2, camp: makeCamp({ completedTricks: completed }) } });
    expect(buildSceneModel(server(withMods(view, [disaster("meteor")])), ui(), "big-index").lastTrick).toMatchObject({ key: "6:2:3", burn: "vaporize" });
    expect(buildSceneModel(server(withMods(view, [disaster("wildfire")])), ui(), "big-index").lastTrick).toMatchObject({ key: "6:2:3", burn: "burn" });
  });

  it("lists a gust's cards as sent to the seat on your right, never as cards you showed", () => {
    const view = makeView({
      attempt: {
        ...makeAttempt(),
        log: [{ event: "gust", actorSeatId: null, subjectSeatIds: [], sourceId: "tornado", private: false }],
        reveals: [
          { cardId: "c1", fromSeatId: "s2", source: "tornado", identity: AS, toSeatId: null },
          { cardId: "c2", fromSeatId: "s2", source: "tornado", identity: KD, toSeatId: null },
        ],
      },
    });
    const model = buildSceneModel(server(withMods(view, [disaster("tornado", [{ kind: "countdown", tricks: 3 }])])), ui(), "big-index");
    expect(model.gustSent).toEqual([
      { toSeatId: "s1", toName: "Alice", card: "A♠", objectId: "reveal:A♠" },
      { toSeatId: "s1", toName: "Alice", card: "K♦", objectId: "reveal:K♦" },
    ]);
    expect(model.shownCards).toEqual([]);
    expect(model.seats.every((s) => s.reveals.length === 0)).toBe(true);
    expect(model.happenings).toEqual([{ key: "2:1:0", kind: "gust", text: "A gust sent your A♠ K♦ to Alice", cards: ["A♠", "K♦"] }]);
  });
});

function whisperView(opts: {
  window?: "between-tricks" | null;
  yourWhisper?: { allowed: boolean; left: number };
  reveals?: ExpeditionAttemptView["reveals"];
  log?: { actor: string; to: string; washed?: true }[];
}): ExpeditionView {
  return makeView({
    yourSeatId: "s2",
    attempt: {
      attemptNumber: 1,
      window: opts.window === undefined ? "between-tricks" : opts.window,
      pendingSeatIds: [],
      rescue: null,
      effects: [],
      reveals: opts.reveals ?? [],
      log: (opts.log ?? []).map((l) => ({ event: l.washed ? "whisper-washed" : "whisper", actorSeatId: l.actor, subjectSeatIds: [l.to], sourceId: null, private: false })),
      yourWhisper: opts.yourWhisper ?? { allowed: true, left: 1 },
      camp: makeCamp(),
    },
  });
}

describe("whisper status", () => {
  it("ready: seated, playing, between tricks, a Whisper left", () => {
    const model = buildSceneModel(server(whisperView({})), ui(), "big-index");
    expect(model.whisper).toEqual({ shown: true, visible: true, used: false, active: false, state: "ready", reason: null, left: 1, washes: false });
  });

  it("not shown at all outside the playing phase", () => {
    const view = makeView({ attempt: { ...makeAttempt(), camp: makeCamp({ campPhase: "objective-pick" }) } });
    expect(buildSceneModel(server(view), ui(), "big-index").whisper.shown).toBe(false);
  });

  it("wait-between-tricks: names the reason while a trick is under way", () => {
    const model = buildSceneModel(server(whisperView({ window: null })), ui(), "big-index");
    expect(model.whisper).toMatchObject({ shown: true, visible: false, state: "wait-between-tricks", reason: "Between tricks" });
  });

  it("used: reads the rules' count, and says used once you whispered, or that you have none (the Perfumist)", () => {
    const used = buildSceneModel(server(whisperView({ yourWhisper: { allowed: true, left: 0 }, log: [{ actor: "s2", to: "s1" }] })), ui(), "big-index");
    expect(used.whisper).toMatchObject({ visible: false, used: true, state: "used", reason: "Used this camp", left: 0 });
    const none = buildSceneModel(server(whisperView({ yourWhisper: { allowed: true, left: 0 } })), ui(), "big-index");
    expect(none.whisper).toMatchObject({ visible: false, state: "used", reason: "No whispers this camp" });
  });

  it("a second Whisper (the Leader) keeps the button ready after the first", () => {
    const view = whisperView({ yourWhisper: { allowed: true, left: 1 }, log: [{ actor: "s2", to: "s1" }] });
    expect(buildSceneModel(server(view), ui(), "big-index").whisper).toMatchObject({ visible: true, state: "ready", left: 1 });
  });

  it("blocked: says whispers are blocked", () => {
    const view = whisperView({ yourWhisper: { allowed: false, left: 1 } });
    expect(buildSceneModel(server(view), ui(), "big-index").whisper).toMatchObject({ visible: false, state: "blocked", reason: "Blocked right now" });
  });

  it("under rain: warns that your whisper will wash away, and says so once it has", () => {
    const rainy = (view: ExpeditionView, left: number): ExpeditionView =>
      view.stage.tag === "camp" ? { ...view, stage: { ...view.stage, mods: [{ id: "rain", kind: "weather", strength: "full", status: [{ kind: "washes", left, of: 1 }] }] } } : view;
    const before = buildSceneModel(server(rainy(whisperView({}), 1)), ui(), "big-index");
    expect(before.whisper).toMatchObject({ visible: true, state: "ready", washes: true });
    const after = buildSceneModel(server(rainy(whisperView({ yourWhisper: { allowed: true, left: 0 }, log: [{ actor: "s2", to: "s3", washed: true }] }), 0)), ui(), "big-index");
    expect(after.whisper).toMatchObject({ visible: false, used: true, state: "washed", reason: "Washed away", washes: false });
    expect(after.whisperLog).toEqual(["Your whisper to Cara washed away"]);
    expect(after.happenings).toEqual([{ key: "2:1:0", kind: "washed", text: "Your whisper to Cara washed away in the rain", cards: [] }]);
  });

  it("active reflects ui.targeting.mode === whisper", () => {
    const model = buildSceneModel(server(makeView()), ui({ targeting: { mode: "whisper", selected: [] } }), "big-index");
    expect(model.whisper.active).toBe(true);
  });
});

describe("whispers on the table", () => {
  const toYou = { cardId: "c-kd", fromSeatId: "s1", source: "whisper", identity: KD, toSeatId: "s2" };
  const fromYou = { cardId: "c-as", fromSeatId: "s2", source: "whisper", identity: AS, toSeatId: "s3" };

  it("the recipient keeps the card face up, labelled with who named it, and sees the public line", () => {
    const model = buildSceneModel(server(whisperView({ reveals: [toYou], log: [{ actor: "s1", to: "s2" }] })), ui(), "big-index");
    expect(model.receivedWhispers).toEqual([{ fromSeatId: "s1", fromName: "Alice", card: "K♦", objectId: "reveal:K♦" }]);
    expect(model.sentWhispers).toEqual([]);
    expect(model.whisperLog).toEqual(["Alice whispered to you"]);
  });

  it("the sender gets a confirmation with the card and recipient, and nothing in received", () => {
    const model = buildSceneModel(server(whisperView({ reveals: [fromYou], log: [{ actor: "s2", to: "s3" }] })), ui(), "big-index");
    expect(model.sentWhispers).toEqual([{ toSeatId: "s3", toName: "Cara", card: "A♠", objectId: "reveal:A♠" }]);
    expect(model.receivedWhispers).toEqual([]);
    expect(model.whisperLog).toEqual(["You whispered A♠ to Cara"]);
  });

  it("a washed whisper takes no card from the sender's heard ones", () => {
    const view = whisperView({ reveals: [fromYou], log: [{ actor: "s2", to: "s1", washed: true }, { actor: "s1", to: "s2", washed: true }, { actor: "s2", to: "s3" }] });
    expect(buildSceneModel(server(view), ui(), "big-index").whisperLog).toEqual(["Your whisper to Alice washed away", "Alice's whisper to you washed away", "You whispered A♠ to Cara"]);
  });

  it("a third seat sees only the names: no card anywhere", () => {
    const view = whisperView({ log: [{ actor: "s1", to: "s3" }] });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.whisperLog).toEqual(["Alice whispered to Cara"]);
    expect(model.receivedWhispers).toEqual([]);
    expect(model.sentWhispers).toEqual([]);
  });
});

describe("banner", () => {
  function gated(pending: string[], abilities: ExpeditionView["yourAbilities"], objectives: ExpeditionObjectiveView[] = []): ExpeditionView {
    return makeView({
      yourAbilities: abilities,
      attempt: {
        attemptNumber: 1,
        window: "rescue",
        pendingSeatIds: pending,
        rescue: { failedObjectiveIds: objectives.map((o) => o.id) },
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({ campPhase: "ended", currentActorSeatId: null, objectives }),
      },
    });
  }
  const failedKd = (owner: string): ExpeditionObjectiveView => ({ id: "o1", kind: "win-card", target: KD, ownerSeatId: owner, status: "failed" });

  it("rescue: names the failed objective and its owner, and your rescue", () => {
    const view = gated(["s2"], [ability("jd.free-spirit"), ability("rain-poncho")], [failedKd("s2")]);
    const banner = buildSceneModel(server(view), ui(), "big-index").banner!;
    expect(banner).toMatchObject({ title: "Objective failed: K♦ (yours)", detail: "You can rescue it with Free Spirit", youPending: true });
    expect(banner.uses.map((u) => u.sourceKey)).toEqual(["jd.free-spirit"]);
  });

  it("rescue: tells everyone else who can rescue it", () => {
    const view = gated(["s1"], [], [failedKd("s3")]);
    expect(buildSceneModel(server(view), ui(), "big-index").banner).toEqual({
      title: "Objective failed: K♦ (Cara's)",
      detail: "Waiting on Alice to rescue it or pass",
      youPending: false,
      uses: [],
    });
  });

  it("rescue under fog: names nobody when the teammates who can rescue are hidden", () => {
    const view = gated([], [], [failedKd("s3")]);
    expect(buildSceneModel(server(view), ui(), "big-index").banner).toEqual({
      title: "Objective failed: K♦ (Cara's)",
      detail: "Waiting on the crew to rescue it or pass",
      youPending: false,
      uses: [],
    });
  });

  it("is null while no gated window is open, and while you are targeting", () => {
    expect(buildSceneModel(server(makeView()), ui(), "big-index").banner).toBeNull();
    const between = makeView({ attempt: { ...makeAttempt(), window: "between-tricks" } });
    expect(buildSceneModel(server(between), ui(), "big-index").banner).toBeNull();
    const view = gated(["s2"], [ability("jd.free-spirit", { kind: "failed-objective", choices: ["objective:o1"] })], [failedKd("s2")]);
    expect(buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceKey: "jd.free-spirit", selected: [], heldId: null } }), "big-index").banner).toBeNull();
  });
});

describe("pick tray", () => {
  const withSteps = (sourceKey: string, step: { kind: ExpeditionAbilityView["steps"][number]["kind"]; choices: string[] }, attempt: Partial<ExpeditionAttemptView> = {}): ExpeditionView =>
    makeView({ yourAbilities: [ability(sourceKey, step)], attempt: { ...makeAttempt(), ...attempt } });
  const aiming = (sourceKey: string, heldId: string | null = null): LocalUiState => ui({ targeting: { mode: "ability", sourceKey, selected: [], heldId } });

  it("lists whispers by who sent them to whom, with the card when you know it", () => {
    const view = withSteps("leader.delegate", { kind: "whisper", choices: ["whisper:0", "whisper:1"] }, {
      log: [
        { event: "whisper", actorSeatId: "s1", subjectSeatIds: ["s3"], sourceId: null, private: false },
        { event: "whisper", actorSeatId: "s3", subjectSeatIds: ["s2"], sourceId: null, private: false },
      ],
      reveals: [{ cardId: "c-kd", fromSeatId: "s3", source: "whisper", identity: KD, toSeatId: "s2" }],
    });
    expect(buildSceneModel(server(view), aiming("leader.delegate"), "big-index").tray).toEqual({
      title: "Pick one",
      options: [
        { choiceId: "whisper:0", objectId: "pick:whisper:0", label: "Alice to Cara", cards: [] },
        { choiceId: "whisper:1", objectId: "pick:whisper:1", label: "Cara to you", cards: ["K♦"] },
      ],
    });
  });

  it("lists the tricks you won with their cards", () => {
    const view = withSteps("pack-mule", { kind: "won-trick", choices: ["trick:0"] }, {
      camp: makeCamp({
        completedTricks: [
          {
            index: 0,
            leaderSeatId: "s2",
            winnerSeatId: "s2",
            plays: [
              { seatId: "s2", card: { id: "c1", identity: AS }, effectiveRank: null, countsAs: null, burned: false },
              { seatId: "s3", card: { id: "c2", identity: TH }, effectiveRank: null, countsAs: null, burned: false },
            ],
          },
        ],
      }),
    });
    expect(buildSceneModel(server(view), aiming("pack-mule"), "big-index").tray).toEqual({
      title: "Pick one",
      options: [{ choiceId: "trick:0", objectId: "pick:trick:0", label: "Trick 1", cards: ["A♠", "10♥"] }],
    });
  });

  it("offers the held card's ranks only once a card is held", () => {
    const view = withSteps("explorer", { kind: "card-value", choices: ["value:c-as:13", "value:c-other:5"] });
    expect(buildSceneModel(server(view), aiming("explorer"), "big-index").tray).toBeNull();
    const held = buildSceneModel(server(view), aiming("explorer", "c-as"), "big-index");
    expect(held.tray).toEqual({ title: "Count A♠ as", options: [{ choiceId: "value:c-as:13", objectId: "pick:value:c-as:13", label: "K", cards: [] }] });
    expect(held.hand[0]).toMatchObject({ id: "c-as", targetable: true, selected: true });
  });

  it("is null outside targeting and for kinds with a place on the table", () => {
    expect(buildSceneModel(server(makeView()), ui(), "big-index").tray).toBeNull();
    const view = withSteps("leader", { kind: "player", choices: ["seat:s1"] });
    expect(buildSceneModel(server(view), aiming("leader"), "big-index").tray).toBeNull();
  });
});

describe("board and supplies picks", () => {
  it("the board is a pick only while a board step offers it", () => {
    const view = makeView({ yourAbilities: [ability("leader.delegate", { kind: "board", choices: ["board"] })] });
    const aiming = ui({ targeting: { mode: "ability", sourceKey: "leader.delegate", selected: [], heldId: null } });
    expect(buildSceneModel(server(view), aiming, "big-index").boardPick).toEqual({ targetable: true, selected: false });
    expect(buildSceneModel(server(view), ui(), "big-index").boardPick).toBeNull();
    const picked = ui({ targeting: { mode: "ability", sourceKey: "leader.delegate", selected: ["board"], heldId: null } });
    expect(buildSceneModel(server(view), picked, "big-index").boardPick).toEqual({ targetable: false, selected: true });
  });

  it("the supplies in the top bar are a pick only while a supplies step offers them", () => {
    const view = makeView({ yourAbilities: [ability("explorer.reshape", { kind: "supplies", choices: ["supplies"] })] });
    const aiming = ui({ targeting: { mode: "ability", sourceKey: "explorer.reshape", selected: [], heldId: null } });
    expect(buildSceneModel(server(view), aiming, "big-index").topBar.suppliesPick).toEqual({ targetable: true, selected: false });
    expect(buildSceneModel(server(view), ui(), "big-index").topBar.suppliesPick).toBeNull();
  });
});

describe("charges and shown cards", () => {
  it("a chip says what is left of its source", () => {
    const view = makeView({
      seats: [
        { ...seat("s1", "leader", ["bait", "heavy-pack"]), usage: [{ sourceKey: "leader", remaining: { kind: "whispers", left: 2 } }, { sourceKey: "bait", remaining: { kind: "uses", left: 1, of: 1 } }] },
        { ...seat("s2", "explorer"), usage: [{ sourceKey: "explorer", remaining: { kind: "uses", left: 0, of: 1 } }] },
        seat("s3", "jd"),
      ],
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s1")!.sources.map((c) => [c.name, c.charge, c.spent])).toEqual([
      ["Megaphone", { full: "2 whispers left", short: "2 left" }, false],
      ["Bait", { full: "Single use", short: "Single use" }, false],
      ["Heavy Pack", { full: "Always on", short: "Always on" }, false],
    ]);
    expect(model.seats.find((s) => s.seatId === "s2")!.sources[0]).toMatchObject({ charge: { full: "Used this camp", short: "Used" }, spent: true });
  });

  it("cards an ability showed you are listed with the source and the hand they came from", () => {
    const view = makeView({
      attempt: {
        ...makeAttempt(),
        reveals: [
          { cardId: "c1", fromSeatId: "s1", source: "explorer", identity: KD, toSeatId: null },
          { cardId: "c2", fromSeatId: "s3", source: "whisper", identity: AS, toSeatId: "s2" },
        ],
      },
    });
    expect(buildSceneModel(server(view), ui(), "big-index").shownCards).toEqual([
      { fromSeatId: "s1", fromName: "Alice", sourceName: "Compass", card: "K♦", objectId: "reveal:K♦" },
    ]);
  });
});

describe("targeting", () => {
  const explorerView = () => makeView({ yourAbilities: [ability("explorer", { kind: "hand", choices: ["hand:s1", "hand:s3"] })] });

  it("ability targeting: sourceObjectId, nextKind, canConfirm", () => {
    const model = buildSceneModel(server(explorerView()), ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: [], heldId: null } }), "big-index");
    expect(model.targeting).toEqual({ mode: "ability", sourceObjectId: sourceObjectId("explorer"), nextKind: "hand", canConfirm: false });
  });

  it("ability targeting with every step picked can confirm", () => {
    const model = buildSceneModel(server(explorerView()), ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: ["hand:s1"], heldId: null } }), "big-index");
    expect(model.targeting).toEqual({ mode: "ability", sourceObjectId: "source:explorer", nextKind: null, canConfirm: true });
  });

  it("whisper targeting: sourceObjectId is WHISPER_ID", () => {
    const model = buildSceneModel(server(makeView()), ui({ targeting: { mode: "whisper", selected: ["card:c-as", "seat:s1"] } }), "big-index");
    expect(model.targeting).toEqual({ mode: "whisper", sourceObjectId: WHISPER_ID, nextKind: null, canConfirm: true });
  });

  it("is null when nothing is targeting", () => {
    const model = buildSceneModel(server(makeView()), ui(), "big-index");
    expect(model.targeting).toBeNull();
  });

  it("a hand step makes exactly the offered teammates' hands targetable, not the seats", () => {
    const model = buildSceneModel(server(explorerView()), ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: [], heldId: null } }), "big-index");
    expect(model.seats.map((s) => [s.seatId, s.targetable, s.handPick.targetable, s.handObjectId])).toEqual([
      ["s2", false, false, "seat-hand:s2"],
      ["s3", false, true, "seat-hand:s3"],
      ["s1", false, true, "seat-hand:s1"],
    ]);
    const picked = buildSceneModel(server(explorerView()), ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: ["hand:s3"], heldId: null } }), "big-index");
    expect(picked.seats.find((s) => s.seatId === "s3")!.handPick).toEqual({ targetable: false, selected: true });
  });

  it("a player step makes exactly the offered seats targetable", () => {
    const view = makeView({ yourAbilities: [ability("leader", { kind: "player", choices: ["seat:s1", "seat:s2"] })] });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceKey: "leader", selected: [], heldId: null } }), "big-index");
    expect(model.seats.map((s) => [s.seatId, s.targetable])).toEqual([
      ["s2", true],
      ["s3", false],
      ["s1", true],
    ]);
  });

  it("nothing is targetable when no targeting is active", () => {
    const model = buildSceneModel(server(explorerView()), ui(), "big-index");
    expect(model.seats.every((s) => !s.targetable)).toBe(true);
  });

  it("a card step makes exactly the offered hand cards targetable and dims the rest", () => {
    const view = makeView({
      yourAbilities: [ability("trained-monkey", { kind: "card", choices: ["card:c-as"] })],
      attempt: {
        ...makeAttempt(),
        camp: makeCamp({ yourHand: [{ id: "c-as", identity: AS, effectiveRank: null, countsAs: null }, { id: "c-kd", identity: KD, effectiveRank: null, countsAs: null }], yourLegalCardIds: ["c-as", "c-kd"] }),
      },
    });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceKey: "trained-monkey", selected: [], heldId: null } }), "big-index");
    expect(model.hand.map((c) => ({ id: c.id, targetable: c.targetable, dimmed: c.dimmed }))).toEqual([
      { id: "c-as", targetable: true, dimmed: false },
      { id: "c-kd", targetable: false, dimmed: true },
    ]);
  });

  it("an objective step makes exactly the offered objective chips targetable, and marks a pick selected", () => {
    const view = makeView({
      yourAbilities: [ability("cartographer", { kind: "objective", choices: ["objective:o3"] })],
      attempt: {
        ...makeAttempt(),
        camp: makeCamp({
          objectives: [
            { id: "o3", kind: "no-tricks", ownerSeatId: null, status: "pending" },
            { id: "o4", kind: "exactly-n", n: 2, ownerSeatId: null, status: "pending" },
          ],
        }),
      },
    });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceKey: "cartographer", selected: [], heldId: null } }), "big-index");
    expect(model.faceUpObjectives.map((o) => ({ id: o.objectiveId, targetable: o.targetable, selected: o.selected }))).toEqual([
      { id: "o3", targetable: true, selected: false },
      { id: "o4", targetable: false, selected: false },
    ]);

    const picked = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceKey: "cartographer", selected: ["objective:o3"], heldId: null } }), "big-index");
    expect(picked.faceUpObjectives.find((o) => o.objectiveId === "o3")!.selected).toBe(true);
  });
});

describe("removedCardLabels", () => {
  it("maps removedCards to labels", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        window: null,
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp({ removedCards: [AS, MOON] }),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.removedCardLabels).toEqual([cardLabel(AS), cardLabel(MOON)]);
  });
});

describe("purity", () => {
  it("produces deep-equal output for the same input called twice", () => {
    const input = server(makeView());
    const localUi = ui();
    const a = buildSceneModel(input, localUi, "big-index");
    const b = buildSceneModel(input, localUi, "big-index");
    expect(a).toEqual(b);
  });

  it("does not throw on deep-frozen input", () => {
    function deepFreeze<T>(obj: T): T {
      if (obj !== null && typeof obj === "object") {
        Object.getOwnPropertyNames(obj).forEach((key) => deepFreeze((obj as Record<string, unknown>)[key]));
        Object.freeze(obj);
      }
      return obj;
    }
    const input = deepFreeze(server(makeView()));
    const localUi = deepFreeze(ui());
    expect(() => buildSceneModel(input, localUi, "big-index")).not.toThrow();
  });
});

describe("cardPackId and youSeatId passthrough", () => {
  it("carries cardPackId and youSeatId verbatim", () => {
    const model = buildSceneModel(server(makeView({ yourSeatId: "s3" })), ui(), "classic");
    expect(model.cardPackId).toBe("classic");
    expect(model.youSeatId).toBe("s3");
  });
});

describe("concealment", () => {
  it("draws a face-down play as its suit only, named by its seat, and says to follow that suit", () => {
    const view = makeView({
      attempt: {
        ...makeAttempt(),
        camp: makeCamp({
          currentTrick: { index: 0, leaderSeatId: "s1", plays: [{ seatId: "s1", hidden: true, suit: "hearts" }] },
          yourHand: [
            { id: "c-as", identity: AS, effectiveRank: null, countsAs: null },
            { id: "c-th", identity: TH, effectiveRank: null, countsAs: null },
          ],
          yourLegalCardIds: ["c-th"],
        }),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.trick!.plays).toEqual([{ seatId: "s1", hidden: true, suit: "hearts", objectId: "trick:face-down:s1", isLed: true }]);
    expect(model.hand.find((c) => c.id === "c-as")!.blockedReason).toBe("Must follow ♥");
  });

  it("shows a hidden objective as a face-down card that explains the mirage", () => {
    const hidden: ExpeditionObjectiveView = { id: "o-mirage", kind: "hidden", ownerSeatId: null, status: "pending" };
    const view = makeView({ attempt: { ...makeAttempt(), camp: makeCamp({ objectives: [hidden], campPhase: "objective-pick" }) } });
    const model = buildSceneModel(server(view), ui({ tooltipObjectiveId: "o-mirage" }), "big-index");
    expect(model.faceUpObjectives.map((o) => [o.objectId, o.kind, o.label])).toEqual([["objective:o-mirage", "hidden", "?"]]);
    expect(model.tooltip).toEqual({ title: "Hidden objective", text: "A mirage hides this objective until the first trick is won.", badges: ["Still open"], reason: null });
  });

  it("marks a teammate's items hidden under fog, never your own", () => {
    const fogged = (s: ExpeditionView["seats"][number]) => ({ ...s, items: { equipped: [], backpack: null, concealed: true } });
    const base = makeView();
    const model = buildSceneModel(server({ ...base, seats: base.seats.map((s) => (s.seatId === "s2" ? s : fogged(s))) }), ui(), "big-index");
    expect(model.seats.map((s) => [s.seatId, s.itemsHidden])).toEqual([
      ["s2", false],
      ["s3", true],
      ["s1", true],
    ]);
  });
});

describe("the temple", () => {
  const PATH: ExpeditionStatusPartView = { kind: "path", plates: ["clubs", "hearts", "sun"], pressed: 1 };
  const sunObjective = (owner: string | null, status: ExpeditionObjectiveView["status"] = "pending"): ExpeditionObjectiveView => ({ id: "o-sun", kind: "win-card", target: SUN, ownerSeatId: owner, status });
  const crew = (left: number, earned: number) => ({ sourceKey: "temple", remaining: { kind: "crew" as const, left, earned } });

  function templeView(over: { objectives?: ExpeditionObjectiveView[]; token?: [number, number]; abilities?: ExpeditionAbilityView[]; attempt?: Partial<ExpeditionAttemptView> } = {}): ExpeditionView {
    const [left, earned] = over.token ?? [0, 0];
    const base = makeAttempt();
    return makeView({
      campIndex: 6,
      seats: [seat("s1", "leader"), seat("s2", "explorer"), seat("s3", "jd")].map((s) => ({ ...s, usage: [crew(left, earned)] })),
      yourAbilities: over.abilities ?? [ability("temple", undefined, false, "Win the Sun to earn it")],
      stage: {
        tag: "camp",
        camp: { index: 6, location: "desert", weather: "fair", pairing: null, event: null, slotKinds: [], bossId: "temple", shop: true, survey: null },
        mods: [
          { id: "desert", kind: "location", strength: "full", status: [] },
          { id: "temple", kind: "temple", strength: "full", status: [PATH] },
          { id: "tiger", kind: "animal", strength: "half", status: [{ kind: "streak", seatId: "s3", count: 2 }] },
        ],
        attempt: { ...base, ...over.attempt, camp: makeCamp({ goals: [{ id: "temple", status: "pending" }], objectives: over.objectives ?? [sunObjective(null)] }) },
      },
    });
  }

  it("lays the plate path, brings the tiger back at half strength beside no boss, and names the camp by number", () => {
    const m = buildSceneModel(server(templeView()), ui(), "big-index");
    expect(m.temple).toMatchObject({ count: "Plates 1/3", hint: "Next: lead ♥", status: "pending" });
    expect(m.temple?.plates.map((p) => p.state)).toEqual(["pressed", "next", "ahead"]);
    expect(m.boss).toBeNull();
    expect(m.helpers.map((h) => [h.name, h.caption])).toEqual([["Tiger (half)", "Pounce: Cara"]]);
    expect(m.seats.find((s) => s.seatId === "s3")?.bossMark).toEqual({ label: "streak 2", alert: true });
    expect(m.sky).toMatchObject({ location: "desert", backdrop: "temple" });
    expect(m.topBar.camp).toBe("Camp 6 of 6");
  });

  it("draws the Sun objective as the Sun, in the pool and on its owner's plate", () => {
    expect(buildSceneModel(server(templeView()), ui(), "big-index").faceUpObjectives).toMatchObject([{ objectiveId: "o-sun", kind: "sun", label: "Sun", status: "pending" }]);
    const owned = buildSceneModel(server(templeView({ objectives: [sunObjective("s1", "done")] })), ui(), "big-index");
    expect(owned.seats.find((s) => s.seatId === "s1")?.objectives).toMatchObject([{ kind: "sun", label: "Sun", status: "done" }]);
    expect(buildSceneModel(server(templeView()), ui({ tooltipObjectiveId: "o-sun" }), "big-index").tooltip?.title).toBe("The Sun");
  });

  it("puts the crew's Skip in every seat's kit: locked with its reason until the Sun is won, then 1 left", () => {
    const locked = buildSceneModel(server(templeView()), ui({ tooltipSourceId: "temple" }), "big-index");
    const skipOf = (m: typeof locked, seatId: string) => m.seats.find((s) => s.seatId === seatId)?.sources.find((c) => c.sourceKey === "temple");
    expect(skipOf(locked, "s2")).toMatchObject({ sourceId: "temple", objectId: "source:temple", name: "Skip", kind: "grant", charge: { full: "Not earned", short: "Not earned" }, usable: false, reason: "Win the Sun to earn it" });
    expect(skipOf(locked, "s1")).toMatchObject({ name: "Skip", charge: { full: "Not earned", short: "Not earned" }, usable: false });
    expect(locked.tooltip).toEqual({ title: "Skip", text: "Drop one open objective.", badges: ["Between tricks or when an objective fails", "Crew token"], reason: "Win the Sun to earn it" });

    const earned = templeView({ token: [1, 1], abilities: [ability("temple", { kind: "objective", choices: ["objective:o2"] })] });
    const m = buildSceneModel(server(earned), ui(), "big-index");
    expect(skipOf(m, "s2")).toMatchObject({ charge: { full: "1 left", short: "1 left" }, usable: true, pulse: true });
    expect(skipOf(m, "s3")).toMatchObject({ charge: { full: "1 left", short: "1 left" }, usable: false });
    expect(skipOf(buildSceneModel(server(templeView({ token: [0, 1] })), ui(), "big-index"), "s1")).toMatchObject({ charge: { full: "Used", short: "Used" }, spent: true });
  });

  it("offers the Skip in rescue like any rescue ability", () => {
    const failed: ExpeditionObjectiveView = { id: "o2", kind: "win-card", target: KD, ownerSeatId: "s2", status: "failed" };
    const view = templeView({
      token: [1, 1],
      objectives: [sunObjective("s1", "done"), failed],
      abilities: [ability("temple", { kind: "objective", choices: ["objective:o2"] })],
      attempt: { window: "rescue", pendingSeatIds: ["s1", "s2", "s3"], rescue: { failedObjectiveIds: ["o2"] } },
    });
    const banner = buildSceneModel(server(view), ui(), "big-index").banner!;
    expect(banner).toMatchObject({ title: "Objective failed: K♦ (yours)", detail: "You can rescue it with Skip. Alice and Cara can too", youPending: true });
    expect(banner.uses.map((u) => u.sourceKey)).toEqual(["temple"]);
    const five = { ...view, seats: [...view.seats, seat("s4", null), seat("s5", null)] };
    if (five.stage.tag === "camp") five.stage.attempt.pendingSeatIds = ["s1", "s2", "s3", "s4", "s5"];
    const names = roomSeats().concat([{ seatId: "s4", displayLabel: "Dan", connected: true }, { seatId: "s5", displayLabel: "Eve", connected: true }]);
    expect(buildSceneModel(server(five, names), ui(), "big-index").banner?.detail).toBe("You can rescue it with Skip. Alice, Cara, Dan and Eve can too");
  });
});
