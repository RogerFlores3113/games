// The adapter-boundary hostile-input validator (adapter.ts invariant 2):
// narrows `unknown` -> `RunAction` for exactly the well-formed shapes,
// mirroring hanabi/actions.ts's isPlayRequest exact-own-key discipline. Hand-
// written guards, not Zod, because packages/rules is zero-dependency
// (FDN-02) — Zod lives only in packages/schema, on the outbound side. The
// MAX_REQUEST_LIST_LENGTH cap bounds per-request work for targets
// before any engine code runs (T-11-08).

import type { RunAction } from "../run/types";

export const MAX_REQUEST_LIST_LENGTH = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(request: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(request);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => actual.includes(key));
}

function isBoundedStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  if (value.length > MAX_REQUEST_LIST_LENGTH) return false;
  return value.every((item) => typeof item === "string");
}

function parsePickCharacter(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "characterId"])) return null;
  if (typeof record.characterId !== "string") return null;
  return { type: "pick-character", characterId: record.characterId };
}

function parsePickDraft(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "sourceId"])) return null;
  if (typeof record.sourceId !== "string") return null;
  return { type: "pick-draft", sourceId: record.sourceId };
}

function parseReady(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type"])) return null;
  return { type: "ready" };
}

function parseUseAbility(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "sourceId", "targets"])) return null;
  if (typeof record.sourceId !== "string") return null;
  if (!isBoundedStringArray(record.targets)) return null;
  return { type: "use-ability", sourceId: record.sourceId, targets: Array.from(record.targets) };
}

function parseSkipWindow(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type"])) return null;
  return { type: "skip-window" };
}

function parseWhisper(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "targetSeatId", "cardId"])) return null;
  if (typeof record.targetSeatId !== "string") return null;
  if (typeof record.cardId !== "string") return null;
  return { type: "whisper", targetSeatId: record.targetSeatId, cardId: record.cardId };
}

function parsePickObjective(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "objectiveId"])) return null;
  if (typeof record.objectiveId !== "string") return null;
  return { type: "pick-objective", objectiveId: record.objectiveId };
}

function parsePlayCard(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "cardId"])) return null;
  if (typeof record.cardId !== "string") return null;
  return { type: "play-card", cardId: record.cardId };
}

/** Narrows `request: unknown` to `RunAction` only for its exact shapes,
 * returning a FRESH literal (arrays copied via `Array.from`) — never the
 * request object itself, so no prototype or spoofed extra property can ride
 * through. Pure, never throws. */
export function parseRunAction(request: unknown): RunAction | null {
  if (!isRecord(request)) return null;
  const type = (request as { type: unknown }).type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "pick-character":
      return parsePickCharacter(request);
    case "pick-draft":
      return parsePickDraft(request);
    case "ready":
      return parseReady(request);
    case "use-ability":
      return parseUseAbility(request);
    case "skip-window":
      return parseSkipWindow(request);
    case "whisper":
      return parseWhisper(request);
    case "pick-objective":
      return parsePickObjective(request);
    case "play-card":
      return parsePlayCard(request);
    default:
      return null;
  }
}
