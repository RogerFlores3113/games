import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD, IDLE_DRAG, gestureCardId, reduceDrag, type DragEvent, type DragState } from "./card-drag";

function run(events: DragEvent[], from: DragState = IDLE_DRAG): { state: DragState; effects: string[] } {
  let state = from;
  const effects: string[] = [];
  for (const event of events) {
    const out = reduceDrag(state, event);
    state = out.state;
    if (out.effect.kind !== "none") effects.push(`${out.effect.kind}:${out.effect.cardId}`);
  }
  return { state, effects };
}

const press = (legal: boolean, reason: string | null = null): DragEvent => ({ type: "press", cardId: "c1", at: { x: 100, y: 300 }, legal, reason });
const farMove: DragEvent = { type: "move", at: { x: 100, y: 300 - DRAG_THRESHOLD - 10 } };

describe("reduceDrag", () => {
  it("a press and release without travel is a click", () => {
    const out = run([press(true), { type: "move", at: { x: 101, y: 301 } }, { type: "release", overTable: false }]);
    expect(out.state).toEqual({ phase: "idle" });
    expect(out.effects).toEqual(["click:c1"]);
  });

  it("travel past the threshold starts a drag that carries legality", () => {
    const out = run([press(true), farMove]);
    expect(out.state).toEqual({ phase: "dragging", cardId: "c1", legal: true, reason: null });
  });

  it("dropping a legal card over the table plays it", () => {
    const out = run([press(true), farMove, { type: "release", overTable: true }]);
    expect(out.state).toEqual({ phase: "playing", cardId: "c1" });
    expect(out.effects).toEqual(["play:c1"]);
  });

  it("dropping a legal card elsewhere returns it without a reason", () => {
    const out = run([press(true), farMove, { type: "release", overTable: false }]);
    expect(out.state).toEqual({ phase: "returning", cardId: "c1", reason: null });
    expect(out.effects).toEqual([]);
  });

  it("dropping an illegal card over the table returns it with the reason", () => {
    const out = run([press(false, "Must follow ♠"), farMove, { type: "release", overTable: true }]);
    expect(out.state).toEqual({ phase: "returning", cardId: "c1", reason: "Must follow ♠" });
    expect(out.effects).toEqual([]);
  });

  it("clicking an illegal card shows its reason and plays nothing", () => {
    const out = run([press(false, "Must follow ♠"), { type: "release", overTable: false }]);
    expect(out.state).toEqual({ phase: "returning", cardId: "c1", reason: "Must follow ♠" });
    expect(out.effects).toEqual([]);
  });

  it("settle ends a return; cancel ends any gesture; a second press is ignored mid-gesture", () => {
    const returning: DragState = { phase: "returning", cardId: "c1", reason: null };
    expect(reduceDrag(returning, { type: "settle" }).state).toEqual({ phase: "idle" });
    expect(reduceDrag({ phase: "playing", cardId: "c1" }, { type: "settle" }).state).toEqual({ phase: "idle" });
    expect(run([press(true), farMove, { type: "cancel" }]).state).toEqual({ phase: "idle" });
    const held = run([press(true), { ...press(true), cardId: "c2" } as DragEvent]);
    expect(gestureCardId(held.state)).toBe("c1");
  });
});
