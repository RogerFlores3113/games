import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "schema",
          root: "packages/schema",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@games/schema": alias("./packages/schema/src/index.ts"),
            "@games/rules": alias("./packages/rules/src/index.ts"),
          },
        },
      },
      {
        test: {
          name: "rules",
          root: "packages/rules",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@games/schema": alias("./packages/schema/src/index.ts"),
            "@games/rules": alias("./packages/rules/src/index.ts"),
          },
        },
      },
      {
        test: {
          name: "worker",
          root: "apps/worker",
          include: ["src/**/*.test.ts"],
          // room-do.test.ts drives a real `wrangler dev` process over real
          // WebSockets; the default 5s test timeout is too tight for that
          // suite's network round trips (the D-17 restart test overrides
          // this per-test to allow for the forced process kill/respawn).
          testTimeout: 15000,
          hookTimeout: 30000,
          // `partyserver`'s compiled JS imports "cloudflare:workers" itself
          // (RoomDO extends its Server class) — Vite externalizes node_modules
          // deps by default, which skips `resolve.alias` entirely. Inlining
          // forces `partyserver` through the same transform/alias pipeline as
          // our own source, so the shim below also covers this transitive
          // import (Plan 07 finding, Rule 3 blocking fix).
          server: {
            deps: {
              inline: ["partyserver"],
            },
          },
        },
        resolve: {
          alias: {
            "@games/schema": alias("./packages/schema/src/index.ts"),
            "@games/rules": alias("./packages/rules/src/index.ts"),
            // "cloudflare:workers" only exists inside workerd; shim it for
            // Node-based Vitest runs. See apps/worker/test/cloudflare-workers-shim.ts.
            "cloudflare:workers": alias("./apps/worker/test/cloudflare-workers-shim.ts"),
          },
        },
      },
      {
        test: {
          name: "web",
          root: "apps/web",
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
        resolve: {
          alias: {
            "@games/schema": alias("./packages/schema/src/index.ts"),
            "@games/rules": alias("./packages/rules/src/index.ts"),
          },
        },
      },
    ],
  },
});
