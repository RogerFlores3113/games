import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wave 0: default config. Transpile shared workspace packages that are
  // consumed as TypeScript source (no build step) rather than pre-built JS.
  transpilePackages: ["@games/schema", "@games/rules"],
  // Type-check production code only: test files import root devDependencies
  // (vitest) that Vercel does not install for this workspace.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // Explicit rather than relying on the App Router's default (Plan 12-08):
  // SCENE-01's Strict-Mode-safe Phaser mount (ExpeditionPhaserMount.tsx) is
  // verified under Strict Mode's dev-only double mount/unmount/mount.
  reactStrictMode: true,
  // The dev-only route indicator sits over the canvas's bottom-left corner,
  // covering game labels in screenshots.
  devIndicators: false,
};

export default nextConfig;
