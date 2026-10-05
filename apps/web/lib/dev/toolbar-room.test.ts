import { describe, expect, it } from "vitest";
import { toolbarReserve } from "./toolbar-room";

describe("toolbarReserve", () => {
  it("reserves the toolbar's strip only when the stage keeps its zoom without it", () => {
    expect(toolbarReserve(1280, 720)).toBe(0);
    expect(toolbarReserve(1920, 1080)).toBe(0);
    expect(toolbarReserve(1920, 969)).toBe(28);
    expect(toolbarReserve(1280, 800)).toBe(28);
    expect(toolbarReserve(1366, 748)).toBe(28);
    expect(toolbarReserve(1366, 740)).toBe(0);
  });
});
