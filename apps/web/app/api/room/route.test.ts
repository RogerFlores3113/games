import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@games/schema";
import { POST } from "./route";

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/room", () => {
  it("returns 200 with a matching code and path for a valid body", async () => {
    const res = await POST(postRequest({ displayName: "Roger", variant: "base" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toMatch(CODE_PATTERN);
    expect(json.path).toBe(`/room/${json.code}`);
  });

  it("returns 400 for an empty display name", async () => {
    const res = await POST(postRequest({ displayName: "", variant: "base" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("bad_request");
  });

  it("returns 400 for a display name over MAX_DISPLAY_NAME_LENGTH (24)", async () => {
    const res = await POST(postRequest({ displayName: "a".repeat(25), variant: "base" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown variant", async () => {
    const res = await POST(postRequest({ displayName: "Roger", variant: "wild" }));
    expect(res.status).toBe(400);
  });

  it("produces 200 distinct codes across 200 successive calls", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const res = await POST(postRequest({ displayName: "Roger", variant: "base" }));
      const json = await res.json();
      expect(json.code).toMatch(CODE_PATTERN);
      codes.add(json.code);
    }
    expect(codes.size).toBe(200);
  });
});
