import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Bare specifier resolved via the vitest alias / tsconfig paths entry added
// in this task; proves the subpath resolves identically in both Vitest and tsc.
import { FOREHEAD_CARD_GAME_ID, ForeheadCardViewSchema } from "@games/schema/games/forehead-card";
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
import { RoomViewSchema } from "../room";

describe("subpath wiring (D-06, FDN-01)", () => {
  it("resolves @games/schema/games/forehead-card as a bare specifier (proves alias ordering)", () => {
    expect(FOREHEAD_CARD_GAME_ID).toBe("forehead-card");
    expect(ForeheadCardViewSchema.safeParse({}).success).toBe(false);
  });

  it("resolves @games/schema/games/hanabi as a bare specifier (proves alias ordering)", () => {
    expect(HANABI_GAME_ID).toBe("hanabi");
    expect(HanabiViewSchema.safeParse({}).success).toBe(false);
  });

  it("the generic barrel (index.ts) never mentions games/, ForeheadCard, or Hanabi", () => {
    const indexPath = fileURLToPath(new URL("../index.ts", import.meta.url));
    const text = readFileSync(indexPath, "utf-8");
    expect(text).not.toContain("games/");
    expect(text).not.toContain("ForeheadCard");
    expect(text).not.toContain("Hanabi");
  });

  it("RoomViewSchema.game stays z.unknown() — accepts an arbitrary game object", () => {
    const result = RoomViewSchema.safeParse({
      code: "ABCDEF",
      variant: "base",
      status: "lobby",
      hostSeatId: "s1",
      youSeatId: "s1",
      seats: [{ seatId: "s1", displayLabel: "Roger", connected: true, isHost: true }],
      game: { anything: 1 },
    });
    expect(result.success).toBe(true);
  });
});
