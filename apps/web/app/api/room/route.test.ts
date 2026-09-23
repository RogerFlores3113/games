import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@games/schema";
import { POST } from "./route";
import { pendingRoomCookieName } from "../../../lib/pending-room-cookie";

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formRequest(fields: Record<string, string>): Request {
  const params = new URLSearchParams(fields);
  return new Request("http://localhost/api/room", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

describe("POST /api/room — JSON path", () => {
  it("returns 200 with a matching code and path for a valid body, and no Set-Cookie", async () => {
    const res = await POST(jsonRequest({ gameId: "hanabi", displayName: "Roger", config: "rainbow" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toMatch(CODE_PATTERN);
    expect(json.path).toBe(`/room/${json.code}`);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 for an empty display name", async () => {
    const res = await POST(jsonRequest({ gameId: "hanabi", displayName: "", config: "base" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("bad_request");
  });

  it("returns 400 for a display name over MAX_DISPLAY_NAME_LENGTH (24)", async () => {
    const res = await POST(jsonRequest({ gameId: "hanabi", displayName: "a".repeat(25), config: "base" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown gameId", async () => {
    const res = await POST(jsonRequest({ gameId: "expedition", displayName: "Roger", config: "purple" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing config", async () => {
    const res = await POST(jsonRequest({ gameId: "hanabi", displayName: "Roger" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an extra key", async () => {
    const res = await POST(jsonRequest({ gameId: "hanabi", displayName: "Roger", config: "base", extra: "nope" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("produces 200 distinct codes across 200 successive calls", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const res = await POST(jsonRequest({ gameId: "hanabi", displayName: "Roger", config: "base" }));
      const json = await res.json();
      expect(json.code).toMatch(CODE_PATTERN);
      codes.add(json.code);
    }
    expect(codes.size).toBe(200);
  });
});

describe("POST /api/room — native form path (D-17)", () => {
  it("303s to /room/{code} with no query string and sets a scoped pending-room cookie", async () => {
    const res = await POST(formRequest({ gameId: "hanabi", displayName: "Roger", "config.hanabi": "rainbow" }));
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    const locationUrl = new URL(location);
    expect(locationUrl.pathname).toMatch(/^\/room\/[A-Z0-9]{6}$/);
    expect(locationUrl.search).toBe("");
    const code = locationUrl.pathname.split("/").pop()!;

    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain(pendingRoomCookieName(code));
    expect(setCookie).toContain(`Path=/room/${code}`);
    expect(setCookie).toContain("Max-Age=120");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).not.toContain("HttpOnly");

    const valueMatch = setCookie.match(new RegExp(`${pendingRoomCookieName(code)}=([^;]+)`));
    const decoded = JSON.parse(decodeURIComponent(valueMatch![1]!));
    expect(decoded).toEqual({ gameId: "hanabi", displayName: "Roger", config: "rainbow" });
  });

  it("303s to /?error=create with no Set-Cookie for a blank display name", async () => {
    const res = await POST(formRequest({ gameId: "hanabi", displayName: "   ", "config.hanabi": "base" }));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname + location.search).toBe("/?error=create");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("303s to /?error=create for an unrecognized gameId", async () => {
    const res = await POST(formRequest({ gameId: "expedition", displayName: "Roger", "config.expedition": "purple" }));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname + location.search).toBe("/?error=create");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("reads only the selected game's namespaced config when several settings panels submit (WR-02)", async () => {
    // Every panel on the landing form is submitted, hidden or not; another
    // game's field (and a legacy un-namespaced one) must never be picked up.
    const res = await POST(
      formRequest({
        gameId: "hanabi",
        displayName: "Roger",
        "config.other": "base",
        config: "base",
        "config.hanabi": "black",
      }),
    );
    expect(res.status).toBe(303);
    const code = new URL(res.headers.get("location")!).pathname.split("/").pop()!;
    const setCookie = res.headers.get("set-cookie")!;
    const valueMatch = setCookie.match(new RegExp(`${pendingRoomCookieName(code)}=([^;]+)`));
    expect(JSON.parse(decodeURIComponent(valueMatch![1]!))).toEqual({
      gameId: "hanabi",
      displayName: "Roger",
      config: "black",
    });
  });

  it("303s to /?error=create when only another game's config field is present (WR-02)", async () => {
    const res = await POST(formRequest({ gameId: "hanabi", displayName: "Roger", "config.other": "base" }));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname + location.search).toBe("/?error=create");
  });
});
