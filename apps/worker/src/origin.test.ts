import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "./origin";

describe("isOriginAllowed", () => {
  it("allows a connection with no Origin header (non-browser client)", () => {
    expect(isOriginAllowed(null)).toBe(true);
  });

  it("allows the production origin", () => {
    expect(isOriginAllowed("https://games.rogerflores.dev")).toBe(true);
  });

  // REGRESSION: the origin allowlist hardcoded port 3000. When port 3000 was
  // already occupied, Next dev fell back to 3001, every browser WebSocket was
  // closed 1008 "origin not allowed", and the lobby rendered as a blank page.
  it("allows a loopback dev origin on ANY port, not just 3000", () => {
    expect(isOriginAllowed("http://localhost:3000")).toBe(true);
    expect(isOriginAllowed("http://localhost:3001")).toBe(true);
    expect(isOriginAllowed("http://localhost:4321")).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:3001")).toBe(true);
  });

  it("rejects an arbitrary remote origin", () => {
    expect(isOriginAllowed("https://evil.example.com")).toBe(false);
    expect(isOriginAllowed("http://games.rogerflores.dev.evil.com")).toBe(false);
  });

  it("rejects a hostname that merely contains 'localhost'", () => {
    expect(isOriginAllowed("https://localhost.evil.com")).toBe(false);
    expect(isOriginAllowed("https://notlocalhost")).toBe(false);
  });

  it("rejects a malformed origin", () => {
    expect(isOriginAllowed("not a url")).toBe(false);
    expect(isOriginAllowed("")).toBe(false);
  });
});
