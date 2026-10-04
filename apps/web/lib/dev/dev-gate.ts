export function devPanelEnabled(env: {
  NODE_ENV?: string;
  NEXT_PUBLIC_DEV_MODE?: string;
}): boolean {
  return env.NODE_ENV === "development" || env.NEXT_PUBLIC_DEV_MODE === "1";
}

// Literal property reads so Next inlines both values and strips the panel from production bundles.
export const DEV_PANEL_ENABLED = devPanelEnabled({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DEV_MODE: process.env.NEXT_PUBLIC_DEV_MODE,
});
