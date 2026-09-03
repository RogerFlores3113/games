import { expect, test } from "@playwright/test";

test("web dev server serves the create-room screen", async ({ request }) => {
  // Plan 08 replaced Wave 0's SCHEMA_SMOKE stub with the real D-03
  // create-room screen — this sentinel now asserts on that screen's own
  // stable content instead of a retired smoke string.
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Create room");
});

test("worker dev server serves both workspace smoke sentinels", async ({ request }) => {
  const response = await request.get("http://localhost:8787/__smoke");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("rules-smoke-ok");
});
