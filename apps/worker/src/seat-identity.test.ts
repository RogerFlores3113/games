import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ROOM_CODE_ALPHABET, SEAT_TOKEN_LENGTH } from "@games/schema";
import {
  mintGameSeed,
  mintRoomCode,
  mintSeatToken,
  mintSeatId,
  resolveSeatByToken,
  rebindSeatConnection,
  bindingsFromConnections,
  type TokenBearingSeat,
  type SeatBindings,
} from "./seat-identity";

function makeSeat(seatId: string, seatToken: string): TokenBearingSeat {
  return { seatId, seatToken: seatToken as TokenBearingSeat["seatToken"] };
}

describe("mintGameSeed (WR-07)", () => {
  it("mints a 128-bit hex secret, distinct every time, never derived from the public room code", () => {
    const seeds = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const seed = mintGameSeed();
      expect(seed).toMatch(/^[0-9a-f]{32}$/);
      seeds.add(seed);
    }
    expect(seeds.size).toBe(1000);
  });
});

describe("mintRoomCode / mintSeatToken / mintSeatId — entropy and shape", () => {
  it("mints 1000 distinct seat tokens, all length 24", () => {
    const tokens = Array.from({ length: 1000 }, () => mintSeatToken());
    expect(new Set(tokens).size).toBe(1000);
    for (const token of tokens) {
      expect(token.length).toBe(SEAT_TOKEN_LENGTH);
    }
  });

  it("seat tokens use a different alphabet than the room code (at least one char outside ROOM_CODE_ALPHABET across a sample)", () => {
    const tokens = Array.from({ length: 1000 }, () => mintSeatToken());
    const roomAlphabetChars = new Set(ROOM_CODE_ALPHABET.split(""));
    const hasOutsideChar = tokens.some((token) =>
      token.split("").some((ch) => !roomAlphabetChars.has(ch)),
    );
    expect(hasOutsideChar).toBe(true);
  });

  it("mints 1000 room codes, all length 6 matching the speakable alphabet", () => {
    const codes = Array.from({ length: 1000 }, () => mintRoomCode());
    const pattern = new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`);
    for (const code of codes) {
      expect(code).toMatch(pattern);
    }
  });

  it("mintSeatId produces a non-empty string distinct from seat tokens in length", () => {
    const id = mintSeatId();
    expect(id.length).toBeGreaterThan(0);
    expect(id.length).not.toBe(SEAT_TOKEN_LENGTH);
  });
});

describe("resolveSeatByToken — RT-07 seat-hijack boundary", () => {
  const token = mintSeatToken();
  const roomCode = mintRoomCode();
  const seats = [makeSeat("seat-1", token)];

  it("RT-07: undefined presented token resolves to null", () => {
    expect(resolveSeatByToken(seats, undefined)).toBeNull();
  });

  it("RT-07: empty string resolves to null", () => {
    expect(resolveSeatByToken(seats, "")).toBeNull();
  });

  it("RT-07: a valid ROOM CODE presented as a seat token resolves to null", () => {
    expect(resolveSeatByToken(seats, roomCode)).toBeNull();
  });

  it("RT-07: a truncated/modified token resolves to null", () => {
    const tampered = token.slice(0, -1) + (token.at(-1) === "X" ? "Y" : "X");
    expect(resolveSeatByToken(seats, tampered)).toBeNull();
  });

  it("RT-07: only the exact token resolves to its seat", () => {
    const result = resolveSeatByToken(seats, token);
    expect(result).not.toBeNull();
    expect(result?.seatId).toBe("seat-1");
  });

  it("fast-check: never throws and returns null unless string exactly equals a known token", () => {
    fc.assert(
      fc.property(fc.string(), (presented) => {
        const result = resolveSeatByToken(seats, presented);
        if (presented !== token) {
          expect(result).toBeNull();
        } else {
          expect(result?.seatId).toBe("seat-1");
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("rebindSeatConnection — D-08 newest-socket-wins", () => {
  it("D-08: rebinding s1 from c1 to c2 returns supersededConnectionId === 'c1' and leaves bindings['s1'] === 'c2'", () => {
    const empty: SeatBindings = {};
    const first = rebindSeatConnection(empty, "s1", "c1");
    expect(first.supersededConnectionId).toBeNull();
    expect(first.bindings.s1).toBe("c1");

    const second = rebindSeatConnection(first.bindings, "s1", "c2");
    expect(second.supersededConnectionId).toBe("c1");
    expect(second.bindings.s1).toBe("c2");
  });

  it("binding the same connection id twice returns null for superseded (reconnect reusing an id is not a takeover)", () => {
    const empty: SeatBindings = {};
    const first = rebindSeatConnection(empty, "s1", "c1");
    const again = rebindSeatConnection(first.bindings, "s1", "c1");
    expect(again.supersededConnectionId).toBeNull();
    expect(again.bindings.s1).toBe("c1");
  });

  it("binding a different seat does not disturb s1's binding", () => {
    const empty: SeatBindings = {};
    const first = rebindSeatConnection(empty, "s1", "c1");
    const second = rebindSeatConnection(first.bindings, "s2", "c9");
    expect(second.bindings.s1).toBe("c1");
    expect(second.bindings.s2).toBe("c9");
    expect(second.supersededConnectionId).toBeNull();
  });

  it("D-08: rebindSeatConnection never receives or returns a RoomState (asserted by type — no RoomState-shaped parameter exists in the signature)", () => {
    // Type-level assertion: rebindSeatConnection's parameters are
    // (SeatBindings, string, string) — there is no third object parameter
    // that could carry a RoomState. Compiling this file at all is the proof;
    // this call exercises the exact three-parameter shape.
    const result = rebindSeatConnection({}, "s1", "c1");
    expect(Object.keys(result)).toEqual(["bindings", "supersededConnectionId"]);
  });
});

describe("bindingsFromConnections", () => {
  it("rebuilds the seat map from connection attachments", () => {
    expect(
      bindingsFromConnections([
        { id: "c1", state: { seatId: "s1" } },
        { id: "c2", state: { seatId: "s2" } },
      ]),
    ).toEqual({ s1: "c1", s2: "c2" });
  });

  it("ignores connections that hold no seat", () => {
    expect(
      bindingsFromConnections([
        { id: "c1", state: null },
        { id: "c2", state: undefined },
        { id: "c3", state: {} },
        { id: "c4", state: { seatId: "" } },
        { id: "c5", state: { seatId: "s5" } },
      ]),
    ).toEqual({ s5: "c5" });
  });

  // REGRESSION (ROOM-04): the map used to be a plain in-memory field. A
  // hibernation wake wiped it while the sockets survived, so #pushState
  // iterated an empty map and nobody was told a new player had joined —
  // the lobby only updated on a manual reload. Deriving it from the
  // surviving connections is what makes a wake self-healing.
  it("reconstructs every binding after a wake that kept the sockets", () => {
    const survivors = [
      { id: "c1", state: { seatId: "host" } },
      { id: "c2", state: { seatId: "guest" } },
    ];
    expect(bindingsFromConnections(survivors)).toEqual({ host: "c1", guest: "c2" });
    expect(Object.keys(bindingsFromConnections(survivors))).toHaveLength(2);
  });

  it("returns an empty map when there are no connections", () => {
    expect(bindingsFromConnections([])).toEqual({});
  });
});
