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
