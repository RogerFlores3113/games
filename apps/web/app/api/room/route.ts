import { NextResponse } from "next/server";
import { CreateRoomRequestSchema } from "@games/schema";
import { mintRoomCode } from "../../../lib/room-code";
import { pendingRoomCookieName } from "../../../lib/pending-room-cookie";
import { readCreateRoomForm } from "../../../lib/create-room-form";

// Node runtime, explicit rather than relying on the default — this route
// only mints a string and never touches Durable Object state (see
// RESEARCH.md § "Open Questions" item 1: lazy DO creation on the host's
// first WebSocket connect is sufficient for Phase 1; no server-to-server
// Vercel -> Worker HTTP call is made here or anywhere in this plan).
export const runtime = "nodejs";

/** D-17: the native-form path a pre-hydration submit takes. Mints a code
 * exactly like the JSON path, then hands the validated request to the room
 * page through a short-lived cookie scoped to that room's own path — never
 * a query string, so `window.location.href` (Copy link) can never leak it,
 * even transiently. */
function handleFormPost(request: Request, formData: FormData) {
  // WR-02: only the selected game's namespaced config field is read.
  const parsed = CreateRoomRequestSchema.safeParse(readCreateRoomForm(formData));

  if (!parsed.success) {
    return NextResponse.redirect(new URL("/?error=create", request.url), 303);
  }

  const code = mintRoomCode();
  const response = NextResponse.redirect(new URL(`/room/${code}`, request.url), 303);
  const isHttps = new URL(request.url).protocol === "https:";
  // NextResponse's cookie serializer always applies encodeURIComponent to
  // the value itself (see @edge-runtime/cookies stringifyCookie) — encoding
  // it here too would double-encode, and consumePendingRoomCookie's single
  // decodeURIComponent on read would then fail to parse. Pass the raw JSON
  // string; the header itself carries the encoded form.
  response.cookies.set(pendingRoomCookieName(code), JSON.stringify(parsed.data), {
    path: `/room/${code}`,
    maxAge: 120,
    sameSite: "lax",
    httpOnly: false,
    secure: isHttps,
  });
  return response;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const parsed = CreateRoomRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const code = mintRoomCode();
    return NextResponse.json({ code, path: `/room/${code}` }, { status: 200 });
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.redirect(new URL("/?error=create", request.url), 303);
    }
    return handleFormPost(request, formData);
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
