import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import type { RoomSeatInfo, SceneServerInput } from "./build-scene-model";
import { buildFiresideModel, toggledLoadout } from "./fireside-model";
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
      { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
      { seatId: "s2", equippedGearIds: [], ready: false, draftPending: false },
      { seatId: "s3", equippedGearIds: ["chatter"], ready: false, draftPending: true },
    ],
    yourOwnedGearIds: ["chatter", "peek"],
    yourDraftOffer: null,
    yourCapacity: 2,
    yourBaseCapacity: 2,
    yourGear: [],
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
  it("offers the drafted gear with name, size and window", () => {
    const model = buildFiresideModel(server(makeView({ yourDraftOffer: ["peek", "jam"] })), ui());
    expect(model.draft).toEqual({
      kind: "offer",
      items: [
        { gearId: "peek", objectId: "draft:peek", name: "Spyglass", size: 1, window: "between tricks" },
        { gearId: "jam", objectId: "draft:jam", name: "Rain Poncho", size: 2, window: "before the deal" },
      ],
    });
  });

  it("shows the gear just taken once the pick is made", () => {
    expect(buildFiresideModel(server(makeView()), ui()).draft).toEqual({ kind: "taken", gearId: "peek", name: "Spyglass" });
  });

  it("deals nothing after a failed camp", () => {
    const view = makeView({ history: [{ campNumber: 2, attemptNumber: 1, status: "failed", suppliesSpent: 1 }] });
    expect(buildFiresideModel(server(view), ui()).draft).toEqual({ kind: "none", text: "No new gear after a failed camp" });
  });
});

describe("backpack", () => {
  it("fills slots in packing order and marks what still fits", () => {
    const view = makeView({
      yourOwnedGearIds: ["chatter", "jam", "peek"],
      yourCapacity: 2,
      yourBaseCapacity: 2,
      seats: seatsWith({ equippedGearIds: ["chatter"] }),
    });
    expect(buildFiresideModel(server(view), ui()).backpack).toEqual({
      capacity: 2,
      used: 1,
      packed: [{ gearId: "chatter", name: "Signal Whistle", size: 1, firstSlot: 0 }],
      owned: [
        { gearId: "chatter", objectId: "loadout:chatter", name: "Signal Whistle", size: 1, equipped: true, blocked: null },
        { gearId: "jam", objectId: "loadout:jam", name: "Rain Poncho", size: 2, equipped: false, blocked: { caption: "too big", reason: "too big to pack: needs 2 free, 1 left" } },
        { gearId: "peek", objectId: "loadout:peek", name: "Spyglass", size: 1, equipped: false, blocked: null },
      ],
    });
  });

  it("locks an equipped Energy Tonic while the other packed gear needs its +2", () => {
    const needed = makeView({
      yourOwnedGearIds: ["overclock", "jam"],
      yourCapacity: 3,
      yourBaseCapacity: 1,
      seats: seatsWith({ equippedGearIds: ["overclock", "jam"] }),
    });
    const owned = buildFiresideModel(server(needed), ui({ tooltipGearId: "overclock" }));
    expect(owned.backpack?.owned[0]?.blocked).toEqual({ caption: "needed", reason: "Your other gear needs the Tonic's +2" });
    expect(owned.tooltip?.reason).toBe("Your other gear needs the Tonic's +2");

    const spare = makeView({
      yourOwnedGearIds: ["overclock", "chatter"],
      yourCapacity: 3,
      yourBaseCapacity: 1,
      seats: seatsWith({ equippedGearIds: ["overclock", "chatter"] }),
    });
    const free = buildFiresideModel(server(spare), ui({ tooltipGearId: "overclock" }));
    expect(free.backpack?.owned[0]?.blocked).toBeNull();
    expect(free.tooltip?.reason).toBeNull();
  });

  it("is null for a spectator", () => {
    expect(buildFiresideModel(server(makeView({ yourSeatId: null })), ui()).backpack).toBeNull();
    expect(buildFiresideModel(server(makeView({ yourSeatId: "s2" })), ui()).backpack).not.toBeNull();
  });
});

describe("toggledLoadout", () => {
  it("packs an unpacked item and unpacks a packed one", () => {
    const model = buildFiresideModel(server(makeView({ seats: seatsWith({ equippedGearIds: ["chatter"] }) })), ui());
    expect(toggledLoadout(model, "peek")).toEqual(["chatter", "peek"]);
    expect(toggledLoadout(model, "chatter")).toEqual([]);
  });
});

describe("crew", () => {
  it("lists you first, then the table order, with status and public loadout", () => {
    expect(buildFiresideModel(server(makeView()), ui()).crew).toEqual([
      { seatId: "s2", displayLabel: "Bob", isYou: true, connected: true, status: "packing", gear: [] },
      { seatId: "s3", displayLabel: "Cara", isYou: false, connected: false, status: "drafting", gear: [{ gearId: "chatter", name: "Signal Whistle" }] },
      { seatId: "s1", displayLabel: "Alice", isYou: false, connected: true, status: "ready", gear: [] },
    ]);
  });
});

describe("ready", () => {
  it("is blocked while your draft pick is due, open after it, done once readied", () => {
    expect(buildFiresideModel(server(makeView({ yourDraftOffer: ["peek"] })), ui()).ready).toEqual({ objectId: "ready", state: "blocked" });
    expect(buildFiresideModel(server(makeView()), ui()).ready).toEqual({ objectId: "ready", state: "open" });
    expect(buildFiresideModel(server(makeView({ seats: seatsWith({ ready: true }) })), ui()).ready).toEqual({ objectId: "ready", state: "done" });
    expect(buildFiresideModel(server(makeView({ yourSeatId: null })), ui()).ready).toBeNull();
  });
});

describe("tooltip", () => {
  it("shows the hovered gear's rules, and why an owned item won't fit", () => {
    const view = makeView({ yourOwnedGearIds: ["jam"], yourCapacity: 1 });
    const jam = buildFiresideModel(server(view), ui({ tooltipGearId: "jam" })).tooltip;
    expect(jam?.title).toBe("Rain Poncho");
    expect(jam?.reason).toBe("too big to pack: needs 2 free, 1 left");
    const offered = buildFiresideModel(server(makeView({ yourDraftOffer: ["peek"] })), ui({ tooltipGearId: "peek" })).tooltip;
    expect(offered?.title).toBe("Spyglass");
    expect(offered?.reason).toBeNull();
    expect(buildFiresideModel(server(view), ui()).tooltip).toBeNull();
  });
});

describe("prompt", () => {
  it("greets a cleared camp with the draft", () => {
    expect(buildFiresideModel(server(makeView({ yourDraftOffer: ["peek"] })), ui()).prompt).toEqual({
      text: "Camp 1 cleared! Pick one gear",
      tone: "your-move",
    });
  });
});

describe("lastResult", () => {
  it("is the last history entry", () => {
    expect(buildFiresideModel(server(makeView()), ui()).lastResult).toEqual({ campNumber: 1, status: "succeeded" });
    expect(buildFiresideModel(server(makeView({ history: [] })), ui()).lastResult).toBeNull();
  });
});
