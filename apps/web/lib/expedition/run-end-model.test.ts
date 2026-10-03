import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import type { SceneServerInput } from "./build-scene-model";
import { buildRunEndModel } from "./run-end-model";

type Result = ExpeditionView["history"][number];

function result(campNumber: number, attemptNumber: number, status: Result["status"]): Result {
  return { campNumber, attemptNumber, status, suppliesSpent: status === "failed" ? 1 : 0 };
}

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s1",
    runPhase: "ended",
    runStatus: "lost",
    campNumber: 2,
    supplies: 0,
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: [{ seatId: "s1", characterId: "scout", kit: [], ready: false, draftPending: false, pool: null, usage: [] }],
    yourDraftOffer: null,
    yourAbilities: [],
    history: [result(1, 1, "failed"), result(1, 2, "succeeded"), result(2, 1, "failed"), result(2, 2, "failed")],
    attempt: null,
    ...overrides,
  };
}

function server(view: ExpeditionView, hostSeatId: string | null = "s1"): SceneServerInput {
  return { game: view, roomSeats: [{ seatId: "s1", displayLabel: "Ana", connected: true }], hostSeatId };
}

describe("buildRunEndModel", () => {
  it("tells a lost run where it turned back, with the tries per camp", () => {
    expect(buildRunEndModel(server(makeView()))).toEqual({
      sceneKey: "run-end",
      outcome: "lost",
      campReached: 2,
      supplies: 0,
      headline: "The expedition turned back at camp 2",
      detail: "Out of supplies",
      history: [
        { campNumber: 1, attempts: 2, cleared: true, boss: false, caption: "2 tries" },
        { campNumber: 2, attempts: 2, cleared: false, boss: false, caption: "2 tries" },
        { campNumber: 3, attempts: 0, cleared: false, boss: true, caption: "not reached" },
        { campNumber: 4, attempts: 0, cleared: false, boss: false, caption: "not reached" },
        { campNumber: 5, attempts: 0, cleared: false, boss: false, caption: "not reached" },
        { campNumber: 6, attempts: 0, cleared: false, boss: true, caption: "not reached" },
      ],
      isHost: true,
    });
  });

  it("celebrates a won run with the supplies left", () => {
    const history = [1, 2, 3, 4, 5, 6].map((n) => result(n, 1, "succeeded"));
    const model = buildRunEndModel(server(makeView({ runStatus: "won", campNumber: 6, supplies: 1, history })));
    expect(model.outcome).toBe("won");
    expect(model.campReached).toBe(6);
    expect(model.headline).toBe("The expedition reached the temple!");
    expect(model.detail).toBe("Cleared all 6 camps with 1 supply left");
    expect(model.history[5]).toEqual({ campNumber: 6, attempts: 1, cleared: true, boss: true, caption: "1 try" });
  });

  it("offers the restart only to the host", () => {
    expect(buildRunEndModel(server(makeView(), "s1")).isHost).toBe(true);
    expect(buildRunEndModel(server(makeView(), "s2")).isHost).toBe(false);
    expect(buildRunEndModel(server(makeView({ yourSeatId: null }), null)).isHost).toBe(false);
  });
});
