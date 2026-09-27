// D-17/WR-06: an absent namespaced config field must read as `null`, not
// `undefined`, so a game with no create-time settings panel (Expedition)
// can pass CreateRoomRequestSchema's z.null() config branch.
import { describe, expect, it } from "vitest";
import { CreateRoomRequestSchema } from "@games/schema";
import { readCreateRoomForm } from "./create-room-form";

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

describe("readCreateRoomForm (D-17/WR-06)", () => {
  it("Expedition with no config field: config is null and the request validates", () => {
    const fd = formData({ gameId: "expedition", displayName: "Roger" });
    const result = readCreateRoomForm(fd);
    expect(result.config).toBeNull();
    const parsed = CreateRoomRequestSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("Hanabi with a selected variant: config reads the namespaced field and validates", () => {
    const fd = formData({ gameId: "hanabi", displayName: "Roger", "config.hanabi": "rainbow" });
    const result = readCreateRoomForm(fd);
    expect(result.config).toBe("rainbow");
    const parsed = CreateRoomRequestSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.gameId === "hanabi") {
      expect(parsed.data.config).toBe("rainbow");
    }
  });

  it("Hanabi with no variant field: request stays invalid (null is as invalid as undefined for VariantSchema)", () => {
    const fd = formData({ gameId: "hanabi", displayName: "Roger" });
    const result = readCreateRoomForm(fd);
    const parsed = CreateRoomRequestSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });

  it("Expedition with Hanabi's hidden field present: another game's config never leaks (WR-02)", () => {
    const fd = formData({ gameId: "expedition", displayName: "Roger", "config.hanabi": "black" });
    const result = readCreateRoomForm(fd);
    expect(result.config).toBeNull();
    const parsed = CreateRoomRequestSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("missing gameId: gameId is undefined and the request stays invalid", () => {
    const fd = formData({ displayName: "Roger" });
    const result = readCreateRoomForm(fd);
    expect(result.gameId).toBeUndefined();
    const parsed = CreateRoomRequestSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });
});
