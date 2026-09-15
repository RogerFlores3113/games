import { describe, expect, it } from "vitest";
import { ROOM_ABANDONED_CLOSE_CODE, SUPERSEDED_CLOSE_CODE } from "@games/schema";
import { isTerminalCloseCode } from "./close-codes";

describe("isTerminalCloseCode (WR-01)", () => {
  it("treats a garbage-collected room's close as terminal, so the client never reconnects into a fresh empty lobby", () => {
    expect(ROOM_ABANDONED_CLOSE_CODE).toBe(4002);
    expect(isTerminalCloseCode(ROOM_ABANDONED_CLOSE_CODE)).toBe(true);
  });

  it("treats a superseded tab's close as terminal", () => {
    expect(isTerminalCloseCode(SUPERSEDED_CLOSE_CODE)).toBe(true);
  });

  it("keeps reconnecting after ordinary network or server-restart closes", () => {
    for (const code of [1000, 1001, 1006, 1011, 1012]) {
      expect(isTerminalCloseCode(code)).toBe(false);
    }
  });
});
