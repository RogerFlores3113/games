import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ClientMessageSchema,
  ServerMessageSchema,
  encodeServerMessage,
  parseClientMessage,
  type ServerMessage,
} from "./messages";
import { SEAT_TOKEN_LENGTH } from "./constants";
import type { RoomCode, SeatToken } from "./room";

const SEAT_TOKEN = "a".repeat(SEAT_TOKEN_LENGTH) as SeatToken;
const ROOM_CODE = "ABCDEF" as RoomCode;

const sampleRoomView = {
  code: ROOM_CODE,
  variant: "base" as const,
  status: "lobby" as const,
  hostSeatId: "s1",
  youSeatId: "s1",
  seats: [{ seatId: "s1", displayLabel: "Roger", connected: true, isHost: true }],
  game: null,
};

describe("ClientMessageSchema", () => {
  it("accepts a valid join without a seat token", () => {
    const result = ClientMessageSchema.safeParse({ type: "join", displayName: "Roger" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid join with a seat token", () => {
    const result = ClientMessageSchema.safeParse({
      type: "join",
      displayName: "Roger",
      seatToken: SEAT_TOKEN,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a join with an extra unknown key (strict mode)", () => {
    const result = ClientMessageSchema.safeParse({
      type: "join",
      displayName: "Roger",
      extraField: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a join that tries to assert its own seat id", () => {
    const result = ClientMessageSchema.safeParse({
      type: "join",
      displayName: "a",
      seatId: "s1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a game_action with an arbitrary nested payload (the adapter, not this schema, judges it)", () => {
    const result = ClientMessageSchema.safeParse({
      type: "game_action",
      request: { anything: { nested: [1, 2, 3] }, could: "be here" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts set_variant, start_game, and leave", () => {
    expect(ClientMessageSchema.safeParse({ type: "set_variant", variant: "rainbow" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "start_game" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "leave" }).success).toBe(true);
  });
});

describe("parseClientMessage", () => {
  it("returns ok:true for a valid join message", () => {
    const result = parseClientMessage(JSON.stringify({ type: "join", displayName: "Roger" }));
    expect(result.ok).toBe(true);
  });

  it('returns {ok:false, reason:"bad_request"} for invalid JSON without throwing', () => {
    expect(() => parseClientMessage("not json")).not.toThrow();
    expect(parseClientMessage("not json")).toEqual({ ok: false, reason: "bad_request" });
  });

  it("returns ok:false when a client tries to assert its own seat id", () => {
    const result = parseClientMessage(
      JSON.stringify({ type: "join", displayName: "a", seatId: "s1" }),
    );
    expect(result).toEqual({ ok: false, reason: "bad_request" });
  });

  it("never throws for any arbitrary string input (fast-check, >=100 cases)", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(() => parseClientMessage(raw)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});

describe("ServerMessageSchema / encodeServerMessage", () => {
  it("encodes a valid joined message", () => {
    const msg: ServerMessage = {
      type: "joined",
      seatId: "s1",
      seatToken: SEAT_TOKEN,
      view: sampleRoomView,
    };
    expect(() => encodeServerMessage(msg)).not.toThrow();
  });

  it("throws for a malformed server message", () => {
    // @ts-expect-error — deliberately malformed to prove encodeServerMessage validates before stringifying
    expect(() => encodeServerMessage({ type: "joined" })).toThrow();
  });

  it("seatToken appears only in the joined message among server messages", () => {
    const stateMsg: ServerMessage = { type: "state", view: sampleRoomView };
    const refusedMsg: ServerMessage = { type: "refused", reason: "full" };
    const supersededMsg: ServerMessage = { type: "superseded" };
    const errorMsg: ServerMessage = { type: "error", code: "bad_request" };

    for (const msg of [stateMsg, refusedMsg, supersededMsg, errorMsg]) {
      expect(encodeServerMessage(msg)).not.toContain("seatToken");
    }

    const joinedMsg: ServerMessage = {
      type: "joined",
      seatId: "s1",
      seatToken: SEAT_TOKEN,
      view: sampleRoomView,
    };
    expect(encodeServerMessage(joinedMsg)).toContain("seatToken");
  });
});

describe("closed unions", () => {
  it("ClientMessageSchema and ServerMessageSchema are both discriminated unions with the expected member counts", () => {
    expect(ClientMessageSchema.options).toHaveLength(5);
    expect(ServerMessageSchema.options).toHaveLength(5);
  });
});

describe("ErrorMessageSchema.detail (D-08 closed enum)", () => {
  it("encodes an error frame without a detail (detail stays optional)", () => {
    const msg: ServerMessage = { type: "error", code: "bad_request" };
    expect(() => encodeServerMessage(msg)).not.toThrow();
  });

  it("encodes an error frame with detail: 'view_unavailable' and the output contains it", () => {
    const msg: ServerMessage = { type: "error", code: "bad_request", detail: "view_unavailable" };
    const encoded = encodeServerMessage(msg);
    expect(encoded).toContain("view_unavailable");
  });

  it("throws for an error frame with an arbitrary free-text detail", () => {
    const msg = { type: "error", code: "bad_request", detail: "anything else" };
    // @ts-expect-error — deliberately not a member of the closed ErrorDetailSchema enum
    expect(() => encodeServerMessage(msg)).toThrow();
  });

  it("rejects an error frame carrying an extra key such as view or game", () => {
    const result = ServerMessageSchema.safeParse({ type: "error", code: "bad_request", view: sampleRoomView });
    expect(result.success).toBe(false);
    const result2 = ServerMessageSchema.safeParse({ type: "error", code: "bad_request", game: { score: 1 } });
    expect(result2.success).toBe(false);
  });
});
