// Wave 0 placeholder: proves the worker's bundler resolves BOTH workspace
// packages (@games/schema and @games/rules) across the npm-workspaces
// hoisted/symlinked node_modules layout (retiring research assumption A3).
// The real partyserver-based RoomDO implementation lands in Plan 07.

import { DurableObject } from "cloudflare:workers";
import { SCHEMA_SMOKE } from "@games/schema";
import { RULES_SMOKE } from "@games/rules";

export { SCHEMA_SMOKE, RULES_SMOKE };

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
