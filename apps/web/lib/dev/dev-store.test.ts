import { beforeEach, describe, expect, it } from "vitest";
import { devJumpedWithin, useDevStore } from "./dev-store";

describe("devJumpedWithin", () => {
  beforeEach(() => useDevStore.setState({ pending: [], jumpedAt: null }));

  it("a shortcut, a loaded state or a user's autoplay moves the game; bots, snapshots and new bots do not", () => {
    for (const kind of ["bots", "quiet", "snapshot", "add-bot"] as const) useDevStore.getState().sent(kind);
    expect(devJumpedWithin(1500)).toBe(false);
    for (const kind of ["shortcut", "load-state", "autoplay"] as const) {
      useDevStore.setState({ jumpedAt: null });
      useDevStore.getState().sent(kind);
      expect(devJumpedWithin(1500)).toBe(true);
    }
  });

  it("the answer to a jump restarts the window, and it lapses after", () => {
    useDevStore.getState().sent("shortcut");
    useDevStore.setState({ jumpedAt: 0 });
    useDevStore.getState().receive({ type: "dev_result", ok: true, message: "Jumped" });
    const answered = useDevStore.getState().jumpedAt!;
    expect(devJumpedWithin(1500, answered + 1500)).toBe(true);
    expect(devJumpedWithin(1500, answered + 1501)).toBe(false);
  });
});
