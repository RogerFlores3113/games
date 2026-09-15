import { VariantSchema, type RoomView, type Variant } from "@games/schema";
import { seatTokenKey } from "./seat-token";

/**
 * WR-04: the variant a creator picked on the landing page. `/api/room` only
 * mints a code and the Durable Object always starts a room on `"base"`, so
 * the choice is carried here and applied by the host's own client, through
 * the ordinary `set_variant` message, right after its first join. The
 * server stays authoritative: a non-host or started room is refused there.
 *
 * SSR-safe and never throws, like `seat-token.ts`.
 */

/** `room:{code}:variant` */
export function pendingVariantKey(code: string): string {
  return `${seatTokenKey(code)}:variant`;
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readPendingVariant(code: string): Variant | undefined {
  const storage = getLocalStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const parsed = VariantSchema.safeParse(storage.getItem(pendingVariantKey(code)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writePendingVariant(code: string, variant: Variant): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(pendingVariantKey(code), variant);
  } catch {
    // Degrade to the default variant — the host can still pick in the lobby.
  }
}

export function clearPendingVariant(code: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(pendingVariantKey(code));
  } catch {
    // No-op.
  }
}

/** The variant the host's client should request now, or `null` when there
 * is nothing to do: nothing pending, this viewer is not the host, the game
 * has already started, or the room is already on that variant. */
export function variantToApply(view: RoomView, pending: Variant | undefined): Variant | null {
  if (pending === undefined) return null;
  if (view.status !== "lobby") return null;
  if (view.youSeatId !== view.hostSeatId) return null;
  if (view.variant === pending) return null;
  return pending;
}
