import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import { initialLocalUi } from "./local-ui";
import { buildFanPicker, mistOver, vowMarks } from "./character-marks";

const camp = (effects: unknown[], reveals: unknown[] = []) => ({ stage: { tag: "camp", attempt: { effects, reveals, camp: { currentTrick: { index: 2 } } } } });
const seatEffect = (sourceId: string, params: Record<string, string> | null, at: { atTrick: number; lasts: "trick" | "attempt" }) => ({ origin: { kind: "seat", seatId: "p0", sourceId }, params, ...at });

describe("what the characters leave on the table", () => {
  it("marks each seat under the Hermit's vow", () => {
    const view = camp([seatEffect("hermit", { seatId: "p1" }, { atTrick: 0, lasts: "attempt" }), seatEffect("explorer", null, { atTrick: 0, lasts: "attempt" })]) as unknown as ExpeditionView;
    expect(vowMarks(view)).toEqual({ p1: { label: "vow", alert: false } });
  });

  it("mists only the trick the Perfumist misted", () => {
    expect(mistOver(camp([seatEffect("perfumist", {}, { atTrick: 2, lasts: "trick" })]) as unknown as ExpeditionView)).toBe(true);
    expect(mistOver(camp([seatEffect("perfumist", {}, { atTrick: 1, lasts: "trick" })]) as unknown as ExpeditionView)).toBe(false);
  });

  it("fans each teammate's hand, shows the cards you know face up, and dims a hand already picked from", () => {
    const choices = ["fan:p1:0", "fan:p1:1", "fan:p1:known:c9", "fan:p2:0"];
    const view = {
      ...camp([], [{ cardId: "c9", identity: { kind: "standard", suit: "hearts", rank: 7 } }]),
      yourAbilities: [{ sourceKey: "magician.misdirection", usableNow: true, reason: null, steps: [{ kind: "fanned-card", prompt: "Pick a card from a teammate's fanned hand", choices }, { kind: "fanned-card", prompt: "Pick a card from a teammate's fanned hand", choices }] }],
    } as unknown as ExpeditionView;
    const ui = { ...initialLocalUi(), targeting: { mode: "ability" as const, sourceKey: "magician.misdirection", selected: ["fan:p1:1"], heldId: null } };
    const fan = buildFanPicker(view, ui, (seatId) => ({ p1: "Bob", p2: "Cara" })[seatId] ?? seatId)!;
    expect(fan.rows.map((row) => [row.name, row.places.map((p) => [p.choiceId, p.selected, p.targetable]), row.known.map((k) => k.label)])).toEqual([
      ["Bob", [["fan:p1:0", false, false], ["fan:p1:1", true, false]], ["7♥"]],
      ["Cara", [["fan:p2:0", false, true]], []],
    ]);
  });
});
