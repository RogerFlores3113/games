import { expect, test } from "@playwright/test";

test("web dev server serves the schema smoke sentinel", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("schema-smoke-ok");
});

test("worker dev server serves both workspace smoke sentinels", async ({ request }) => {
  const response = await request.get("http://localhost:8787/__smoke");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("rules-smoke-ok");
});
