import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import { READY_ID } from "./expedition-ids";
import type { RoomSeatInfo, SceneServerInput } from "./build-scene-model";
import type { BetweenCampsModel } from "./between-camps-model";
import { buildBetweenCampsModel } from "./between-camps-model";

function roomSeats(): RoomSeatInfo[] {
  return [
    { seatId: "s1", displayLabel: "Alice", connected: true },
    { seatId: "s2", displayLabel: "Bob", connected: true },
    { seatId: "s3", displayLabel: "Cara", connected: true },
  ];
}

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s2",
    runPhase: "fireside",
    runStatus: "in_progress",
    campNumber: 2,
    supplies: 5,
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: [
      { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
      { seatId: "s2", equippedGearIds: [], ready: false, draftPending: false },
      { seatId: "s3", equippedGearIds: ["chatter"], ready: true, draftPending: false },
    ],
    yourOwnedGearIds: ["chatter"],
    yourDraftOffer: null,
    yourCapacity: 3,
    yourGear: [],
    history: [],
    attempt: null,
    ...overrides,
  };
}

function server(view: ExpeditionView, seats = roomSeats()): SceneServerInput {
  return { game: view, roomSeats: seats };
}

describe("draftOffer", () => {
  it("is null when yourDraftOffer is null", () => {
    const model: BetweenCampsModel = buildBetweenCampsModel(server(makeView({ yourDraftOffer: null })));
    expect(model.draftOffer).toBeNull();
  });

  it("has one entry per offered gear id with GEAR_DISPLAY fields and a draft objectId", () => {
    const model = buildBetweenCampsModel(server(makeView({ yourDraftOffer: ["peek", "jam"] })));
    expect(model.draftOffer).toHaveLength(2);
    const peek = model.draftOffer!.find((g) => g.gearId === "peek")!;
    expect(peek.name).toBe("Spyglass");
    expect(peek.size).toBe(1);
    expect(peek.window).toBe("between-tricks");
    expect(peek.objectId).toBe("draft:peek");
  });
});

describe("owned", () => {
  it("lists yourOwnedGearIds in order, marks equipped and fits", () => {
    const model = buildBetweenCampsModel(
      server(
        makeView({
          yourOwnedGearIds: ["chatter", "peek"],
          yourCapacity: 1,
          seats: [
            { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
            { seatId: "s2", equippedGearIds: ["chatter"], ready: false, draftPending: false },
            { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
          ],
        }),
      ),
    );
    expect(model.owned.map((g) => g.gearId)).toEqual(["chatter", "peek"]);
    const chatter = model.owned.find((g) => g.gearId === "chatter")!;
    expect(chatter.equipped).toBe(true);
    expect(chatter.fits).toBe(true); // already equipped
    expect(chatter.objectId).toBe("loadout:chatter");

    const peek = model.owned.find((g) => g.gearId === "peek")!;
    expect(peek.equipped).toBe(false);
    // capacityUsed = 1 (chatter, size 1); capacity 1; peek size 1 -> 1+1=2 > 1 -> doesn't fit
    expect(peek.fits).toBe(false);
  });

  it("fits is false for a non-equipped item when capacity is null", () => {
    const model = buildBetweenCampsModel(
      server(
        makeView({
          yourOwnedGearIds: ["peek"],
          yourCapacity: null,
          seats: [
            { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
            { seatId: "s2", equippedGearIds: [], ready: false, draftPending: false },
            { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
          ],
        }),
      ),
    );
    expect(model.owned[0]!.fits).toBe(false);
  });

  it("computes capacityUsed as the sum of equipped item sizes", () => {
    const model = buildBetweenCampsModel(
      server(
        makeView({
          yourOwnedGearIds: ["chatter", "peek"],
          yourCapacity: 5,
          seats: [
            { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
            { seatId: "s2", equippedGearIds: ["chatter", "peek"], ready: false, draftPending: false },
            { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
          ],
        }),
      ),
    );
    expect(model.capacityUsed).toBe(2); // chatter size 1 + peek size 1
    expect(model.capacity).toBe(5);
  });
});

describe("youReady / readyObjectId", () => {
  it("reads the viewer's own seat.ready", () => {
    const model = buildBetweenCampsModel(server(makeView({ yourSeatId: "s2" })));
    expect(model.youReady).toBe(false);
    expect(model.readyObjectId).toBe(READY_ID);

    const readyModel = buildBetweenCampsModel(server(makeView({ yourSeatId: "s1" })));
    expect(readyModel.youReady).toBe(true);
  });
});

describe("sign.label", () => {
  it("shows won/lost from runStatus first", () => {
    expect(buildBetweenCampsModel(server(makeView({ runStatus: "won" }))).sign.label).toBe("Temple reached");
    expect(buildBetweenCampsModel(server(makeView({ runStatus: "lost" }))).sign.label).toBe("Turned back");
  });

  it("shows Pick your gear when a draft offer is present", () => {
    const model = buildBetweenCampsModel(server(makeView({ yourDraftOffer: ["peek"] })));
    expect(model.sign.label).toBe("Pick your gear");
  });

  it("shows Pack and ready up when not ready and no draft due", () => {
    const model = buildBetweenCampsModel(server(makeView({ yourSeatId: "s2", yourDraftOffer: null })));
    expect(model.sign.label).toBe("Pack and ready up");
  });

  it("shows Waiting on names of seats not ready otherwise", () => {
    const model = buildBetweenCampsModel(
      server(
        makeView({
          yourSeatId: "s1",
          yourDraftOffer: null,
          seats: [
            { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
            { seatId: "s2", equippedGearIds: [], ready: false, draftPending: false },
            { seatId: "s3", equippedGearIds: [], ready: false, draftPending: false },
          ],
        }),
      ),
    );
    expect(model.sign.label).toBe("Waiting on Bob, Cara");
  });
});

describe("seats", () => {
  it("carries displayLabel/ready/draftPending/connected per seat", () => {
    const model = buildBetweenCampsModel(server(makeView()));
    const s3 = model.seats.find((s) => s.seatId === "s3")!;
    expect(s3.displayLabel).toBe("Cara");
    expect(s3.ready).toBe(true);
  });
});

describe("lastResult", () => {
  it("is null with no history", () => {
    expect(buildBetweenCampsModel(server(makeView({ history: [] }))).lastResult).toBeNull();
  });

  it("is the last history entry's campNumber/status", () => {
    const model = buildBetweenCampsModel(
      server(
        makeView({
          history: [
            { campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 1 },
            { campNumber: 2, attemptNumber: 2, status: "failed", suppliesSpent: 2 },
          ],
        }),
      ),
    );
    expect(model.lastResult).toEqual({ campNumber: 2, status: "failed" });
  });
});

describe("purity", () => {
  it("is deterministic for the same input", () => {
    const input = server(makeView());
    expect(buildBetweenCampsModel(input)).toEqual(buildBetweenCampsModel(input));
  });
});
