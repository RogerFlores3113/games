import { describe, expect, it } from "vitest";
import type { ExpeditionStageView, ExpeditionView } from "@games/rules";
import { buildInventory, clickMove, equipAfter, roomFor, type Inventory } from "./inventory-model";
import { initialLocalUi, type LocalUiState } from "./local-ui";

const item = (uid: string, itemId = "bait") => ({ uid, itemId, remaining: { kind: "uses" as const, left: 1, of: 1 } });

const LOADOUT: ExpeditionStageView = {
  tag: "loadout",
  camp: { index: 2, location: "jungle", weather: "fair", pairing: null, slotKinds: ["win-card"], bossId: null, shop: false, survey: null },
  mods: [],
  readySeatIds: [],
};

function view(equipped: string[], backpack: string[], over: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s1",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 12,
    supplies: { count: 3, max: 4 },
    plan: [],
    seats: [{ seatId: "s1", characterId: "businessman", upgradeId: null, items: { equipped: equipped.map((uid) => item(uid)), backpack: backpack.map((uid) => item(uid, "parrot")), concealed: false }, usage: [] }],
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
const inventory = (v: ExpeditionView, local: LocalUiState = ui()): Inventory => buildInventory(v, local)!;

describe("buildInventory", () => {
  it("lays out your slots, then six backpack patches with your items first", () => {
    const inv = inventory(view(["it1"], ["it2", "it3"]));
    expect(inv.slots.map((c) => [c.objectId, c.item?.uid ?? null])).toEqual([
      ["slot:0", "it1"],
      ["slot:1", null],
    ]);
    expect(inv.backpack.map((c) => [c.objectId, c.item?.uid ?? null])).toEqual([
      ["pack:it2", "it2"],
      ["pack:it3", "it3"],
      ["pack-cell:2", null],
      ["pack-cell:3", null],
      ["pack-cell:4", null],
      ["pack-cell:5", null],
    ]);
    expect(inv).toMatchObject({ equipped: ["it1"], capacity: 6, stored: 2, locked: false, discardable: true, aiming: null, discard: null, open: false });
  });

  it("names each item with what it does and what is left of it", () => {
    expect(inventory(view(["it1"], [])).slots[0]!.item).toEqual({
      uid: "it1",
      itemId: "bait",
      objectId: "slot:0",
      name: "Bait",
      text: "A card on the table can't win this trick.",
      uses: "Single use",
      rare: false,
      targetable: false,
      selected: false,
      tag: null,
    });
  });

  it("gives the Pack Rat a third slot and shows a backpack a camp rule pushed past six", () => {
    const inv = inventory(view([], ["a", "b", "c", "d", "e", "f", "g"], { yourItemSlots: 3 }));
    expect(inv.slots).toHaveLength(3);
    expect(inv.backpack.map((c) => c.item?.uid)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("is open while opened in this stage", () => {
    expect(inventory(view([], []), ui({ inventoryOpen: "loadout:2" })).open).toBe(true);
  });

  it("locks once you are ready, and outside the stages between camps", () => {
    expect(inventory(view([], [], { stage: { ...LOADOUT, readySeatIds: ["s1"] } })).locked).toBe(true);
    expect(inventory(view([], [], { stage: { tag: "route", options: [], ballots: [] } })).locked).toBe(false);
    expect(inventory(view([], [], { stage: { tag: "camp", camp: LOADOUT.camp, mods: [], attempt: {} as never } }))).toMatchObject({ locked: true, discardable: false });
  });

  it("opens on a sale, marking what can be sold and for how much", () => {
    const sale = view(["it1"], ["it2"], {
      yourAbilities: [{ sourceKey: "businessman", usableNow: true, reason: null, steps: [{ kind: "item", prompt: "Pick an item to sell", choices: ["item:it2"] }] }],
    });
    const inv = inventory(sale, ui({ targeting: { mode: "ability", sourceKey: "businessman", selected: [], heldId: null } }));
    expect(inv.open).toBe(true);
    expect(inv.aiming).toBe("Pick an item to sell");
    expect(inv.slots[0]!.item).toMatchObject({ targetable: false, tag: null });
    expect(inv.backpack[0]!.item).toMatchObject({ targetable: true, tag: "+1" });
  });

  it("marks the item a power already picked while it asks for the next", () => {
    const swap = view(["it1", "it2"], ["it3"], {
      stage: { tag: "camp", camp: LOADOUT.camp, mods: [], attempt: {} as never },
      yourAbilities: [
        {
          sourceKey: "pack-rat.pack-animal",
          usableNow: true,
          reason: null,
          steps: [
            { kind: "item", prompt: "Pick an equipped item to put away", choices: ["item:it1", "item:it2"] },
            { kind: "item", prompt: "Pick a backpack item to take out", choices: ["item:it3"] },
          ],
        },
      ],
    });
    const inv = inventory(swap, ui({ targeting: { mode: "ability", sourceKey: "pack-rat.pack-animal", selected: ["item:it1"], heldId: null } }));
    expect(inv.aiming).toBe("Pick a backpack item to take out");
    expect(inv.slots.map((c) => [c.item?.uid, c.item?.selected, c.item?.targetable])).toEqual([
      ["it1", true, false],
      ["it2", false, false],
    ]);
    expect(inv.backpack[0]!.item).toMatchObject({ uid: "it3", selected: false, targetable: true });
  });

  it("names the item waiting to be discarded", () => {
    expect(inventory(view(["it1"], ["it2"]), ui({ discardUid: "it2" })).discard).toEqual({ uid: "it2", name: "Parrot" });
  });

  it("is null for a spectator", () => {
    expect(buildInventory(view([], [], { yourSeatId: null }), ui())).toBeNull();
  });
});

describe("roomFor", () => {
  it("counts free slots and the room left in the backpack", () => {
    expect(roomFor(inventory(view(["it1"], ["a", "b"])))).toBe(5);
    expect(roomFor(inventory(view(["it1", "it2"], ["a", "b", "c", "d", "e", "f"])))).toBe(0);
  });
});

describe("equipAfter", () => {
  const inv = (equipped: string[], backpack: string[] = []) => inventory(view(equipped, backpack));

  it("fills the first free slot", () => {
    expect(equipAfter(inv(["it1"], ["it2"]), { uid: "it2", to: { kind: "slot", index: 1 } })).toEqual(["it1", "it2"]);
  });

  it("swaps a backpack item into a full slot, sending the old one back", () => {
    expect(equipAfter(inv(["it1", "it2"], ["it3"]), { uid: "it3", to: { kind: "slot", index: 0 } })).toEqual(["it3", "it2"]);
  });

  it("swaps two equipped items' slots", () => {
    expect(equipAfter(inv(["it1", "it2"]), { uid: "it2", to: { kind: "slot", index: 0 } })).toEqual(["it2", "it1"]);
  });

  it("sends an equipped item to the backpack while it has room", () => {
    expect(equipAfter(inv(["it1", "it2"]), { uid: "it1", to: { kind: "backpack" } })).toEqual(["it2"]);
    expect(equipAfter(inv(["it1", "it2"], ["a", "b", "c", "d", "e", "f"]), { uid: "it1", to: { kind: "backpack" } })).toBeNull();
  });

  it("changes nothing for a drop where the item already is, or past full slots", () => {
    expect(equipAfter(inv(["it1"]), { uid: "it1", to: { kind: "slot", index: 0 } })).toBeNull();
    expect(equipAfter(inv(["it1"], ["it3"]), { uid: "it3", to: { kind: "backpack" } })).toBeNull();
    expect(equipAfter(inv(["it1", "it2"], ["it3"]), { uid: "it3", to: { kind: "slot", index: 2 } })).toBeNull();
  });
});

describe("clickMove", () => {
  it("puts an equipped item away and equips a backpack item in the next free slot", () => {
    const inv = inventory(view(["it1"], ["it2"]));
    expect(clickMove(inv, "it1")).toEqual({ itemUids: [] });
    expect(clickMove(inv, "it2")).toEqual({ itemUids: ["it1", "it2"] });
  });

  it("says why an item can't move", () => {
    expect(clickMove(inventory(view(["it1", "it2"], ["it3"])), "it3")).toEqual({ notice: "Your item slots are full. Drag onto a slot to swap." });
    expect(clickMove(inventory(view(["it1"], ["a", "b", "c", "d", "e", "f"])), "it1")).toEqual({ notice: "Your backpack is full. Discard an item to make room." });
  });
});
