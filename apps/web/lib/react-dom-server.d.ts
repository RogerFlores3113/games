// Minimal typing for the one react-dom/server export the own-hand render
// guard test (own-hand-render.test.ts) uses. The repo does not depend on
// @types/react-dom; remove this file if that package is ever added.
declare module "react-dom/server" {
  import type { ReactNode } from "react";
  export function renderToStaticMarkup(element: ReactNode): string;
}
