import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wave 0: default config. Transpile shared workspace packages that are
  // consumed as TypeScript source (no build step) rather than pre-built JS.
  transpilePackages: ["@games/schema", "@games/rules"],
};

export default nextConfig;
