import { z } from "zod";

// Dev-mode wire vocabulary. A worker started with DEV_MODE accepts `dev`
// messages; every other worker answers them with a refusing `dev_result`.
// Game-agnostic: a game's own state travels as `unknown` and is parsed by
// that game's state schema in the worker registry.

export const DEV_AUTOPLAY_MAX_STEPS = 5000;

const DevOptionSchema = z.strictObject({ value: z.string(), label: z.string() });

export const DevFieldSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    name: z.string().min(1),
    label: z.string(),
    kind: z.literal("number"),
    min: z.number(),
    max: z.number(),
    initial: z.number(),
  }),
  z.strictObject({
    name: z.string().min(1),
    label: z.string(),
    kind: z.literal("choice"),
    options: z.array(DevOptionSchema).readonly(),
  }),
  z.strictObject({
    name: z.string().min(1),
    label: z.string(),
    kind: z.literal("text"),
    initial: z.string(),
  }),
]);

export const DevShortcutSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string(),
  group: z.string(),
  fields: z.array(DevFieldSchema).readonly(),
});
export type DevShortcutWire = z.infer<typeof DevShortcutSchema>;

export const DevInspectSectionSchema = z.strictObject({
  title: z.string(),
  lines: z.array(z.string()).readonly(),
});
export type DevInspectSectionWire = z.infer<typeof DevInspectSectionSchema>;

/** Which seats autoplay may act for: bot seats only, every seat but the
 * requester's, or every seat. */
export const DevAutoplayScopeSchema = z.enum(["bots", "others", "everyone"]);
export type DevAutoplayScope = z.infer<typeof DevAutoplayScopeSchema>;

export const DevCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("snapshot") }),
  z.strictObject({ kind: z.literal("load-state"), state: z.unknown() }),
  z.strictObject({
    kind: z.literal("shortcut"),
    id: z.string().min(1).max(64),
    params: z.record(z.string(), z.union([z.string().max(2000), z.number()])),
  }),
  z.strictObject({
    kind: z.literal("autoplay"),
    scope: DevAutoplayScopeSchema,
    maxSteps: z.number().int().min(1).max(DEV_AUTOPLAY_MAX_STEPS),
    stopAtMilestone: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("add-bot") }),
]);
export type DevCommand = z.infer<typeof DevCommandSchema>;

export const DevMessageSchema = z.strictObject({
  type: z.literal("dev"),
  command: DevCommandSchema,
});

/** The whole game state plus the game's shortcuts. Sent only to the dev
 * socket that asked, never fanned out to the room. */
export const DevStateMessageSchema = z.strictObject({
  type: z.literal("dev_state"),
  game: z.unknown(),
  shortcuts: z.array(DevShortcutSchema).readonly(),
  inspect: z.array(DevInspectSectionSchema).readonly(),
  milestone: z.string(),
});

export const DevResultMessageSchema = z.strictObject({
  type: z.literal("dev_result"),
  ok: z.boolean(),
  message: z.string(),
});
