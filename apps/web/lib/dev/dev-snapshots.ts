import { safeGetItem, safeRemoveItem, safeSetItem } from "../safe-storage";

export interface DevSnapshot {
  name: string;
  savedAt: number;
  state: unknown;
}

const key = (gameId: string) => `games:dev-snapshots:${gameId}`;

function readAll(gameId: string): DevSnapshot[] {
  const raw = safeGetItem(key(gameId));
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is DevSnapshot =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as DevSnapshot).name === "string" &&
        typeof (entry as DevSnapshot).savedAt === "number",
    );
  } catch {
    return [];
  }
}

/** Newest first. */
export function listSnapshots(gameId: string): DevSnapshot[] {
  return readAll(gameId).sort((a, b) => b.savedAt - a.savedAt);
}

/** Saving under an existing name replaces it. */
export function saveSnapshot(
  gameId: string,
  name: string,
  state: unknown,
  now: number = Date.now(),
): void {
  const others = readAll(gameId).filter((snapshot) => snapshot.name !== name);
  safeSetItem(key(gameId), JSON.stringify([...others, { name, savedAt: now, state }]));
}

export function removeSnapshot(gameId: string, name: string): void {
  const rest = readAll(gameId).filter((snapshot) => snapshot.name !== name);
  if (rest.length === 0) safeRemoveItem(key(gameId));
  else safeSetItem(key(gameId), JSON.stringify(rest));
}
