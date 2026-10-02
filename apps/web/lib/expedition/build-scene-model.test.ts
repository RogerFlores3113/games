import { describe, expect, it } from "vitest";
import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionObjectiveView, ExpeditionView } from "@games/rules";
import { initialLocalUi } from "./local-ui";
import type { LocalUiState } from "./local-ui";
import { cardLabel, gearObjectId, handObjectId, objectiveObjectId, seatObjectId, trickObjectId, WHISPER_ID } from "./expedition-ids";
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
    objectiveAssignment: "face-up",
    objectives: [],
    yourHand: [{ id: "c-as", identity: AS }],
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

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s2",
    runPhase: "camp",
    runStatus: "in_progress",
    campNumber: 2,
    supplies: 5,
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: [
      { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
      { seatId: "s2", equippedGearIds: [], ready: true, draftPending: false },
      { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
    ],
    yourOwnedGearIds: [],
    yourDraftOffer: null,
    yourCapacity: null,
    yourBaseCapacity: null,
    yourGear: [],
    history: [],
    attempt: {
      attemptNumber: 1,
      bossCancelled: false,
      gearWindow: null,
      preDealPendingSeatIds: [],
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
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
  it("maps pre-deal and camp to camp", () => {
    expect(sceneKeyFor(makeView({ runPhase: "pre-deal" }))).toBe("camp");
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
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
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
  it("pre-deal: reads preDealPendingSeatIds", () => {
    const view = makeView({
      runPhase: "pre-deal",
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: "pre-deal",
        preDealPendingSeatIds: ["s1", "s3"],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
        camp: null,
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
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
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

    const targetingActive = ui({ targeting: { mode: "gear", gearId: "peek", selected: [] } });
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
  function handView(cards: { id: string; identity: ExpeditionCardIdentityView }[], legalIds: string[], patch: Partial<ExpeditionCampView> = {}): ExpeditionView {
    return makeView({
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
        camp: makeCamp({ yourHand: cards, yourLegalCardIds: legalIds, ...patch }),
      },
    });
  }

  it("sorts spades, hearts, clubs, diamonds ascending, then moon, then sun", () => {
    const cards = [
      { id: "sun", identity: SUN },
      { id: "moon", identity: MOON },
      { id: "kd", identity: KD },
      { id: "as", identity: AS },
      { id: "th", identity: TH },
    ];
    const model = buildSceneModel(server(handView(cards, [])), ui(), "big-index");
    expect(model.hand.map((c) => c.id)).toEqual(["as", "th", "kd", "moon", "sun"]);
  });

  it("dims exactly the illegal cards on your turn to play", () => {
    const cards = [
      { id: "as", identity: AS },
      { id: "kd", identity: KD },
    ];
    const model = buildSceneModel(server(handView(cards, ["as"], { currentActorSeatId: "s2" })), ui(), "big-index");
    expect(model.hand.find((c) => c.id === "as")!.dimmed).toBe(false);
    expect(model.hand.find((c) => c.id === "kd")!.dimmed).toBe(true);
    expect(model.hand.find((c) => c.id === "as")!.playable).toBe(true);
  });

  it("dims nothing when it is not your turn", () => {
    const cards = [{ id: "kd", identity: KD }];
    const model = buildSceneModel(server(handView(cards, [], { currentActorSeatId: "s1" })), ui(), "big-index");
    expect(model.hand[0]!.dimmed).toBe(false);
  });

  it("lifted reflects hoveredCardId", () => {
    const cards = [{ id: "as", identity: AS }];
    const model = buildSceneModel(server(handView(cards, [])), ui({ hoveredCardId: "as" }), "big-index");
    expect(model.hand[0]!.lifted).toBe(true);
  });

  it("dims non-candidate cards during own-card targeting", () => {
    const cards = [
      { id: "as", identity: AS },
      { id: "kd", identity: KD },
    ];
    const view = handView(cards, [], { currentActorSeatId: "s1" });
    const model = buildSceneModel(server(view), ui({ targeting: { mode: "whisper", cardId: null, targetSeatId: null } }), "big-index");
    // own-card is the whisper's first target kind; all hand cards are candidates, so nothing is dimmed here,
    // but targetable should be true for both.
    expect(model.hand.every((c) => c.targetable)).toBe(true);
    expect(model.hand.every((c) => !c.dimmed)).toBe(true);
  });
});

describe("trick and lastTrick", () => {
  it("marks the first play as led, trick is null when camp is null", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
        camp: makeCamp({
          currentTrick: {
            index: 0,
            leaderSeatId: "s2",
            plays: [
              { seatId: "s2", card: { id: "c1", identity: AS } },
              { seatId: "s3", card: { id: "c2", identity: KD } },
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
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
        camp: makeCamp({
          completedTricks: [
            { index: 0, leaderSeatId: "s1", winnerSeatId: "s3", plays: [{ seatId: "s1", card: { id: "c1", identity: AS } }] },
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

  it("lastTrick is null with no completed tricks", () => {
    const model = buildSceneModel(server(makeView()), ui(), "big-index");
    expect(model.lastTrick).toBeNull();
  });
});

describe("HUD: supplies, campNumber, bossTwist", () => {
  it("copies supplies and campNumber verbatim", () => {
    const model = buildSceneModel(server(makeView({ supplies: 7, campNumber: 4 })), ui(), "big-index");
    expect(model.supplies).toBe(7);
    expect(model.campNumber).toBe(4);
  });

  it("bossTwist maps radio-silence to rain and eclipse to dark-sky", () => {
    const rainView = makeView({ activeBossTwistId: "radio-silence" });
    const rainModel = buildSceneModel(server(rainView), ui(), "big-index");
    expect(rainModel.bossTwist!.effect).toBe("rain");

    const eclipseView = makeView({ activeBossTwistId: "eclipse" });
    const eclipseModel = buildSceneModel(server(eclipseView), ui(), "big-index");
    expect(eclipseModel.bossTwist!.effect).toBe("dark-sky");
  });

  it("topBar names the camp, flags boss camps and shows the active twist", () => {
    expect(buildSceneModel(server(makeView({ campNumber: 2, supplies: 2 })), ui(), "big-index").topBar).toEqual({
      supplies: 2,
      camp: "Camp 2 of 6",
      boss: null,
    });
    expect(buildSceneModel(server(makeView({ campNumber: 3, activeBossTwistId: "eclipse" })), ui(), "big-index").topBar.boss).toEqual({
      text: "Boss: Eclipse",
      dim: false,
    });
    expect(buildSceneModel(server(makeView({ campNumber: 3 })), ui(), "big-index").topBar.camp).toBe("Camp 3 of 6 - Boss camp");
  });

  it("bossTwist is null when there is no active twist", () => {
    const model = buildSceneModel(server(makeView({ activeBossTwistId: null })), ui(), "big-index");
    expect(model.bossTwist).toBeNull();
  });
});

describe("gear chips", () => {
  it("resolves names via GEAR_DISPLAY, falling back to the id for an unknown gear", () => {
    const view = makeView({
      seats: [
        { seatId: "s1", equippedGearIds: ["peek", "not-a-real-gear"], ready: true, draftPending: false },
        { seatId: "s2", equippedGearIds: [], ready: true, draftPending: false },
        { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
      ],
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const s1 = model.seats.find((s) => s.seatId === "s1")!;
    expect(s1.gear.find((g) => g.gearId === "peek")!.name).toBe("Spyglass");
    expect(s1.gear.find((g) => g.gearId === "not-a-real-gear")!.name).toBe("not-a-real-gear");
    expect(s1.gear[0]!.objectId).toBe(gearObjectId("peek"));
  });

  it("spent for another seat comes from attempt.gearUses", () => {
    const view = makeView({
      seats: [
        { seatId: "s1", equippedGearIds: ["peek"], ready: true, draftPending: false },
        { seatId: "s2", equippedGearIds: [], ready: true, draftPending: false },
        { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
      ],
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [{ seatId: "s1", gearId: "peek", kind: "used" }],
        effects: [],
        reveals: [],
        log: [],
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s1")!.gear[0]!.spent).toBe(true);
  });

  it("spent/usable/reason for the viewer come from view.yourGear, pulse when usable and not targeting", () => {
    const view = makeView({
      yourSeatId: "s2",
      seats: [
        { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
        { seatId: "s2", equippedGearIds: ["peek"], ready: true, draftPending: false },
        { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
      ],
      yourGear: [{ gearId: "peek", spent: false, usableNow: true, reason: null }],
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const s2 = model.seats.find((s) => s.seatId === "s2")!;
    expect(s2.gear[0]!.usable).toBe(true);
    expect(s2.gear[0]!.spent).toBe(false);
    expect(s2.gear[0]!.pulse).toBe(true);

    const targetingModel = buildSceneModel(server(view), ui({ targeting: { mode: "gear", gearId: "peek", selected: [] } }), "big-index");
    expect(targetingModel.seats.find((s) => s.seatId === "s2")!.gear[0]!.pulse).toBe(false);
  });

  it("tooltip carries the hovered gear's rules text, and the reason only while it is unusable", () => {
    const blocked = makeView({ yourGear: [{ gearId: "ghost", spent: false, usableNow: false, reason: "You already won a trick" }] });
    expect(buildSceneModel(server(blocked), ui({ tooltipGearId: "ghost" }), "big-index").tooltip).toEqual({
      title: "Camouflage",
      text: "Drop one of your unresolved objectives. From then on, if you win any trick this camp, the camp fails.",
      reason: "You already won a trick",
    });

    const usable = makeView({ yourGear: [{ gearId: "peek", spent: false, usableNow: true, reason: null }] });
    expect(buildSceneModel(server(usable), ui({ tooltipGearId: "peek" }), "big-index").tooltip).toEqual({
      title: "Spyglass",
      text: "See one random card from a chosen teammate's hand.",
      reason: null,
    });
    expect(buildSceneModel(server(usable), ui(), "big-index").tooltip).toBeNull();
  });

  it("tooltip explains a hovered objective for a teammate, for you and while face-up", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
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
    expect(tip("o-mate")).toEqual({ title: "Exactly 2", text: "Cara must win exactly 2 tricks. Still open.", reason: null });
    expect(tip("o-you")).toEqual({ title: "No tricks", text: "You must win no tricks. Done.", reason: null });
    expect(tip("o-up")).toEqual({ title: "K♦", text: "win the trick containing K♦. Still open.", reason: null });
    expect(tip("gone")).toBeNull();
  });

  it("tooltip shows a hovered teammate gear's rules, read-only", () => {
    const view = makeView({ yourGear: [] });
    expect(buildSceneModel(server(view), ui({ tooltipMateGear: { seatId: "s3", gearId: "peek" } }), "big-index").tooltip).toEqual({
      title: "Spyglass",
      text: "See one random card from a chosen teammate's hand.",
      reason: null,
    });
  });
});

describe("reveals and whisperedTo", () => {
  it("places a reveal only at fromSeatId, never any other seat", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [{ cardId: "c1", fromSeatId: "s3", source: "whisper", identity: AS }],
        log: [],
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

  it("tags a gear-sourced reveal with the gear's display name", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [{ cardId: "c1", fromSeatId: "s1", source: "peek", identity: KD }],
        log: [],
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    const reveal = model.seats.find((s) => s.seatId === "s1")!.reveals[0]!;
    expect(reveal.sourceTag).toBe("gear");
    expect(reveal.sourceName).toBe("Spyglass");
  });

  it("whisperedTo lists subjectSeatIds for the actor's whisper log entries", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [{ event: "whisper", actorSeatId: "s1", subjectSeatIds: ["s3"], gearId: null, private: false }],
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.seats.find((s) => s.seatId === "s1")!.whisperedTo).toEqual(["s3"]);
    expect(model.seats.find((s) => s.seatId === "s3")!.whisperedTo).toEqual([]);
  });
});

describe("whisper visibility", () => {
  it("visible when seated, playing, between-tricks, and no self whisper yet this attempt", () => {
    const view = makeView({
      yourSeatId: "s2",
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: "between-tricks",
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.whisper).toEqual({ shown: true, visible: true, used: false, active: false });
  });

  it("not shown at all outside the playing phase", () => {
    const view = makeView({ attempt: { ...makeView().attempt!, camp: makeCamp({ campPhase: "objective-pick" }) } });
    expect(buildSceneModel(server(view), ui(), "big-index").whisper).toEqual({ shown: false, visible: false, used: false, active: false });
  });

  it("not visible once the viewer has already whispered this attempt", () => {
    const view = makeView({
      yourSeatId: "s2",
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: "between-tricks",
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [{ event: "whisper", actorSeatId: "s2", subjectSeatIds: ["s1"], gearId: null, private: false }],
        camp: makeCamp(),
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.whisper).toEqual({ shown: true, visible: false, used: true, active: false });
  });

  it("active reflects ui.targeting.mode === whisper", () => {
    const model = buildSceneModel(server(makeView()), ui({ targeting: { mode: "whisper", cardId: null, targetSeatId: null } }), "big-index");
    expect(model.whisper.active).toBe(true);
  });
});

describe("preDeal", () => {
  it("is non-null only during runPhase pre-deal, carries youPending and pre-deal-window gear", () => {
    const view = makeView({
      runPhase: "pre-deal",
      yourSeatId: "s2",
      yourGear: [{ gearId: "jam", spent: false, usableNow: true, reason: null }],
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: "pre-deal",
        preDealPendingSeatIds: ["s2"],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
        camp: null,
      },
    });
    const model = buildSceneModel(server(view), ui(), "big-index");
    expect(model.preDeal).not.toBeNull();
    expect(model.preDeal!.youPending).toBe(true);
    expect(model.preDeal!.gear).toHaveLength(1);
    expect(model.preDeal!.gear[0]!.gearId).toBe("jam");
  });

  it("is null outside runPhase pre-deal", () => {
    const model = buildSceneModel(server(makeView({ runPhase: "camp" })), ui(), "big-index");
    expect(model.preDeal).toBeNull();
  });
});

describe("targeting", () => {
  it("gear targeting: sourceObjectId, nextKind, canConfirm", () => {
    const model = buildSceneModel(server(makeView()), ui({ targeting: { mode: "gear", gearId: "peek", selected: [] } }), "big-index");
    expect(model.targeting).not.toBeNull();
    expect(model.targeting!.sourceObjectId).toBe(gearObjectId("peek"));
    expect(model.targeting!.nextKind).toBe("teammate");
    expect(model.targeting!.canConfirm).toBe(false);
  });

  it("whisper targeting: sourceObjectId is WHISPER_ID", () => {
    const model = buildSceneModel(server(makeView()), ui({ targeting: { mode: "whisper", cardId: "c-as", targetSeatId: "s1" } }), "big-index");
    expect(model.targeting!.sourceObjectId).toBe(WHISPER_ID);
    expect(model.targeting!.canConfirm).toBe(true);
  });

  it("is null when nothing is targeting", () => {
    const model = buildSceneModel(server(makeView()), ui(), "big-index");
    expect(model.targeting).toBeNull();
  });

  it("seats are targetable exactly when nextKind is teammate and the seat is a candidate", () => {
    const model = buildSceneModel(server(makeView()), ui({ targeting: { mode: "gear", gearId: "peek", selected: [] } }), "big-index");
    expect(model.seats.find((s) => s.seatId === "s2")!.targetable).toBe(false); // you, not a candidate
    expect(model.seats.find((s) => s.seatId === "s1")!.targetable).toBe(true);
  });
});

describe("removedCardLabels", () => {
  it("maps removedCards to labels", () => {
    const view = makeView({
      attempt: {
        attemptNumber: 1,
        bossCancelled: false,
        gearWindow: null,
        preDealPendingSeatIds: [],
        gearUses: [],
        effects: [],
        reveals: [],
        log: [],
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
