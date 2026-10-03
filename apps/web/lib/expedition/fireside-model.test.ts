import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import type { RoomSeatInfo, SceneServerInput } from "./build-scene-model";
import { buildFiresideModel } from "./fireside-model";
import { initialLocalUi, type LocalUiState } from "./local-ui";

function roomSeats(): RoomSeatInfo[] {
  return [
    { seatId: "s1", displayLabel: "Alice", connected: true },
    { seatId: "s2", displayLabel: "Bob", connected: true },
    { seatId: "s3", displayLabel: "Cara", connected: false },
  ];
}

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s2",
    runPhase: "fireside",
    runStatus: "in_progress",
    campNumber: 2,
    supplies: 3,
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: [
      { seatId: "s1", characterId: "scout", kit: [], ready: true, draftPending: false, pool: null, usage: [] },
      { seatId: "s2", characterId: "guide", kit: ["trained-monkey"], ready: false, draftPending: false, pool: null, usage: [] },
      { seatId: "s3", characterId: "medic", kit: ["bait"], ready: false, draftPending: true, pool: null, usage: [] },
    ],
    yourDraftOffer: null,
    yourAbilities: [],
    history: [{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 }],
    attempt: null,
    ...overrides,
  };
}

function server(view: ExpeditionView): SceneServerInput {
  return { game: view, roomSeats: roomSeats(), hostSeatId: "s1" };
}

function ui(overrides: Partial<LocalUiState> = {}): LocalUiState {
  return { ...initialLocalUi(), ...overrides };
}

function seatsWith(you: Partial<ExpeditionView["seats"][number]>): ExpeditionView["seats"] {
  return makeView().seats.map((s) => (s.seatId === "s2" ? { ...s, ...you } : s));
}

describe("topBar", () => {
  it("names the camp about to start", () => {
    expect(buildFiresideModel(server(makeView()), ui()).topBar).toEqual({ supplies: 3, camp: "Camp 2 of 6", boss: null });
  });

  it("previews a boss camp, by name once the twist is revealed", () => {
    expect(buildFiresideModel(server(makeView({ campNumber: 3 })), ui()).topBar.boss).toEqual({ text: "Boss camp ahead", dim: false });
    const revealed = makeView({ campNumber: 3, bossTwists: { camp3: "radio-silence", camp6: null } });
    expect(buildFiresideModel(server(revealed), ui()).topBar.boss).toEqual({ text: "Boss ahead: Monsoon", dim: false });
  });
});

describe("trail", () => {
  it("marks cleared camps, the next camp and boss camps 3 and 6", () => {
    const model = buildFiresideModel(server(makeView({ campNumber: 3, history: [
      { campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 },
      { campNumber: 2, attemptNumber: 1, status: "failed", suppliesSpent: 1 },
      { campNumber: 2, attemptNumber: 2, status: "succeeded", suppliesSpent: 0 },
    ] })), ui());
    expect(model.trail).toEqual([
      { campNumber: 1, state: "cleared", boss: false, caption: "cleared" },
      { campNumber: 2, state: "cleared", boss: false, caption: "cleared" },
      { campNumber: 3, state: "next", boss: true, caption: "next, boss" },
      { campNumber: 4, state: "ahead", boss: false, caption: "" },
      { campNumber: 5, state: "ahead", boss: false, caption: "" },
      { campNumber: 6, state: "ahead", boss: true, caption: "boss" },
    ]);
  });

  it("keeps a failed camp as the next stop and counts the retry", () => {
    const model = buildFiresideModel(server(makeView({ history: [
      { campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 },
      { campNumber: 2, attemptNumber: 1, status: "failed", suppliesSpent: 1 },
    ] })), ui());
    expect(model.trail[1]).toEqual({ campNumber: 2, state: "next", boss: false, caption: "try 2" });
  });
});

describe("draft", () => {
  it("offers the drafted sources with name and window badge", () => {
    const model = buildFiresideModel(server(makeView({ yourDraftOffer: ["trained-monkey", "rain-poncho"] })), ui());
    expect(model.draft).toEqual({
      kind: "offer",
      pick: "draft",
      items: [
        { sourceId: "trained-monkey", objectId: "draft:trained-monkey", name: "Trained Monkey", badge: "Between tricks, 1 per camp" },
        { sourceId: "rain-poncho", objectId: "draft:rain-poncho", name: "Rain Poncho", badge: "Before the deal, Once per run" },
      ],
    });
  });

  it("shows the source just taken once the pick is made", () => {
    expect(buildFiresideModel(server(makeView()), ui()).draft).toEqual({ kind: "taken", sourceId: "trained-monkey", name: "Trained Monkey" });
  });

  it("deals nothing after a failed camp", () => {
    const view = makeView({ history: [{ campNumber: 2, attemptNumber: 1, status: "failed", suppliesSpent: 1 }] });
    expect(buildFiresideModel(server(view), ui()).draft).toEqual({ kind: "none", text: "Nothing new after a failed camp" });
  });

  it("at muster offers only the characters nobody has taken", () => {
    const view = makeView({
      runPhase: "muster",
      history: [],
      seats: makeView().seats.map((s) => (s.seatId === "s2" ? { ...s, characterId: null, kit: [] } : s)),
    });
    expect(buildFiresideModel(server(view), ui()).draft).toEqual({
      kind: "offer",
      pick: "character",
      items: [
        { sourceId: "guide", objectId: "draft:guide", name: "The Guide", badge: "Cuts the trail" },
        { sourceId: "botanist", objectId: "draft:botanist", name: "The Botanist", badge: "Brews jungle herbs" },
        { sourceId: "signaller", objectId: "draft:signaller", name: "The Signaller", badge: "Talks in drums" },
        { sourceId: "cartographer", objectId: "draft:cartographer", name: "The Cartographer", badge: "Redraws the route" },
      ],
    });
  });

  it("at muster shows your character once picked", () => {
    const view = makeView({ runPhase: "muster", history: [] });
    expect(buildFiresideModel(server(view), ui()).draft).toEqual({ kind: "taken", sourceId: "guide", name: "The Guide" });
  });
});

describe("kit", () => {
  it("lists your character, then your kit, with badges", () => {
    expect(buildFiresideModel(server(makeView()), ui()).kit).toEqual([
      { sourceId: "guide", objectId: "kit:guide", name: "The Guide", badge: "Cuts the trail" },
      { sourceId: "trained-monkey", objectId: "kit:trained-monkey", name: "Trained Monkey", badge: "Between tricks, 1 per camp" },
    ]);
  });

  it("marks a passive-only character as Always", () => {
    const view = makeView({ seats: seatsWith({ characterId: "signaller", kit: [] }) });
    expect(buildFiresideModel(server(view), ui()).kit).toEqual([
      { sourceId: "signaller", objectId: "kit:signaller", name: "The Signaller", badge: "Talks in drums" },
    ]);
  });

  it("is null for a spectator", () => {
    expect(buildFiresideModel(server(makeView({ yourSeatId: null })), ui()).kit).toBeNull();
  });
});

describe("crew", () => {
  it("lists you first, then the table order, with status and public sources", () => {
    expect(buildFiresideModel(server(makeView()), ui()).crew).toEqual([
      { seatId: "s2", displayLabel: "Bob", isYou: true, connected: true, status: "resting", sources: [{ sourceId: "guide", name: "The Guide" }, { sourceId: "trained-monkey", name: "Trained Monkey" }] },
      { seatId: "s3", displayLabel: "Cara", isYou: false, connected: false, status: "drafting", sources: [{ sourceId: "medic", name: "The Medic" }, { sourceId: "bait", name: "Bait" }] },
      { seatId: "s1", displayLabel: "Alice", isYou: false, connected: true, status: "ready", sources: [{ sourceId: "scout", name: "The Scout" }] },
    ]);
  });

  it("shows a seat with no character yet as choosing", () => {
    const view = makeView({ runPhase: "muster", seats: seatsWith({ characterId: null, kit: [] }) });
    expect(buildFiresideModel(server(view), ui()).crew[0]).toMatchObject({ seatId: "s2", status: "choosing", sources: [] });
  });
});

describe("ready", () => {
  it("is blocked while your draft pick is due, open after it, done once readied", () => {
    expect(buildFiresideModel(server(makeView({ yourDraftOffer: ["peek"] })), ui()).ready).toEqual({ objectId: "ready", state: "blocked" });
    expect(buildFiresideModel(server(makeView()), ui()).ready).toEqual({ objectId: "ready", state: "open" });
    expect(buildFiresideModel(server(makeView({ seats: seatsWith({ ready: true }) })), ui()).ready).toEqual({ objectId: "ready", state: "done" });
    expect(buildFiresideModel(server(makeView({ yourSeatId: null })), ui()).ready).toBeNull();
  });

  it("is blocked until you have picked a character", () => {
    const view = makeView({ runPhase: "muster", seats: seatsWith({ characterId: null, kit: [] }) });
    expect(buildFiresideModel(server(view), ui()).ready).toEqual({ objectId: "ready", state: "blocked" });
  });
});

describe("tooltip", () => {
  it("shows the hovered source's rules with its window and limit", () => {
    const poncho = buildFiresideModel(server(makeView({ yourDraftOffer: ["rain-poncho"] })), ui({ tooltipSourceId: "rain-poncho" })).tooltip;
    expect(poncho).toEqual({
      title: "Rain Poncho",
      text: "Cancel this camp's boss twist, and nobody may whisper this camp. (Before the deal, Once per run)",
      reason: null,
    });
    expect(buildFiresideModel(server(makeView()), ui()).tooltip).toBeNull();
  });

  it("adds a character's theme", () => {
    const scout = buildFiresideModel(server(makeView()), ui({ tooltipSourceId: "scout" })).tooltip;
    expect(scout?.text).toBe("Eyes in the canopy. See a random card in a teammate's hand. (Between tricks, 1 per camp)");
  });
});

describe("prompt", () => {
  it("greets a cleared camp with the draft", () => {
    expect(buildFiresideModel(server(makeView({ yourDraftOffer: ["trained-monkey"] })), ui()).prompt).toEqual({
      text: "Camp 1 cleared! Take one",
      tone: "your-move",
    });
  });

  it("asks you to pick a character at muster", () => {
    const view = makeView({ runPhase: "muster", history: [], seats: seatsWith({ characterId: null, kit: [] }) });
    expect(buildFiresideModel(server(view), ui()).prompt).toEqual({ text: "Pick your character", tone: "your-move" });
  });
});

describe("lastResult", () => {
  it("is the last history entry", () => {
    expect(buildFiresideModel(server(makeView()), ui()).lastResult).toEqual({ campNumber: 1, status: "succeeded" });
    expect(buildFiresideModel(server(makeView({ history: [] })), ui()).lastResult).toBeNull();
  });
});
