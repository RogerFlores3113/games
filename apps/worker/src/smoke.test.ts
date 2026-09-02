import { describe, expect, it } from "vitest";
import worker from "./index";

describe("worker smoke", () => {
  it("re-exports both workspace package sentinels via the /__smoke fetch handler", async () => {
    const request = new Request("http://localhost/__smoke");
    const response = await worker.fetch(request, {} as never);
    const body = await response.text();
    expect(body).toContain("schema-smoke-ok");
    expect(body).toContain("rules-smoke-ok");
  });
});
