import { safeGetItem, safeRemoveItem, safeSetItem } from "../safe-storage";
import { seatTokenKey } from "../seat-token";

// Per-room dev choices in this browser: a room "Play solo (dev)" created is
// filled with bots and started on the host's first view, and its bots take
// their own turns until the toolbar says otherwise.

const startKey = (code: string) => `${seatTokenKey(code)}:dev-start`;
const botsKey = (code: string) => `${seatTokenKey(code)}:dev-bots`;

export function markSoloRoom(code: string): void {
  safeSetItem(startKey(code), "1");
  safeSetItem(botsKey(code), "1");
}

/** True once: the first ask after `markSoloRoom` takes the start. */
export function takeSoloStart(code: string): boolean {
  if (safeGetItem(startKey(code)) !== "1") return false;
  safeRemoveItem(startKey(code));
  return true;
}

export function readBotsPlay(code: string): boolean {
  return safeGetItem(botsKey(code)) === "1";
}

export function writeBotsPlay(code: string, on: boolean): void {
  safeSetItem(botsKey(code), on ? "1" : "0");
}
