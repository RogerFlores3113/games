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
      ["set-spec", "Camp"],
      ["set-plan-boss", "Run"],
      ["end-run", "Run"],
      ["force-camp", "Camp"],
      ["set-supplies", "Run"],
      ["set-purse", "Run"],
      ["add-coins", "Run"],
      ["add-supply", "Run"],
      ["next-stage", "Run"],
      ["set-character", "Crew"],
      ["give-item", "Crew"],
      ["set-upgrade", "Crew"],
      ["move-card", "Cards"],
      ["void-last-trick", "Cards"],
      ["reroll-route", "Run"],
      ["set-route-swap", "Run"],
      ["queue-offer", "Crew"],
      ["set-objective-owner", "Cards"],
      ["set-objective-status", "Cards"],
      ["trigger-tornado", "Bosses and weather"],
      ["trigger-earthquake", "Bosses and weather"],
      ["trigger-locusts", "Bosses and weather"],
      ["trigger-thunderstorm", "Bosses and weather"],
      ["trigger-snake", "Bosses and weather"],
      ["trigger-crocodile", "Bosses and weather"],
      ["trigger-beaver", "Bosses and weather"],
    ]);
  });

  it("puts the playtest shortcuts on the toolbar and ties objective and modifier shortcuts to the thing they act on", () => {
    const shortcuts = hooks.shortcuts(fresh());
    expect(shortcuts.flatMap((s) => (s.toolbar === undefined ? [] : [[s.id, s.toolbar]]))).toEqual([
      ["jump-to-camp", "Go"],
      ["set-spec", "Set"],
      ["force-camp", "Skip camp"],
      ["add-coins", "+10 coins"],
      ["add-supply", "+1 supply"],
      ["next-stage", "Next stage"],
    ]);
    expect(shortcuts.flatMap((s) => (s.target === undefined ? [] : [[s.id, s.target.kind, s.target.field]]))).toEqual([
      ["set-objective-owner", "objective", "objective"],
      ["set-objective-status", "objective", "objective"],
      ["trigger-tornado", "mod", "mod"],
      ["trigger-earthquake", "mod", "mod"],
      ["trigger-locusts", "mod", "mod"],
      ["trigger-thunderstorm", "mod", "mod"],
      ["trigger-snake", "mod", "mod"],
      ["trigger-crocodile", "mod", "mod"],
      ["trigger-beaver", "mod", "mod"],
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
    const stormy = hooks.runShortcut(dealt.state, "set-spec", { location: "clifftop", weather: "thunderstorm" });
    if (!stormy.ok) throw new Error(stormy.error);
    expect(hooks.inspect(stormy.state)[0]!.lines.filter((line) => line.startsWith("mod "))).toEqual([
      "mod clifftop (location, full)",
      "mod thunderstorm (weather, full): 20% next, 3 strikes left",
    ]);
  });
});
