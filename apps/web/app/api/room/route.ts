import { NextResponse } from "next/server";
import { z } from "zod";
import { DisplayNameSchema, VariantSchema } from "@games/schema";
import { mintRoomCode } from "../../../lib/room-code";

// Node runtime, explicit rather than relying on the default — this route
// only mints a string and never touches Durable Object state (see
// RESEARCH.md § "Open Questions" item 1: lazy DO creation on the host's
// first WebSocket connect is sufficient for Phase 1; no server-to-server
// Vercel -> Worker HTTP call is made here or anywhere in this plan).
export const runtime = "nodejs";

const CreateRoomBodySchema = z.object({
  displayName: DisplayNameSchema,
  variant: VariantSchema,
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = CreateRoomBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const code = mintRoomCode();
  return NextResponse.json({ code, path: `/room/${code}` }, { status: 200 });
}
