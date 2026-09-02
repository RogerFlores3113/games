import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@games/schema";
import { mintRoomCode } from "./room-code";

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

describe("mintRoomCode", () => {
  it("returns a code matching the room-code alphabet and length", () => {
    const code = mintRoomCode();
    expect(code).toMatch(CODE_PATTERN);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("draws only from ROOM_CODE_ALPHABET characters", () => {
    for (const char of mintRoomCode()) {
      expect(ROOM_CODE_ALPHABET).toContain(char);
    }
  });

  it("produces distinct codes across many mints", () => {
    const codes = new Set(Array.from({ length: 200 }, () => mintRoomCode()));
    expect(codes.size).toBe(200);
  });
});
