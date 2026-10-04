// The worker half of the dev-mode gate. Only `wrangler dev` started with
// `--var DEV_MODE:1` (the `dev` script, and Playwright's worker command)
// sets this; wrangler.jsonc carries no DEV_MODE var, so a deploy never does.

export const DEV_MODE_OFF_MESSAGE =
  "Dev mode is off on this worker. Restart it with `wrangler dev --var DEV_MODE:1` (npm run dev in apps/worker).";

export function devModeEnabled(env: { readonly DEV_MODE?: string }): boolean {
  return env.DEV_MODE === "1" || env.DEV_MODE === "true";
}
