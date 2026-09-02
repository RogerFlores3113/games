// Wave 0 placeholder: proves the worker's bundler resolves BOTH workspace
// packages (@games/schema and @games/rules) across the npm-workspaces
// hoisted/symlinked node_modules layout (retiring research assumption A3).
// The real partyserver-based RoomDO implementation lands in Plan 07.

import { DurableObject } from "cloudflare:workers";
import { SCHEMA_SMOKE } from "@games/schema";
import { RULES_SMOKE } from "@games/rules";

// NOTE: do not re-export SCHEMA_SMOKE/RULES_SMOKE as top-level named exports
// here. wrangler's Modules format treats every top-level named export of the
// entry module as a potential Worker entrypoint (class/function only) — a
// plain constant export makes `wrangler dev`/`deploy` fail at runtime with
// "Incorrect type for map entry ... not of type 'function or ExportedHandler'".
// Exercise the sentinels through the fetch handler instead (see smoke.test.ts).

export class RoomDO extends DurableObject {
  // Stub — real partyserver Server<Env> subclass lands in Plan 07.
}

export default {
  async fetch(): Promise<Response> {
    return new Response(`${SCHEMA_SMOKE} ${RULES_SMOKE}`, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};
