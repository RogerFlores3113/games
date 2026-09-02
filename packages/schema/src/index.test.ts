import { describe, expect, it } from "vitest";
import { SCHEMA_SMOKE } from "./index";

describe("schema smoke", () => {
  it("exports the smoke sentinel", () => {
    expect(SCHEMA_SMOKE).toBe("schema-smoke-ok");
  });
});
