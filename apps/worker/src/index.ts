// Worker entry module: routes every request to the room's Durable Object via
// `partyserver`'s `routePartykitRequest`. The real room logic lives in
// `room-do.ts` — this file is only routing.
//
// NOTE: do not re-export plain constants (e.g. SCHEMA_SMOKE/RULES_SMOKE) as
// top-level named exports here. wrangler's Modules format treats every
// top-level named export of the entry module as a potential Worker
// entrypoint (class/function only) — a plain constant export makes
// `wrangler dev`/`deploy` fail at runtime with "Incorrect type for map
// entry ... not of type 'function or ExportedHandler'" (Plan 01 finding).

import { routePartykitRequest } from "partyserver";
import { SCHEMA_SMOKE } from "@games/schema";
import { RULES_SMOKE } from "@games/rules";
import { RoomDO, type Env } from "./room-do";

export { RoomDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preserve the Wave 0 smoke sentinels on a dedicated path so the
    // Wave 0 bundle grep / E2E smoke spec keep passing, without occupying
    // the room-routing namespace `routePartykitRequest` owns.
    const url = new URL(request.url);
    if (url.pathname === "/__smoke") {
      return new Response(`${SCHEMA_SMOKE} ${RULES_SMOKE}`, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    return (
      (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 })
    );
  },
};
