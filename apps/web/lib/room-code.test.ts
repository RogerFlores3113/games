import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@games/schema";
import { mintRoomCode, parseRoomCodeParam } from "./room-code";

describe("parseRoomCodeParam (CR-02)", () => {
  it("accepts a canonical code as-is", () => {
    expect(parseRoomCodeParam("ABCDEF")).toEqual({ kind: "ok", code: "ABCDEF" });
  });

  it("asks for a redirect to the uppercase code when a friend typed it in lowercase", () => {
    expect(parseRoomCodeParam("abcdef")).toEqual({ kind: "redirect", code: "ABCDEF" });
    expect(parseRoomCodeParam("AbCdEf")).toEqual({ kind: "redirect", code: "ABCDEF" });
  });

  it("rejects codes outside the speakable alphabet or of the wrong length", () => {
    for (const raw of ["ABCDE0", "ABCDEI", "abcde1", "ABCDE", "ABCDEFG", "", "AB%20CD", "ABC/EF"]) {
      expect(parseRoomCodeParam(raw)).toEqual({ kind: "invalid" });
    }
  });
});

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
