import { describe, expect, it } from "vitest";
import type { ExpeditionAbilityView, ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionObjectiveView, ExpeditionView } from "@games/rules";
import { initialLocalUi } from "./local-ui";
import type { LocalUiState } from "./local-ui";
import { cardLabel, handObjectId, objectiveObjectId, seatObjectId, sourceObjectId, trickObjectId, WHISPER_ID } from "./expedition-ids";
import type { RoomSeatInfo, SceneServerInput } from "./build-scene-model";
import { buildSceneModel, sceneKeyFor } from "./build-scene-model";

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
    objectives: [],
    yourHand: [{ id: "c-as", identity: AS, effectiveRank: null }],
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

function seat(seatId: string, characterId: string | null, kit: string[] = []): ExpeditionView["seats"][number] {
  return { seatId, characterId, kit, ready: true, draftPending: false, pool: null, usage: [] };
}

function ability(sourceId: string, step?: { kind: ExpeditionAbilityView["steps"][number]["kind"]; choices: string[] }, usableNow = true, reason: string | null = null): ExpeditionAbilityView {
  return { sourceId, usableNow, reason, steps: usableNow && step ? [{ kind: step.kind, prompt: "Pick one", choices: step.choices }] : [] };
}

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s2",
    runPhase: "camp",
    runStatus: "in_progress",
    campNumber: 2,
    supplies: 5,
    seats: [
      seat("s1", "guide"),
      seat("s2", "scout"),
      seat("s3", "medic"),
    ],
    yourDraftOffer: null,
    yourAbilities: [],
    history: [],
    attempt: {
      attemptNumber: 1,
      window: null,
      pendingSeatIds: [],
      rescue: null,
      effects: [],
      reveals: [],
      log: [],
      yourWhisper: { allowed: true, left: 1 },
      camp: makeCamp(),
    },
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
  it("maps the fireside and the ended run to their own scenes", () => {
    expect(sceneKeyFor(makeView({ runPhase: "fireside" }))).toBe("fireside");
    expect(sceneKeyFor(makeView({ runPhase: "ended" }))).toBe("run-end");
  });
  it("maps muster to the fireside scene", () => {
    expect(sceneKeyFor(makeView({ runPhase: "muster" }))).toBe("fireside");
  });
  it("maps camp to camp", () => {
    expect(sceneKeyFor(makeView({ runPhase: "camp" }))).toBe("camp");
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
    expect(nt.label).toBe("0 tricks");
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

    const targetingActive = ui({ targeting: { mode: "ability", sourceId: "scout", selected: [], valueCardId: null } });
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
  function handView(cards: { id: string; identity: ExpeditionCardIdentityView; effectiveRank: null }[], legalIds: string[], patch: Partial<ExpeditionCampView> = {}): ExpeditionView {
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
      { id: "sun", identity: SUN, effectiveRank: null },
      { id: "moon", identity: MOON, effectiveRank: null },
      { id: "kd", identity: KD, effectiveRank: null },
      { id: "as", identity: AS, effectiveRank: null },
      { id: "th", identity: TH, effectiveRank: null },
    ];
    const model = buildSceneModel(server(handView(cards, [])), ui(), "big-index");
    expect(model.hand.map((c) => c.id)).toEqual(["as", "th", "kd", "moon", "sun"]);
  });

  it("dims exactly the illegal cards on your turn to play", () => {
    const cards = [
      { id: "as", identity: AS, effectiveRank: null },
      { id: "kd", identity: KD, effectiveRank: null },
    ];
    const model = buildSceneModel(server(handView(cards, ["as"], { currentActorSeatId: "s2" })), ui(), "big-index");
    expect(model.hand.find((c) => c.id === "as")!.dimmed).toBe(false);
    expect(model.hand.find((c) => c.id === "kd")!.dimmed).toBe(true);
    expect(model.hand.find((c) => c.id === "as")!.playable).toBe(true);
  });

  it("dims nothing when it is not your turn", () => {
    const cards = [{ id: "kd", identity: KD, effectiveRank: null }];
    const model = buildSceneModel(server(handView(cards, [], { currentActorSeatId: "s1" })), ui(), "big-index");
    expect(model.hand[0]!.dimmed).toBe(false);
  });

  it("lifted reflects hoveredCardId", () => {
    const cards = [{ id: "as", identity: AS, effectiveRank: null }];
    const model = buildSceneModel(server(handView(cards, [])), ui({ hoveredCardId: "as" }), "big-index");
    expect(model.hand[0]!.lifted).toBe(true);
  });

  it("dims non-candidate cards during own-card targeting", () => {
    const cards = [
      { id: "as", identity: AS, effectiveRank: null },
      { id: "kd", identity: KD, effectiveRank: null },
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
    { id: "as", identity: AS, effectiveRank: null },
    { id: "kd", identity: KD, effectiveRank: null },
  ];
  function dragView(patch: Partial<ExpeditionCampView>): ExpeditionView {
    return makeView({
      attempt: { ...makeView().attempt!, camp: makeCamp({ yourHand: cards, yourLegalCardIds: ["as"], ...patch }) },
    });
  }

  it("names the suit you must follow for a card the server did not list as legal", () => {
    const led = { seatId: "s1", card: { id: "led", identity: AS }, effectiveRank: null };
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
              { seatId: "s2", card: { id: "c1", identity: AS }, effectiveRank: null },
              { seatId: "s3", card: { id: "c2", identity: KD }, effectiveRank: null },
            ],
          },
        }),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.trick!.leaderSeatId).toBe("s2");
    expect(model.trick!.plays[0]!.isLed).toBe(true);
    expect(model.trick!.plays[1]!.isLed).toBe(false);
    expect(model.trick!.plays[0]!.card.objectId).toBe(trickObjectId(AS));

    const noAttempt = makeView({ runPhase: "fireside", attempt: null });
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
            { index: 0, leaderSeatId: "s1", winnerSeatId: "s3", plays: [{ seatId: "s1", card: { id: "c1", identity: AS }, effectiveRank: null }] },
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

  it("a board card step makes the offered card on the table targetable", () => {
    const view = makeView({
      yourAbilities: [ability("bait", { kind: "card", choices: ["card:c2"] })],
      attempt: {
        ...makeView().attempt!,
        camp: makeCamp({
          currentTrick: {
            index: 0,
            leaderSeatId: "s1",
            plays: [
              { seatId: "s1", card: { id: "c1", identity: AS }, effectiveRank: null },
              { seatId: "s3", card: { id: "c2", identity: KD }, effectiveRank: null },
            ],
          },
        }),
      },
    });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceId: "bait", selected: [], valueCardId: null } }), "big-index");
    expect(model.trick!.plays.map((p) => [p.card.id, p.card.targetable])).toEqual([
      ["c1", false],
      ["c2", true],
    ]);
  });

  it("lastTrick is null with no completed tricks", () => {
    const model = buildSceneModel(server(makeView()), ui(), "big-index");
    expect(model.lastTrick).toBeNull();
  });
});

describe("HUD: supplies and campNumber", () => {
  it("copies supplies and campNumber verbatim", () => {
    const model = buildSceneModel(server(makeView({ supplies: 7, campNumber: 4 })), ui(), "big-index");
    expect(model.supplies).toBe(7);
    expect(model.campNumber).toBe(4);
  });

  it("topBar names the camp and flags boss camps", () => {
    expect(buildSceneModel(server(makeView({ campNumber: 2, supplies: 2 })), ui(), "big-index").topBar).toEqual({
      supplies: 2,
      camp: "Camp 2 of 6",
      suppliesPick: null,
    });
    expect(buildSceneModel(server(makeView({ campNumber: 3 })), ui(), "big-index").topBar.camp).toBe("Camp 3 of 6 - Boss camp");
  });
});

describe("source chips", () => {
  it("lists each seat's character then kit, naming sources and falling back to the id for an unknown one", () => {
    const view = makeView({ seats: [seat("s1", "guide", ["bait", "not-a-real-source"]), seat("s2", "scout"), seat("s3", null)] });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const s1 = model.seats.find((s) => s.seatId === "s1")!;
    expect(s1.sources.map((c) => c.name)).toEqual(["Machete", "Bait", "not-a-real-source"]);
    expect(s1.sources.map((c) => c.kind)).toEqual(["character", "item", "item"]);
    expect(s1.sources[1]!.objectId).toBe(sourceObjectId("bait"));
    expect(s1.sources[1]!.objectId).toBe("source:bait");
    expect(model.seats.find((s) => s.seatId === "s3")!.sources).toEqual([]);
  });

  it("a teammate's spent source comes from the seat's usage: a use count of zero left", () => {
    const view = makeView({
      seats: [
        { ...seat("s1", "guide"), usage: [{ sourceId: "guide", remaining: { kind: "uses", left: 0, of: 1 } }] },
        seat("s2", "scout"),
        { ...seat("s3", "medic"), usage: [{ sourceId: "medic", remaining: { kind: "uses", left: 1, of: 1 } }] },
      ],
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s1")!.sources[0]!.spent).toBe(true);
    expect(model.seats.find((s) => s.seatId === "s3")!.sources[0]!.spent).toBe(false);
  });

  it("usable and pulse for your own chip come from yourAbilities, and pulse stops while targeting", () => {
    const view = makeView({ yourAbilities: [ability("scout", { kind: "hand", choices: ["hand:s1"] })] });
    const s2 = (m: ReturnType<typeof buildSceneModel>) => m.seats.find((s) => s.seatId === "s2")!;
    const idle = s2(buildSceneModel(server(view), ui(), "big-index")).sources[0]!;
    expect(idle).toMatchObject({ sourceId: "scout", usable: true, pulse: true, reason: null });

    const targeting = ui({ targeting: { mode: "ability", sourceId: "scout", selected: [], valueCardId: null } });
    expect(s2(buildSceneModel(server(view), targeting, "big-index")).sources[0]).toMatchObject({ usable: true, pulse: false });
  });

  it("an unusable source of yours carries the server's reason and never pulses; a teammate's chip is never usable", () => {
    const view = makeView({ yourAbilities: [ability("scout", undefined, false, "Already used this camp")] });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s2")!.sources[0]).toMatchObject({ usable: false, pulse: false, reason: "Already used this camp" });
    expect(model.seats.find((s) => s.seatId === "s1")!.sources[0]).toMatchObject({ usable: false, pulse: false, reason: null });
  });

  it("tooltip carries the hovered source's rules text, and the reason only while it is unusable", () => {
    const blocked = makeView({ yourAbilities: [ability("scout", undefined, false, "Already used this camp")] });
    expect(buildSceneModel(server(blocked), ui({ tooltipSourceId: "scout" }), "big-index").tooltip).toEqual({
      title: "Spyglass",
      text: "See a random card in a teammate's hand.",
      badges: ["Between tricks", "1 per camp"],
      reason: "Already used this camp",
    });

    const usable = makeView({ yourAbilities: [ability("scout", { kind: "hand", choices: ["hand:s1"] })] });
    expect(buildSceneModel(server(usable), ui({ tooltipSourceId: "scout" }), "big-index").tooltip).toEqual({
      title: "Spyglass",
      text: "See a random card in a teammate's hand.",
      badges: ["Between tricks", "1 per camp"],
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
    expect(buildSceneModel(server(view), ui({ tooltipMateSource: { seatId: "s3", sourceId: "bait" } }), "big-index").tooltip).toEqual({
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
        reveals: [{ cardId: "c1", fromSeatId: "s1", source: "scout", identity: KD, toSeatId: null }],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const reveal = model.seats.find((s) => s.seatId === "s1")!.reveals[0]!;
    expect(reveal.sourceTag).toBe("ability");
    expect(reveal.sourceName).toBe("Spyglass");
  });
});

function whisperView(opts: {
  window?: "between-tricks" | null;
  yourWhisper?: { allowed: boolean; left: number };
  reveals?: NonNullable<ExpeditionView["attempt"]>["reveals"];
  log?: { actor: string; to: string }[];
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
      log: (opts.log ?? []).map((l) => ({ event: "whisper", actorSeatId: l.actor, subjectSeatIds: [l.to], sourceId: null, private: false })),
      yourWhisper: opts.yourWhisper ?? { allowed: true, left: 1 },
      camp: makeCamp(),
    },
  });
}

describe("whisper status", () => {
  it("ready: seated, playing, between tricks, a Whisper left", () => {
    const model = buildSceneModel(server(whisperView({})), ui(), "big-index");
    expect(model.whisper).toEqual({ shown: true, visible: true, used: false, active: false, state: "ready", reason: null, left: 1 });
  });

  it("not shown at all outside the playing phase", () => {
    const view = makeView({ attempt: { ...makeView().attempt!, camp: makeCamp({ campPhase: "objective-pick" }) } });
    expect(buildSceneModel(server(view), ui(), "big-index").whisper.shown).toBe(false);
  });

  it("wait-between-tricks: names the reason while a trick is under way", () => {
    const model = buildSceneModel(server(whisperView({ window: null })), ui(), "big-index");
    expect(model.whisper).toMatchObject({ shown: true, visible: false, state: "wait-between-tricks", reason: "Between tricks" });
  });

  it("used: reads the rules' count, not the log", () => {
    const model = buildSceneModel(server(whisperView({ yourWhisper: { allowed: true, left: 0 } })), ui(), "big-index");
    expect(model.whisper).toMatchObject({ visible: false, used: true, state: "used", reason: "Used this camp", left: 0 });
  });

  it("a second Whisper (the Signaller) keeps the button ready after the first", () => {
    const view = whisperView({ yourWhisper: { allowed: true, left: 1 }, log: [{ actor: "s2", to: "s1" }] });
    expect(buildSceneModel(server(view), ui(), "big-index").whisper).toMatchObject({ visible: true, state: "ready", left: 1 });
  });

  it("blocked: says whispers are blocked", () => {
    const view = whisperView({ yourWhisper: { allowed: false, left: 1 } });
    expect(buildSceneModel(server(view), ui(), "big-index").whisper).toMatchObject({ visible: false, state: "blocked", reason: "Blocked right now" });
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
      runPhase: "camp",
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
    const view = gated(["s2"], [ability("medic"), ability("rain-poncho")], [failedKd("s2")]);
    const banner = buildSceneModel(server(view), ui(), "big-index").banner!;
    expect(banner).toMatchObject({ title: "Objective failed: K♦ (yours)", detail: "You can rescue it with Triage", youPending: true });
    expect(banner.uses.map((u) => u.sourceId)).toEqual(["medic"]);
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

  it("is null while no gated window is open, and while you are targeting", () => {
    expect(buildSceneModel(server(makeView()), ui(), "big-index").banner).toBeNull();
    const between = makeView({ attempt: { ...makeView().attempt!, window: "between-tricks" } });
    expect(buildSceneModel(server(between), ui(), "big-index").banner).toBeNull();
    const view = gated(["s2"], [ability("medic", { kind: "failed-objective", choices: ["objective:o1"] })], [failedKd("s2")]);
    expect(buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceId: "medic", selected: [], valueCardId: null } }), "big-index").banner).toBeNull();
  });
});

describe("pick tray", () => {
  const withSteps = (sourceId: string, step: { kind: ExpeditionAbilityView["steps"][number]["kind"]; choices: string[] }, attempt: Partial<NonNullable<ExpeditionView["attempt"]>> = {}): ExpeditionView =>
    makeView({ yourAbilities: [ability(sourceId, step)], attempt: { ...makeView().attempt!, ...attempt } });
  const aiming = (sourceId: string, valueCardId: string | null = null): LocalUiState => ui({ targeting: { mode: "ability", sourceId, selected: [], valueCardId } });

  it("lists whispers by who sent them to whom, with the card when you know it", () => {
    const view = withSteps("scout.eavesdrop", { kind: "whisper", choices: ["whisper:0", "whisper:1"] }, {
      log: [
        { event: "whisper", actorSeatId: "s1", subjectSeatIds: ["s3"], sourceId: null, private: false },
        { event: "whisper", actorSeatId: "s3", subjectSeatIds: ["s2"], sourceId: null, private: false },
      ],
      reveals: [{ cardId: "c-kd", fromSeatId: "s3", source: "whisper", identity: KD, toSeatId: "s2" }],
    });
    expect(buildSceneModel(server(view), aiming("scout.eavesdrop"), "big-index").tray).toEqual({
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
              { seatId: "s2", card: { id: "c1", identity: AS }, effectiveRank: null },
              { seatId: "s3", card: { id: "c2", identity: TH }, effectiveRank: null },
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
    const view = withSteps("botanist", { kind: "card-value", choices: ["value:c-as:13", "value:c-other:5"] });
    expect(buildSceneModel(server(view), aiming("botanist"), "big-index").tray).toBeNull();
    const held = buildSceneModel(server(view), aiming("botanist", "c-as"), "big-index");
    expect(held.tray).toEqual({ title: "Count A♠ as", options: [{ choiceId: "value:c-as:13", objectId: "pick:value:c-as:13", label: "K", cards: [] }] });
    expect(held.hand[0]).toMatchObject({ id: "c-as", targetable: true, selected: true });
  });

  it("is null outside targeting and for kinds with a place on the table", () => {
    expect(buildSceneModel(server(makeView()), ui(), "big-index").tray).toBeNull();
    const view = withSteps("guide", { kind: "player", choices: ["seat:s1"] });
    expect(buildSceneModel(server(view), aiming("guide"), "big-index").tray).toBeNull();
  });
});

describe("board and supplies picks", () => {
  it("the board is a pick only while a board step offers it", () => {
    const view = makeView({ yourAbilities: [ability("guide.howler-call", { kind: "board", choices: ["board"] })] });
    const aiming = ui({ targeting: { mode: "ability", sourceId: "guide.howler-call", selected: [], valueCardId: null } });
    expect(buildSceneModel(server(view), aiming, "big-index").boardPick).toEqual({ targetable: true, selected: false });
    expect(buildSceneModel(server(view), ui(), "big-index").boardPick).toBeNull();
    const picked = ui({ targeting: { mode: "ability", sourceId: "guide.howler-call", selected: ["board"], valueCardId: null } });
    expect(buildSceneModel(server(view), picked, "big-index").boardPick).toEqual({ targetable: false, selected: true });
  });

  it("the supplies in the top bar are a pick only while a supplies step offers them", () => {
    const view = makeView({ yourAbilities: [ability("medic.field-kit", { kind: "supplies", choices: ["supplies"] })] });
    const aiming = ui({ targeting: { mode: "ability", sourceId: "medic.field-kit", selected: [], valueCardId: null } });
    expect(buildSceneModel(server(view), aiming, "big-index").topBar.suppliesPick).toEqual({ targetable: true, selected: false });
    expect(buildSceneModel(server(view), ui(), "big-index").topBar.suppliesPick).toBeNull();
  });
});

describe("charges and shown cards", () => {
  it("a chip says what is left of its source", () => {
    const view = makeView({
      seats: [
        { ...seat("s1", "botanist", ["bait", "heavy-pack"]), usage: [{ sourceId: "botanist", remaining: { kind: "pool", balance: 2, max: 3, cost: 1 } }, { sourceId: "bait", remaining: { kind: "single-use" } }] },
        { ...seat("s2", "scout"), usage: [{ sourceId: "scout", remaining: { kind: "uses", left: 0, of: 1 } }] },
        seat("s3", "medic"),
      ],
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s1")!.sources.map((c) => [c.name, c.charge, c.spent])).toEqual([
      ["Herb Tonic", "2/3 herbs", false],
      ["Bait", "1 use", false],
      ["Heavy Pack", "always on", false],
    ]);
    expect(model.seats.find((s) => s.seatId === "s2")!.sources[0]).toMatchObject({ charge: "used", spent: true });
  });

  it("cards an ability showed you are listed with the source and the hand they came from", () => {
    const view = makeView({
      attempt: {
        ...makeView().attempt!,
        reveals: [
          { cardId: "c1", fromSeatId: "s1", source: "scout", identity: KD, toSeatId: null },
          { cardId: "c2", fromSeatId: "s3", source: "whisper", identity: AS, toSeatId: "s2" },
        ],
      },
    });
    expect(buildSceneModel(server(view), ui(), "big-index").shownCards).toEqual([
      { fromSeatId: "s1", fromName: "Alice", sourceName: "Spyglass", card: "K♦", objectId: "reveal:K♦" },
    ]);
  });
});

describe("targeting", () => {
  const scoutView = () => makeView({ yourAbilities: [ability("scout", { kind: "hand", choices: ["hand:s1", "hand:s3"] })] });

  it("ability targeting: sourceObjectId, nextKind, canConfirm", () => {
    const model = buildSceneModel(server(scoutView()), ui({ targeting: { mode: "ability", sourceId: "scout", selected: [], valueCardId: null } }), "big-index");
    expect(model.targeting).toEqual({ mode: "ability", sourceObjectId: sourceObjectId("scout"), nextKind: "hand", canConfirm: false });
  });

  it("ability targeting with every step picked can confirm", () => {
    const model = buildSceneModel(server(scoutView()), ui({ targeting: { mode: "ability", sourceId: "scout", selected: ["hand:s1"], valueCardId: null } }), "big-index");
    expect(model.targeting).toEqual({ mode: "ability", sourceObjectId: "source:scout", nextKind: null, canConfirm: true });
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
    const model = buildSceneModel(server(scoutView()), ui({ targeting: { mode: "ability", sourceId: "scout", selected: [], valueCardId: null } }), "big-index");
    expect(model.seats.map((s) => [s.seatId, s.targetable, s.handPick.targetable, s.handObjectId])).toEqual([
      ["s2", false, false, "seat-hand:s2"],
      ["s3", false, true, "seat-hand:s3"],
      ["s1", false, true, "seat-hand:s1"],
    ]);
    const picked = buildSceneModel(server(scoutView()), ui({ targeting: { mode: "ability", sourceId: "scout", selected: ["hand:s3"], valueCardId: null } }), "big-index");
    expect(picked.seats.find((s) => s.seatId === "s3")!.handPick).toEqual({ targetable: false, selected: true });
  });

  it("a player step makes exactly the offered seats targetable", () => {
    const view = makeView({ yourAbilities: [ability("guide", { kind: "player", choices: ["seat:s1", "seat:s2"] })] });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceId: "guide", selected: [], valueCardId: null } }), "big-index");
    expect(model.seats.map((s) => [s.seatId, s.targetable])).toEqual([
      ["s2", true],
      ["s3", false],
      ["s1", true],
    ]);
  });

  it("nothing is targetable when no targeting is active", () => {
    const model = buildSceneModel(server(scoutView()), ui(), "big-index");
    expect(model.seats.every((s) => !s.targetable)).toBe(true);
  });

  it("a card step makes exactly the offered hand cards targetable and dims the rest", () => {
    const view = makeView({
      yourAbilities: [ability("trained-monkey", { kind: "card", choices: ["card:c-as"] })],
      attempt: {
        ...makeView().attempt!,
        camp: makeCamp({ yourHand: [{ id: "c-as", identity: AS, effectiveRank: null }, { id: "c-kd", identity: KD, effectiveRank: null }], yourLegalCardIds: ["c-as", "c-kd"] }),
      },
    });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceId: "trained-monkey", selected: [], valueCardId: null } }), "big-index");
    expect(model.hand.map((c) => ({ id: c.id, targetable: c.targetable, dimmed: c.dimmed }))).toEqual([
      { id: "c-as", targetable: true, dimmed: false },
      { id: "c-kd", targetable: false, dimmed: true },
    ]);
  });

  it("an objective step makes exactly the offered objective chips targetable, and marks a pick selected", () => {
    const view = makeView({
      yourAbilities: [ability("cartographer", { kind: "objective", choices: ["objective:o3"] })],
      attempt: {
        ...makeView().attempt!,
        camp: makeCamp({
          objectives: [
            { id: "o3", kind: "no-tricks", ownerSeatId: null, status: "pending" },
            { id: "o4", kind: "exactly-n", n: 2, ownerSeatId: null, status: "pending" },
          ],
        }),
      },
    });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceId: "cartographer", selected: [], valueCardId: null } }), "big-index");
    expect(model.faceUpObjectives.map((o) => ({ id: o.objectiveId, targetable: o.targetable, selected: o.selected }))).toEqual([
      { id: "o3", targetable: true, selected: false },
      { id: "o4", targetable: false, selected: false },
    ]);

    const picked = buildSceneModel(server(view), ui({ targeting: { mode: "ability", sourceId: "cartographer", selected: ["objective:o3"], valueCardId: null } }), "big-index");
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
