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
      ["set-purse", "Run"],
      ["set-character", "Crew"],
      ["give-item", "Crew"],
      ["set-upgrade", "Crew"],
      ["move-card", "Cards"],
      ["set-objective-owner", "Cards"],
    ]);
  });

  it("runs a shortcut and keeps the result legal", () => {
    const result = hooks.runShortcut(fresh(), "set-supplies", { supplies: 4 });
    expect(result.ok && result.state.supplies).toBe(4);
    expect(hooks.check(result.ok ? result.state : fresh())).toEqual([]);
  });

  it("refuses an unknown shortcut and a bad parameter without throwing", () => {
    expect(hooks.runShortcut(fresh(), "toString", {})).toEqual({ ok: false, error: "unknown shortcut toString" });
    expect(hooks.runShortcut(fresh(), "set-supplies", { supplies: "many" })).toEqual({
      ok: false,
      error: "supplies must be a whole number from 0 to 4",
    });
  });

  it("refuses a shortcut whose result fails the check", () => {
    const result = hooks.runShortcut(fresh(), "give-item", { seat: "a", item: "bait" });
    expect(result.ok).toBe(true);
    const bad = hooks.runShortcut({ ...fresh(), supplies: -1 }, "give-item", { seat: "a", item: "bait" });
    expect(bad).toEqual({ ok: false, error: "shortcut give-item produced an invalid state: supplies must be a whole number from 0 to 4, got -1" });
  });

  it("moves the milestone only when a camp settles or the run ends", () => {
    const dealt = hooks.runShortcut(fresh(), "jump-to-camp", { length: "short", camp: 2, stage: "camp" });
    if (!dealt.ok) throw new Error(dealt.error);
    expect(hooks.milestone(dealt.state)).toBe("0:in_progress");
    const failed = hooks.runShortcut(dealt.state, "force-camp", { outcome: "failed" });
    if (!failed.ok) throw new Error(failed.error);
    expect(hooks.milestone(failed.state)).toBe("1:in_progress");
    const won = hooks.runShortcut(failed.state, "end-run", { outcome: "won" });
    if (!won.ok) throw new Error(won.error);
    expect(hooks.milestone(won.state)).toBe("2:won");
  });

  it("builds a milestone key and inspects a dealt run", () => {
    expect(hooks.milestone(fresh())).toBe("0:in_progress");
    const dealt = hooks.runShortcut(fresh(), "jump-to-camp", { length: "standard", camp: 1, stage: "camp" });
    if (!dealt.ok) throw new Error(dealt.error);
    expect(hooks.inspect(dealt.state).map((s) => s.title)).toEqual(["Run", "Crew", "Hands", "Objectives", "Trick"]);
  });
});
