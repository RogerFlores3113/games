import { describe, expect, it } from "vitest";
import { auditLayout, type LayoutEntry } from "./layout-audit";

const text = (label: string, x: number, y: number, w: number, h: number): LayoutEntry => ({ kind: "text", label, x, y, w, h });
const control = (label: string, x: number, y: number, w: number, h: number): LayoutEntry => ({ kind: "interactive", label, x, y, w, h });

describe("auditLayout", () => {
  it("reports nothing for clean layout, including text inside its own control and 1px touches", () => {
    expect(
      auditLayout([
        text("Camp 1/6", 10, 10, 40, 8),
        text("Next", 50, 10, 30, 8),
        control("ready", 100, 100, 60, 20),
        text("Ready", 110, 106, 30, 8),
      ]),
    ).toEqual([]);
  });

  it("reports overlapping texts", () => {
    expect(auditLayout([text("A", 10, 10, 40, 8), text("B", 30, 12, 40, 8)])).toEqual([
      { type: "text-overlap", a: "A", b: "B" },
    ]);
  });

  it("reports text straddling a control but not text fully inside it", () => {
    expect(auditLayout([control("gear:peek", 0, 0, 50, 20), text("Peek long", 40, 5, 30, 8)])).toEqual([
      { type: "text-over-control", text: "Peek long", control: "gear:peek" },
    ]);
  });

  it("reports text inside two controls", () => {
    expect(
      auditLayout([control("a", 0, 0, 50, 50), control("b", 0, 0, 50, 50), text("T", 5, 5, 10, 8)]),
    ).toEqual([
      { type: "text-over-control", text: "T", control: "a" },
      { type: "text-over-control", text: "T", control: "b" },
    ]);
  });

  it("reports entries outside the 640x360 stage", () => {
    expect(auditLayout([text("wide", 600, 10, 50, 8), control("low", 10, 355, 20, 10)])).toEqual([
      { type: "out-of-stage", label: "wide" },
      { type: "out-of-stage", label: "low" },
    ]);
  });
});
