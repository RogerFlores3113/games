import { describe, expect, it } from "vitest";
import type { ExpeditionModView, ExpeditionView } from "@games/rules";
import { buildModChips, buildSky, modTooltip, whisperBlocker } from "./weather-model";

const STORM: ExpeditionModView = { id: "thunderstorm", kind: "weather", strength: "full", status: [{ kind: "chance", percent: 30, strikesLeft: 2 }] };
const STRUCK: ExpeditionModView = { ...STORM, status: [{ kind: "chance", percent: 40, strikesLeft: 1 }, { kind: "strike" }] };
const CLIFFTOP: ExpeditionModView = { id: "clifftop", kind: "location", strength: "full", status: [] };
const RAIN: ExpeditionModView = { id: "rain", kind: "weather", strength: "full", status: [] };

/** A camp view with only what the sky and the chips read: the spec, the
 * mods, and the attempt's current trick. */
function campView(weather: string, mods: ExpeditionModView[], trick = 0): ExpeditionView {
  return {
    yourSeatId: "s1",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 3, max: 4 },
    plan: [],
    seats: [],
    yourAbilities: [],
    history: [],
    lastVote: null,
    stage: {
      tag: "camp",
      camp: { index: 2, location: "clifftop", weather, pairing: null, event: null, slotKinds: [], bossId: null, shop: false },
      mods,
      attempt: { attemptNumber: 1, camp: { currentTrick: { index: trick } } } as never,
    },
  } as ExpeditionView;
}

describe("buildModChips", () => {
  it("names each layer in fold order with its live reading", () => {
    expect(buildModChips(campView("thunderstorm", [CLIFFTOP, STORM]))).toEqual([
      { id: "clifftop", objectId: "mod:clifftop", kind: "location", name: "Clifftop", badge: null, pips: 0, alert: false },
      { id: "thunderstorm", objectId: "mod:thunderstorm", kind: "weather", name: "Thunderstorm", badge: "30%", pips: 2, alert: false },
    ]);
  });

  it("turns the storm chip into an alert while a strike sits on the trick", () => {
    expect(buildModChips(campView("thunderstorm", [STRUCK]))[0]).toMatchObject({ badge: "Lowest wins", pips: 1, alert: true });
  });

  it("drops the percentage once no strike can come", () => {
    const spent: ExpeditionModView = { ...STORM, status: [{ kind: "chance", percent: 0, strikesLeft: 0 }] };
    expect(buildModChips(campView("thunderstorm", [spent]))[0]).toMatchObject({ badge: null, pips: 0 });
  });
});

describe("buildSky", () => {
  it("rains under rain, storms under a thunderstorm, and is dry in fair weather", () => {
    expect(buildSky(campView("rain", [RAIN]))).toEqual({ location: "clifftop", precipitation: "rain", strike: null, notice: null });
    expect(buildSky(campView("thunderstorm", [STORM]))?.precipitation).toBe("storm");
    expect(buildSky(campView("fair", []))?.precipitation).toBe("none");
  });

  it("keys a strike by camp, attempt and trick, so its flash plays once, and says what it does", () => {
    expect(buildSky(campView("thunderstorm", [STRUCK], 4))).toEqual({
      location: "clifftop",
      precipitation: "storm",
      strike: "2:1:4",
      notice: "Lightning struck: the lowest card wins this trick",
    });
  });
});

describe("modTooltip", () => {
  it("gives the modifier's sentence, its kind, and what its reading means", () => {
    expect(modTooltip(campView("thunderstorm", [STORM]), "thunderstorm")).toEqual({
      title: "Thunderstorm",
      text: "Lightning may strike before a trick, and then the lowest card wins it.",
      badges: ["Weather", "30% next trick", "2 strikes left"],
      reason: null,
    });
    expect(modTooltip(campView("thunderstorm", [STORM]), "rain")).toBeNull();
  });
});

describe("whisperBlocker", () => {
  it("names the rain when it is in the camp", () => {
    expect(whisperBlocker(campView("rain", [CLIFFTOP, RAIN]))).toBe("Rain stops whispers");
    expect(whisperBlocker(campView("thunderstorm", [STORM]))).toBeNull();
  });
});
