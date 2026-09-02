import { describe, expect, it } from "vitest";
import { SCHEMA_SMOKE } from "@games/schema";

describe("web workspace alias", () => {
  it("resolves @games/schema from inside apps/web", () => {
    expect(SCHEMA_SMOKE).toBe("schema-smoke-ok");
  });
});
