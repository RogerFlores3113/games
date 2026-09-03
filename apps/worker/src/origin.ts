// WebSocket handshake origin policy, extracted as a pure function so it is
// unit-testable without spawning a Worker.
//
// Browsers do NOT CORS-gate the WebSocket handshake (RESEARCH.md Pitfall 7 /
// T-1-05), so this is enforced here or nowhere. It is defense-in-depth
// against a browser-based scraper — the confidentiality control is per-seat
// projection (`toSeatView`), not this.
//
// A request with NO `Origin` header (non-browser clients, the integration
// test's own Node WebSocket) is allowed through deliberately.
//
// LOCAL DEV: any loopback origin is allowed on ANY port. Pinning this to a
// single hardcoded port made the app fail as a blank lobby whenever the dev
// server fell back to another port (e.g. 3000 already occupied, Next picks
// 3001) — the socket was rejected 1008 and the client had no view to render.
// The dev port is not a security boundary; loopback already implies local
// access, and the tests that drive this send no Origin at all.

/** Non-loopback origins allowed in production. */
export const ALLOWED_ORIGINS = ["https://games.rogerflores.dev"];

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * @param origin The handshake's `Origin` header, or null when absent.
 * @returns true when the connection should be accepted.
 */
export function isOriginAllowed(origin: string | null): boolean {
  // No Origin header: not a browser. Allowed by design (see module comment).
  if (origin === null) {
    return true;
  }
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  return LOOPBACK_HOSTNAMES.has(url.hostname);
}
