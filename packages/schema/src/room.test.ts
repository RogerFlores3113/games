import { describe, expect, it } from "vitest";
import {
  GameIdSchema,
  PublicSeatSchema,
  RoomCodeSchema,
  RoomViewSchema,
  SeatTokenSchema,
  type RoomCode,
  type SeatToken,
} from "./room";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, SEAT_TOKEN_LENGTH } from "./constants";

describe("constants", () => {
  it("room code length is 6, seat token length is 24", () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
    expect(SEAT_TOKEN_LENGTH).toBe(24);
  });

  it("room code alphabet excludes I, O, 0, 1 and has 32 characters", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    for (const excluded of ["I", "O", "0", "1"]) {
      expect(ROOM_CODE_ALPHABET.includes(excluded)).toBe(false);
    }
  });
});

describe("RoomCodeSchema", () => {
  it("accepts a valid 6-character code from the alphabet", () => {
    expect(RoomCodeSchema.safeParse("ABCDEF").success).toBe(true);
  });

  it("rejects lowercase", () => {
    expect(RoomCodeSchema.safeParse("abc123").success).toBe(false);
  });

  it("rejects the excluded letter I", () => {
    expect(RoomCodeSchema.safeParse("ABCI23").success).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(RoomCodeSchema.safeParse("ABCDE").success).toBe(false);
    expect(RoomCodeSchema.safeParse("ABCDEFG").success).toBe(false);
  });
});

describe("SeatTokenSchema", () => {
  it("accepts a string of exactly SEAT_TOKEN_LENGTH characters", () => {
    expect(SeatTokenSchema.safeParse("a".repeat(SEAT_TOKEN_LENGTH)).success).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(SeatTokenSchema.safeParse("a".repeat(SEAT_TOKEN_LENGTH - 1)).success).toBe(false);
  });
});

describe("PublicSeatSchema", () => {
  it("strips seatToken and other persisted-only fields, exposing exactly the public key set", () => {
    const parsed = PublicSeatSchema.parse({
      seatId: "s1",
      displayLabel: "Roger",
      connected: true,
      isHost: true,
      // Extra keys that must NOT survive parsing:
      seatToken: "a".repeat(SEAT_TOKEN_LENGTH),
      displayName: "Roger",
    });

    expect(Object.keys(parsed).sort()).toEqual(["connected", "displayLabel", "isHost", "seatId"].sort());
    expect(parsed).not.toHaveProperty("seatToken");
    expect(parsed).not.toHaveProperty("displayName");
  });
});

describe("branded types (compile-time)", () => {
  it("a SeatToken value is not assignable to a RoomCode parameter", () => {
    function acceptsRoomCode(_code: RoomCode): void {}
    const seatToken = SeatTokenSchema.parse("a".repeat(SEAT_TOKEN_LENGTH));

    // @ts-expect-error — SeatToken must not be assignable to RoomCode; this
    // is the RT-07 seat-hijack boundary made a compile error.
    acceptsRoomCode(seatToken);

    expect(seatToken).toBeTruthy();
  });
});

describe("GameIdSchema (D-09)", () => {
  it("options is exactly [\"hanabi\"]", () => {
    expect(GameIdSchema.options).toEqual(["hanabi"]);
  });

  it("accepts \"hanabi\"", () => {
    expect(GameIdSchema.safeParse("hanabi").success).toBe(true);
  });

  it.each(["expedition", "innovation", "__toy__", ""])("rejects %j", (value) => {
    expect(GameIdSchema.safeParse(value).success).toBe(false);
  });
});

describe("RoomViewSchema (D-04, D-05, MGR-02)", () => {
  function baseView(): Record<string, unknown> {
    return {
      code: "ABCDEF",
      gameId: "hanabi",
      gameDisplayName: "Hanabi",
      config: "base",
      limits: { min: 2, max: 5 },
      status: "lobby",
      hostSeatId: "s1",
      youSeatId: "s1",
      seats: [{ seatId: "s1", displayLabel: "Roger", connected: true, isHost: true }],
      game: null,
    };
  }

  it("accepts the new envelope shape", () => {
    expect(RoomViewSchema.safeParse(baseView()).success).toBe(true);
  });

  it("rejects a view carrying a leftover variant key", () => {
    const view = { ...baseView(), variant: "base" };
    expect(RoomViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects a view missing limits", () => {
    const view = baseView();
    delete (view as Record<string, unknown>).limits;
    expect(RoomViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects limits carrying an extra key", () => {
    const view = { ...baseView(), limits: { min: 2, max: 5, extra: 1 } };
    expect(RoomViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects gameId \"expedition\" (not production-registered)", () => {
    const view = { ...baseView(), gameId: "expedition" };
    expect(RoomViewSchema.safeParse(view).success).toBe(false);
  });
});
