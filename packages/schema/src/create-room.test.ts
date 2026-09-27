import { describe, expect, it } from "vitest";
import { CreateRoomRequestSchema } from "./create-room";

const valid = { gameId: "hanabi" as const, displayName: "Roger", config: "rainbow" as const };

describe("CreateRoomRequestSchema (D-03)", () => {
  it("accepts a valid Hanabi request", () => {
    expect(CreateRoomRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an unrecognized gameId", () => {
    expect(CreateRoomRequestSchema.safeParse({ ...valid, gameId: "innovation" }).success).toBe(false);
  });

  it("accepts a valid Expedition request", () => {
    expect(
      CreateRoomRequestSchema.safeParse({ gameId: "expedition", displayName: "Roger", config: null }).success,
    ).toBe(true);
  });

  it("rejects an Expedition request with a non-null config", () => {
    expect(
      CreateRoomRequestSchema.safeParse({ gameId: "expedition", displayName: "Roger", config: "base" }).success,
    ).toBe(false);
    expect(
      CreateRoomRequestSchema.safeParse({ gameId: "expedition", displayName: "Roger", config: {} }).success,
    ).toBe(false);
  });

  it("rejects an Expedition request missing config", () => {
    expect(
      CreateRoomRequestSchema.safeParse({ gameId: "expedition", displayName: "Roger" }).success,
    ).toBe(false);
  });

  it("rejects an Expedition request with an extra key", () => {
    expect(
      CreateRoomRequestSchema.safeParse({
        gameId: "expedition",
        displayName: "Roger",
        config: null,
        extra: "nope",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing config", () => {
    const { config: _config, ...rest } = valid;
    expect(CreateRoomRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid config value", () => {
    expect(CreateRoomRequestSchema.safeParse({ ...valid, config: "purple" }).success).toBe(false);
  });

  it("rejects an extra key", () => {
    expect(CreateRoomRequestSchema.safeParse({ ...valid, extra: "nope" }).success).toBe(false);
  });

  it("rejects an empty displayName", () => {
    expect(CreateRoomRequestSchema.safeParse({ ...valid, displayName: "" }).success).toBe(false);
  });

  it("rejects a 25-character displayName", () => {
    expect(CreateRoomRequestSchema.safeParse({ ...valid, displayName: "a".repeat(25) }).success).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(CreateRoomRequestSchema.safeParse("not-an-object").success).toBe(false);
    expect(CreateRoomRequestSchema.safeParse(null).success).toBe(false);
  });
});
