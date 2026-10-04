import { describe, expect, it } from "vitest";
import { expeditionGame } from "../adapter/adapter";
import { createRun } from "../run/lifecycle";
import { expeditionDevHooks as hooks } from "./hooks";

const fresh = () => createRun({ seatIds: ["a", "b", "c"], seed: "hooks" });

describe("expeditionDevHooks", () => {
  it("is wired into the Expedition adapter", () => {
    expect(expeditionGame.dev).toBe(hooks);
  });

  it("reports the seat ids", () => {
    expect(hooks.seatIds(fresh())).toEqual(["a", "b", "c"]);
  });

  it("offers every shortcut id with its group", () => {
    expect(hooks.shortcuts(fresh()).map((s) => [s.id, s.group])).toEqual([
      ["jump-to-camp", "Run"],
      ["jump-to-final-camp", "Run"],
      ["end-run", "Run"],
      ["force-camp", "Camp"],
      ["set-supplies", "Run"],
      ["set-character", "Crew"],
      ["set-kit", "Crew"],
      ["give-source", "Crew"],
      ["set-boss", "Run"],
      ["move-card", "Cards"],
      ["set-objective-owner", "Cards"],
    ]);
  });

  it("runs a shortcut and keeps the result legal", () => {
    const result = hooks.runShortcut(fresh(), "set-supplies", { supplies: 5 });
    expect(result.ok && result.state.supplies).toBe(5);
    expect(hooks.check(result.ok ? result.state : fresh())).toEqual([]);
  });

  it("refuses an unknown shortcut and a bad parameter without throwing", () => {
    expect(hooks.runShortcut(fresh(), "toString", {})).toEqual({ ok: false, error: "unknown shortcut toString" });
    expect(hooks.runShortcut(fresh(), "set-supplies", { supplies: "many" })).toEqual({
      ok: false,
      error: "supplies must be a whole number from 0 to 99",
    });
  });

  it("refuses a shortcut whose result fails the check", () => {
    const result = hooks.runShortcut(fresh(), "set-kit", { seat: "a", kit: "bait" });
    expect(result.ok).toBe(true);
    const bad = hooks.runShortcut({ ...fresh(), supplies: -1 }, "set-boss", { camp: "3", boss: "none" });
    expect(bad).toEqual({ ok: false, error: "shortcut set-boss produced an invalid state: supplies must be a non-negative integer, got -1" });
  });

  it("builds a milestone key and inspects a dealt run", () => {
    expect(hooks.milestone(fresh())).toBe("1:0:in_progress");
    const dealt = hooks.runShortcut(fresh(), "jump-to-camp", { camp: 1 });
    if (!dealt.ok) throw new Error(dealt.error);
    expect(hooks.inspect(dealt.state).map((s) => s.title)).toEqual(["Run", "Crew", "Hands", "Objectives", "Trick"]);
  });
});
