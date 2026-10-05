import { describe, expect, it } from "vitest";
import type { ExpeditionCampPreviewView, ExpeditionView } from "@games/rules";
import { buildProgressMap } from "./progress-map";

function preview(index: number, over: Partial<ExpeditionCampPreviewView> = {}): ExpeditionCampPreviewView {
  return { index, location: "jungle", weather: "fair", pairing: null, event: null, slotKinds: ["win-card", "win-card"], bossId: null, shop: false, survey: null, ...over };
}

function view(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s1",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 12,
    supplies: { count: 3, max: 4 },
    plan: [
      { at: 3, tier: "animal", bossId: "tiger" },
      { at: 5, tier: "disaster", bossId: null },
      { at: 6, tier: "temple", bossId: "temple" },
    ],
    seats: [],
    kicked: [],
    yourAbilities: [],
    history: [
      { camp: 1, attempt: 1, location: "jungle", weather: "fair", status: "cleared", coins: 8 },
      { camp: 2, attempt: 1, location: "clifftop", weather: "rain", status: "failed", coins: 0 },
      { camp: 2, attempt: 2, location: "clifftop", weather: "rain", status: "restarted", coins: 0 },
      { camp: 2, attempt: 3, location: "clifftop", weather: "rain", status: "cleared", coins: 6 },
      { camp: 3, attempt: 1, location: "cave", weather: "night", status: "failed", coins: 0 },
    ],
    lastVote: null,
    stage: { tag: "camp", camp: preview(3, { location: "cave", weather: "night", bossId: "tiger" }), mods: [], attempt: undefined as never },
    ...overrides,
  };
}

describe("buildProgressMap", () => {
  it("lists every camp: where each was played and how, the crew's camp and its try, and the bosses as far as revealed", () => {
    expect(buildProgressMap(view())).toEqual({
      heading: "Standard run, camp 3 of 6",
      stops: [
        { index: 1, state: "cleared", kind: "camp", boss: null, place: { locationId: "jungle", location: "Jungle", weatherId: "fair", weather: "Fair" }, note: "Cleared" },
        { index: 2, state: "cleared", kind: "camp", boss: null, place: { locationId: "clifftop", location: "Clifftop", weatherId: "rain", weather: "Rain" }, note: "Cleared on try 2" },
        { index: 3, state: "here", kind: "boss", boss: { id: "tiger", tier: "animal", name: "Tiger" }, place: { locationId: "cave", location: "Cave", weatherId: "night", weather: "Night" }, note: "You are here, try 2" },
        { index: 4, state: "ahead", kind: "camp", boss: null, place: null, note: "" },
        { index: 5, state: "ahead", kind: "boss", boss: { id: null, tier: "disaster", name: "Disaster boss" }, place: null, note: "" },
        { index: 6, state: "ahead", kind: "temple", boss: { id: "temple", tier: "temple", name: "The Temple" }, place: null, note: "" },
      ],
    });
  });

  it("between camps the next camp is where the crew heads, its place unknown until the route is chosen", () => {
    const map = buildProgressMap(view({ history: view().history.slice(0, 4), stage: { tag: "route", options: [{ id: "a", next: preview(3), swapsBoss: false }], ballots: [] } }))!;
    expect(map.heading).toBe("Standard run, camp 3 of 6");
    expect(map.stops[2]).toEqual({ index: 3, state: "here", kind: "boss", boss: { id: "tiger", tier: "animal", name: "Tiger" }, place: null, note: "Next" });
  });

  it("marks where a lost run ended", () => {
    const map = buildProgressMap(view({ runStatus: "lost", stage: { tag: "ended", result: "lost" } }))!;
    expect(map.heading).toBe("Standard run, 6 camps");
    expect(map.stops[2]).toMatchObject({ state: "lost", note: "Lost here", place: { location: "Cave", weather: "Night" } });
  });

  it("has no map at muster", () => {
    expect(buildProgressMap(view({ length: null, campCount: null, plan: [], history: [], stage: { tag: "muster", ballots: [] } }))).toBeNull();
  });
});
