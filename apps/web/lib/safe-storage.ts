/**
 * D-02/D-30: the ONE defensive `localStorage` wrapper every persisted
 * preference in Phase 6.1 goes through (notes, discard-view preference,
 * audio mute/volume). Mirrors `seat-token.ts`'s `getLocalStorage` discipline
 * exactly (SSR-safe `typeof window` guard, try/catch around the localStorage
 * GETTER itself since Safari private mode throws there, not just on the
 * methods) but is generalized so no module needs its own copy of this
 * pattern (T-06.1-10).
 *
 * Every exported function here degrades to its fallback (`null` / `void` /
 * `[]`) and never throws, regardless of SSR, storage-disabled browsers, or a
 * throwing getItem/setItem/removeItem/key/length.
 */

function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    // Private-mode Safari / storage disabled — treat as "no storage".
    return undefined;
  }
}

/** Returns the stored value for `key`, or `null` if absent, storage is
 * unavailable, or access throws. Never throws. */
export function safeGetItem(key: string): string | null {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Persists `value` under `key`. No-ops (never throws) if storage is
 * unavailable or access fails (quota exceeded, disabled, etc). */
export function safeSetItem(key: string, value: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // Degrade to "not saved" — never crash the board over a preference.
  }
}

/** Removes `key`. No-ops on any failure. */
export function safeRemoveItem(key: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // No-op.
  }
}

/** Lists every stored key starting with `prefix`. Returns `[]` if storage is
 * unavailable or any access throws (including mid-iteration). */
export function safeKeysWithPrefix(prefix: string): string[] {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  } catch {
    return [];
  }
}
