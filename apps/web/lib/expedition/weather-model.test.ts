import { describe, expect, it } from "vitest";
import type { ExpeditionCardIdentityView, ExpeditionModView, ExpeditionView } from "@games/rules";
import { buildModChips, buildSky, modTooltip, whisperBlocker } from "./weather-model";

const STORM: ExpeditionModView = { id: "thunderstorm", kind: "weather", strength: "full", status: [{ kind: "chance", percent: 30, strikesLeft: 2 }] };
const STRUCK: ExpeditionModView = { ...STORM, status: [{ kind: "chance", percent: 40, strikesLeft: 1 }, { kind: "strike" }] };
const CLIFFTOP: ExpeditionModView = { id: "clifftop", kind: "location", strength: "full", status: [] };
const RAIN: ExpeditionModView = { id: "rain", kind: "weather", strength: "full", status: [] };

/** A camp view with only what the sky and the chips read: the spec, the
 * mods, and the attempt's current trick. */
function campView(weather: string, mods: ExpeditionModView[], trick = 0, removedCards: ExpeditionCardIdentityView[] = []): ExpeditionView {
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
      camp: { index: 2, location: "clifftop", weather, pairing: null, event: null, slotKinds: [], bossId: null, shop: false, survey: null },
      mods,
      attempt: { attemptNumber: 1, camp: { currentTrick: { index: trick }, removedCards } } as never,
    },
  } as ExpeditionView;
}

describe("buildModChips", () => {
  it("names each layer in fold order with its live reading", () => {
    expect(buildModChips(campView("thunderstorm", [CLIFFTOP, STORM]))).toEqual([
      { id: "clifftop", objectId: "mod:clifftop", kind: "location", strength: "full", name: "Clifftop", badge: null, pips: 0, gauge: null, alert: false },
      { id: "thunderstorm", objectId: "mod:thunderstorm", kind: "weather", strength: "full", name: "Thunderstorm", badge: "30%", pips: 2, gauge: null, alert: false },
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
    expect(buildSky(campView("rain", [RAIN]))).toEqual({ location: "clifftop", backdrop: "clifftop", precipitation: "rain", haze: "none", flood: null, strike: null, notice: null, bloodMoon: false });
    expect(buildSky(campView("thunderstorm", [STORM]))?.precipitation).toBe("storm");
    expect(buildSky(campView("fair", []))?.precipitation).toBe("none");
  });

  it("keys a strike by camp, attempt and trick, so its flash plays once, and says what it does", () => {
    expect(buildSky(campView("thunderstorm", [STRUCK], 4))).toEqual({
      location: "clifftop",
      backdrop: "clifftop",
      precipitation: "storm",
      haze: "none",
      flood: null,
      strike: "2:1:4",
      notice: "Lightning struck: the lowest card wins this trick",
      bloodMoon: false,
    });
  });

  it("turns red while the Blood Moon is up, and not on the tricks it sets", () => {
    const moon = (activeNow: boolean): ExpeditionModView => ({ id: "blood-moon", kind: "disaster", strength: "full", status: [{ kind: "alternating", activeNow }] });
    expect(buildSky(campView("fair", [moon(true)]))?.bloodMoon).toBe(true);
    expect(buildSky(campView("fair", [moon(false)]))?.bloodMoon).toBe(false);
  });

  it("raises the Monsoon's river like Flooding's", () => {
    const monsoon: ExpeditionModView = { id: "monsoon", kind: "disaster", strength: "full", status: [{ kind: "meter", left: 3, of: 12 }] };
    expect(buildSky(campView("rain", [monsoon]))?.flood).toBe(0.75);
    expect(buildModChips(campView("rain", [monsoon]))[0]).toMatchObject({ name: "Monsoon", badge: "3 left", gauge: { left: 3, of: 12 }, alert: false });
  });
});

describe("modTooltip", () => {
  it("gives the modifier's sentence, its kind, and what its reading means", () => {
    expect(modTooltip(campView("thunderstorm", [STORM]), "thunderstorm")).toEqual({
      title: "Thunderstorm",
      text: "Watch the sky: lightning may strike before a trick, and then the lowest card wins it.",
      badges: ["Weather", "30% next trick", "2 strikes left"],
      reason: null,
    });
    expect(modTooltip(campView("thunderstorm", [STORM]), "rain")).toBeNull();
  });
});

describe("whisperBlocker", () => {
  it("names the rain when it is in the camp", () => {
    expect(whisperBlocker(campView("rain", [CLIFFTOP, RAIN]))).toBe("Blocked by Rain");
    expect(whisperBlocker(campView("thunderstorm", [STORM]))).toBeNull();
  });
});

const flood = (left: number): ExpeditionModView => ({ id: "flooding", kind: "pairing", strength: "full", status: [{ kind: "meter", left, of: 14 }] });

describe("the flooded cave", () => {
  it("reads the tricks left on the chip with its gauge, and alerts one trick from the flood", () => {
    expect(buildModChips(campView("rain", [flood(5)]))[0]).toMatchObject({ name: "Flooding", badge: "5 left", gauge: { left: 5, of: 14 }, alert: false });
    expect(buildModChips(campView("rain", [flood(1)]))[0]).toMatchObject({ badge: "1 left", alert: true });
    expect(buildModChips(campView("rain", [flood(0)]))[0]).toMatchObject({ badge: "Flooded", alert: true });
  });

  it("raises the river in the sky as the tricks run out", () => {
    expect(buildSky(campView("rain", [flood(14)]))?.flood).toBe(0);
    expect(buildSky(campView("rain", [flood(7)]))?.flood).toBe(0.5);
    expect(buildSky(campView("rain", [RAIN]))?.flood).toBeNull();
  });

  it("says when the river floods in the tooltip", () => {
    expect(modTooltip(campView("rain", [flood(3)]), "flooding")?.badges).toEqual(["Pairing", "Floods after 3 more tricks"]);
  });
});

describe("night and fog", () => {
  it("darken or mist the sky by the weather", () => {
    expect(buildSky(campView("night", []))?.haze).toBe("night");
    expect(buildSky(campView("fog", []))?.haze).toBe("fog");
    expect(buildSky(campView("rain", []))?.haze).toBe("none");
  });
});

describe("the magma pool", () => {
  const MAGMA: ExpeditionModView = { id: "magma", kind: "location", strength: "full", status: [] };
  const low = (["spades", "hearts", "diamonds", "clubs"] as const).flatMap((suit) => [2, 3].map((rank) => ({ kind: "standard", suit, rank }) as ExpeditionCardIdentityView));
  const fourClubs: ExpeditionCardIdentityView = { kind: "standard", suit: "clubs", rank: 4 };

  it("notes the cards the heat burned on its chip and in its tooltip", () => {
    const view = campView("fair", [MAGMA], 0, [...low, fourClubs]);
    expect(buildModChips(view)[0]).toMatchObject({ name: "Magma pool", badge: "No 2s 3s 4♣" });
    expect(modTooltip(view, "magma")?.badges).toEqual(["Location", "Burned: 2s 3s 4♣"]);
  });
});

describe("the temple", () => {
  const TEMPLE: ExpeditionModView = { id: "temple", kind: "temple", strength: "full", status: [{ kind: "path", plates: ["spades", "sun"], pressed: 0 }] };
  const TIGER: ExpeditionModView = { id: "tiger", kind: "animal", strength: "half", status: [] };
  const templeCamp = (): ExpeditionView => {
    const view = campView("fair", [CLIFFTOP, TEMPLE, TIGER]);
    if (view.stage.tag === "camp") view.stage.camp.bossId = "temple";
    return view;
  };

  it("stands the camp in the temple while the location's chip stays", () => {
    expect(buildSky(templeCamp())).toMatchObject({ location: "clifftop", backdrop: "temple" });
    expect(buildModChips(templeCamp()).map((c) => c.name)).toEqual(["Clifftop", "The Temple", "Tiger (half)"]);
  });

  it("marks a returning boss as half strength on its chip and in its tooltip", () => {
    expect(buildModChips(templeCamp())[2]).toMatchObject({ kind: "animal", strength: "half" });
    expect(modTooltip(templeCamp(), "tiger")?.badges).toEqual(["Animal boss", "Half strength at the temple"]);
  });
});
