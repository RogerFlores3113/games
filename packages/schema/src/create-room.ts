import { z } from "zod";
import { DisplayNameSchema, GameIdSchema, VariantSchema } from "./room";

// D-03: the room-creation request. One member per production game, each
// carrying that game's own config schema; closed and fail-closed via
// z.discriminatedUnion + z.strictObject so an unknown gameId, a missing/
// mismatched config, or an extra key is all rejected before a room is
// minted. The config value for Hanabi is its existing Variant (D-04) — the
// same value the room's `config` field will later carry, unchanged.
//
// This schema validates untrusted browser input to POST /api/room; plan
// 08-09 is the actual wire-up of that boundary (T-8-02-03).
export const CreateRoomRequestSchema = z.discriminatedUnion("gameId", [
  z.strictObject({
    gameId: z.literal(GameIdSchema.enum.hanabi),
    displayName: DisplayNameSchema,
    config: VariantSchema,
  }),
]);
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
