import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import type { SceneServerInput } from "./build-scene-model";
import { buildRunEndModel } from "./run-end-model";

type Result = ExpeditionView["history"][number];

function result(camp: number, attempt: number, status: Result["status"]): Result {
  return { camp, attempt, status, coins: status === "cleared" ? 8 : 0 };
}

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s1",
    runStatus: "lost",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 0, max: 5 },
    plan: [
      { at: 3, tier: "animal", bossId: null },
      { at: 6, tier: "temple", bossId: null },
    ],
    seats: [{ seatId: "s1", characterId: "scout", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, pool: null, usage: [] }],
    yourAbilities: [],
    history: [result(1, 1, "failed"), result(1, 2, "cleared"), result(2, 1, "failed"), result(2, 2, "failed")],
    lastVote: null,
    stage: { tag: "ended", result: "lost" },
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
      purse: 0,
      headline: "The expedition turned back at camp 2",
      detail: "Out of supplies",
      history: [
        { index: 1, attempts: 2, cleared: true, boss: false, caption: "2 tries" },
        { index: 2, attempts: 2, cleared: false, boss: false, caption: "2 tries" },
        { index: 3, attempts: 0, cleared: false, boss: true, caption: "not reached" },
        { index: 4, attempts: 0, cleared: false, boss: false, caption: "not reached" },
        { index: 5, attempts: 0, cleared: false, boss: false, caption: "not reached" },
        { index: 6, attempts: 0, cleared: false, boss: true, caption: "not reached" },
      ],
      isHost: true,
    });
  });

  it("celebrates a won run with the supplies left", () => {
    const history = [1, 2, 3, 4, 5, 6].map((n) => result(n, 1, "cleared"));
    const model = buildRunEndModel(server(makeView({ runStatus: "won", purse: 3, supplies: { count: 1, max: 5 }, history, stage: { tag: "ended", result: "won" } })));
    expect(model.outcome).toBe("won");
    expect(model.campReached).toBe(6);
    expect(model.headline).toBe("The expedition reached the temple!");
    expect(model.detail).toBe("Cleared all 6 camps with 1 supply and 3 coins left");
    expect(model.history[5]).toEqual({ index: 6, attempts: 1, cleared: true, boss: true, caption: "1 try" });
  });

  it("leaves the coins out of a won run with an empty purse", () => {
    const history = [1, 2, 3, 4, 5, 6].map((n) => result(n, 1, "cleared"));
    const model = buildRunEndModel(server(makeView({ runStatus: "won", supplies: { count: 2, max: 5 }, history, stage: { tag: "ended", result: "won" } })));
    expect(model.detail).toBe("Cleared all 6 camps with 2 supplies left");
  });

  it("offers the restart only to the host", () => {
    expect(buildRunEndModel(server(makeView(), "s1")).isHost).toBe(true);
    expect(buildRunEndModel(server(makeView(), "s2")).isHost).toBe(false);
    expect(buildRunEndModel(server(makeView({ yourSeatId: null }), null)).isHost).toBe(false);
  });
});
