import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: "npm run dev --workspace apps/web",
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx wrangler dev --port 8787",
      cwd: "apps/worker",
      port: 8787,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
