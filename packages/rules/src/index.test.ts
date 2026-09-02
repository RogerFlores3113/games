import { describe, expect, it } from "vitest";
import { RULES_SMOKE } from "./index";

describe("rules smoke", () => {
  it("exports the smoke sentinel", () => {
    expect(RULES_SMOKE).toBe("rules-smoke-ok");
  });
});
