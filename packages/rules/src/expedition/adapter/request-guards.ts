// The adapter-boundary hostile-input validator (adapter.ts invariant 2):
// narrows `unknown` -> `RunAction` for exactly the well-formed shapes,
// mirroring hanabi/actions.ts's isPlayRequest exact-own-key discipline. Hand-
// written guards, not Zod, because packages/rules is zero-dependency
// (FDN-02) — Zod lives only in packages/schema, on the outbound side. The
// MAX_REQUEST_LIST_LENGTH cap bounds per-request work for targets and
// item uids before any engine code runs (T-11-08).

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

function parseVote(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "choice"])) return null;
  if (typeof record.choice !== "string" && record.choice !== null) return null;
  return { type: "vote", choice: record.choice };
}

function parseLockIn(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type"])) return null;
  return { type: "lock-in" };
}

function parseEquip(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "itemUids"])) return null;
  if (!isBoundedStringArray(record.itemUids)) return null;
  return { type: "equip", itemUids: Array.from(record.itemUids) };
}

function parseDiscardItem(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "itemUid"])) return null;
  if (typeof record.itemUid !== "string") return null;
  return { type: "discard-item", itemUid: record.itemUid };
}

function parseBuy(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "stockId"])) return null;
  if (typeof record.stockId !== "string") return null;
  return { type: "buy", stockId: record.stockId };
}

function parsePickBundle(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "bundle"])) return null;
  if (typeof record.bundle !== "number" || !Number.isInteger(record.bundle) || record.bundle < 0) return null;
  return { type: "pick-bundle", bundle: record.bundle };
}

function parseReady(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type"])) return null;
  return { type: "ready" };
}

function parseUseAbility(record: Record<string, unknown>): RunAction | null {
  if (!hasExactKeys(record, ["type", "sourceKey", "targets"])) return null;
  if (typeof record.sourceKey !== "string") return null;
  if (!isBoundedStringArray(record.targets)) return null;
  return { type: "use-ability", sourceKey: record.sourceKey, targets: Array.from(record.targets) };
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
    case "vote":
      return parseVote(request);
    case "lock-in":
      return parseLockIn(request);
    case "equip":
      return parseEquip(request);
    case "discard-item":
      return parseDiscardItem(request);
    case "buy":
      return parseBuy(request);
    case "pick-bundle":
      return parsePickBundle(request);
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
