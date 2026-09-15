import { describe, expect, it } from "vitest";
import worker from "./index";

// CR-02: a non-canonical room name must be refused at the Worker edge,
// BEFORE a Durable Object is ever created for it. The env is deliberately
// empty — reaching `routePartykitRequest` at all would throw here.
function wsRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { headers: { Upgrade: "websocket" } });
}

describe("worker fetch: room-name validation (CR-02)", () => {
  it.each([
    "/parties/room/abcdef",
    "/parties/room/ABCDE0",
    "/parties/room/ABCDEI",
    "/parties/room/ABCDEFG",
    "/parties/room/%E0%A4%A",
  ])("returns 404 for %s without touching a Durable Object", async (path) => {
    const response = await worker.fetch(wsRequest(path), {} as never);
    expect(response.status).toBe(404);
  });
});
