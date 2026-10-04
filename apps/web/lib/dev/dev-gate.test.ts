import { describe, expect, it } from "vitest";
import { devPanelEnabled } from "./dev-gate";

describe("devPanelEnabled", () => {
  it("is off in production", () => {
    expect(devPanelEnabled({ NODE_ENV: "production" })).toBe(false);
  });
  it("is on in development", () => {
    expect(devPanelEnabled({ NODE_ENV: "development" })).toBe(true);
  });
  it("is on in production when the flag is 1", () => {
    expect(devPanelEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DEV_MODE: "1" })).toBe(true);
  });
  it("stays off when the flag is 0", () => {
    expect(devPanelEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DEV_MODE: "0" })).toBe(false);
  });
});
