import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wave 0: default config. Transpile shared workspace packages that are
  // consumed as TypeScript source (no build step) rather than pre-built JS.
  transpilePackages: ["@games/schema", "@games/rules"],
  // Type-check production code only: test files import root devDependencies
  // (vitest) that Vercel does not install for this workspace.
  typescript: { tsconfigPath: "tsconfig.build.json" },
};

export default nextConfig;
