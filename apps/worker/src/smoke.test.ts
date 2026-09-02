import { describe, expect, it } from "vitest";
import worker from "./index";

describe("worker smoke", () => {
  it("re-exports both workspace package sentinels via the fetch handler", async () => {
    const response = await worker.fetch();
    const body = await response.text();
    expect(body).toContain("schema-smoke-ok");
    expect(body).toContain("rules-smoke-ok");
  });
});
