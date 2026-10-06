import { describe, expect, it } from "vitest";
import type { ExpeditionStageView, ExpeditionView } from "@games/rules";
import { buildKitBar } from "./kit-bar-model";
import { initialLocalUi, type LocalUiState } from "./local-ui";

const PREVIEW = { index: 2, location: "jungle", weather: "fair", pairing: null, slotKinds: ["win-card" as const], bossId: null, shop: false, survey: null };
const LOADOUT: ExpeditionStageView = { tag: "loadout", camp: PREVIEW, mods: [], readySeatIds: [] };
const CAMP: ExpeditionStageView = { tag: "camp", camp: PREVIEW, mods: [], attempt: {} as never };

function view(over: Partial<ExpeditionView> = {}, seat: Partial<ExpeditionView["seats"][number]> = {}): ExpeditionView {
  return {
    yourSeatId: "s1",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 3, max: 4 },
    plan: [],
    seats: [
      {
        seatId: "s1",
        characterId: "explorer",
        upgradeId: null,
        items: { equipped: [{ uid: "it1", itemId: "bait", remaining: { kind: "uses", left: 1, of: 1 } }], backpack: [], concealed: false },
        usage: [{ sourceKey: "explorer", remaining: { kind: "uses", left: 0, of: 1 } }],
        ...seat,
      },
    ],
    kicked: [],
    yourAbilities: [],
    yourItemSlots: 2,
    history: [],
    lastVote: null,
    stage: LOADOUT,
    ...over,
  };
}

const ui = (over: Partial<LocalUiState> = {}): LocalUiState => ({ ...initialLocalUi(), ...over });

describe("buildKitBar", () => {
  it("lists your item slots, an empty one as null, then your powers", () => {
    const bar = buildKitBar(view(), ui())!;
    expect(bar.items.map((e) => e?.name ?? null)).toEqual(["Bait", null]);
    expect(bar.powers.map((e) => [e.name, e.kind])).toEqual([["Compass", "character"]]);
    expect(bar.open).toBe(false);
    expect(bar.backpack).toBeNull();
  });

  it("reads what is left of each source and marks a spent one", () => {
    const bar = buildKitBar(view(), ui())!;
    expect(bar.powers[0]).toMatchObject({ uses: { full: "Used this camp", short: "Used" }, spent: true, usable: false });
  });

  it("ids the entries as the camp's sources in camp and as kit tiles between camps", () => {
    expect(buildKitBar(view(), ui())!.items[0]!.objectId).toBe("kit:it1");
    expect(buildKitBar(view({ stage: CAMP }), ui())!.items[0]!.objectId).toBe("source:it1");
  });

  it("marks what the server lets you use now, and glows only while nothing is aimed", () => {
    const usable = view({ yourAbilities: [{ sourceKey: "it1", usableNow: true, reason: null, steps: [] }] });
    expect(buildKitBar(usable, ui())!.items[0]).toMatchObject({ usable: true, pulse: true, active: false });
    const aiming = ui({ targeting: { mode: "ability", sourceKey: "it1", selected: [], heldId: null } });
    expect(buildKitBar(usable, aiming)!.items[0]).toMatchObject({ usable: true, pulse: false, active: true });
  });

  it("gives the Pack Rat with Pack Animal a backpack in camp, usable when the server says so", () => {
    const packRat = { characterId: "pack-rat", upgradeId: "pack-rat.pack-animal" };
    const abilities = [{ sourceKey: "pack-rat.pack-animal", usableNow: true, reason: null, steps: [] }];
    expect(buildKitBar(view({ stage: CAMP, yourAbilities: abilities, yourItemSlots: 3 }, packRat), ui())!.backpack).toEqual({
      objectId: "backpack",
      sourceKey: "pack-rat.pack-animal",
      usable: true,
      pulse: true,
      active: false,
    });
    expect(buildKitBar(view({ stage: CAMP }, { characterId: "pack-rat", upgradeId: "pack-rat.quartermaster" }), ui())!.backpack).toBeNull();
    expect(buildKitBar(view({ yourAbilities: abilities }, packRat), ui())!.backpack).toBeNull();
  });

  it("is popped out while the kit is open", () => {
    expect(buildKitBar(view(), ui({ kitOpen: true }))!.open).toBe(true);
  });

  it("is null for a spectator", () => {
    expect(buildKitBar(view({ yourSeatId: null }), ui())).toBeNull();
  });
});
