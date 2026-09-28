import type { ExpeditionView } from "@games/rules";
import { GEAR_DISPLAY } from "@games/rules";
import type { SceneServerInput } from "./build-scene-model";
import { draftObjectId, loadoutObjectId, READY_ID } from "./expedition-ids";

/**
 * D-01 throwaway stub: this is a bare functional draft/loadout/ready model
 * for the fireside step, deliberately kept separate from `build-scene-
 * model.ts` so Phase 13 can delete this file (and its Phaser scene,
 * `BetweenCampsScene.ts`) cleanly without touching the real camp scene's
 * model. `fits` is display-only guidance for the player — the worker still
 * independently refuses an over-capacity `set-loadout` (`over_capacity`);
 * this model never re-derives or replaces that check.
 */

export interface BetweenCampsModel {
  campNumber: number;
  supplies: number;
  runStatus: ExpeditionView["runStatus"];
  sign: { label: string };
  draftOffer: { gearId: string; objectId: string; name: string; size: number; window: string; text: string }[] | null;
  owned: { gearId: string; objectId: string; name: string; size: number; equipped: boolean; fits: boolean }[];
  capacity: number | null;
  capacityUsed: number;
  youReady: boolean;
  readyObjectId: string;
  seats: { seatId: string; displayLabel: string; ready: boolean; draftPending: boolean; connected: boolean }[];
  lastResult: { campNumber: number; status: "succeeded" | "failed" } | null;
}

function gearSize(gearId: string): number {
  return GEAR_DISPLAY[gearId]?.size ?? 0;
}

export function buildBetweenCampsModel(server: SceneServerInput): BetweenCampsModel {
  const { game: view, roomSeats } = server;

  const yourSeat = view.seats.find((s) => s.seatId === view.yourSeatId);
  const equippedGearIds = yourSeat?.equippedGearIds ?? [];

  const draftOffer =
    view.yourDraftOffer === null
      ? null
      : view.yourDraftOffer.map((gearId) => {
          const display = GEAR_DISPLAY[gearId];
          return {
            gearId,
            objectId: draftObjectId(gearId),
            name: display?.name ?? gearId,
            size: display?.size ?? 0,
            window: display?.window ?? "passive",
            text: display?.text ?? "",
          };
        });

  const capacity = view.yourCapacity;
  const capacityUsed = equippedGearIds.reduce((sum, gearId) => sum + gearSize(gearId), 0);

  const owned = view.yourOwnedGearIds.map((gearId) => {
    const display = GEAR_DISPLAY[gearId];
    const equipped = equippedGearIds.includes(gearId);
    const fits = equipped || (capacity !== null && capacityUsed + gearSize(gearId) <= capacity);
    return {
      gearId,
      objectId: loadoutObjectId(gearId),
      name: display?.name ?? gearId,
      size: display?.size ?? 0,
      equipped,
      fits,
    };
  });

  const youReady = yourSeat?.ready ?? false;

  const seats = view.seats.map((s) => {
    const room = roomSeats.find((r) => r.seatId === s.seatId);
    return {
      seatId: s.seatId,
      displayLabel: room?.displayLabel ?? "?",
      ready: s.ready,
      draftPending: s.draftPending,
      connected: room?.connected ?? false,
    };
  });

  let label: string;
  if (view.runStatus === "won") {
    label = "Temple reached";
  } else if (view.runStatus === "lost") {
    label = "Turned back";
  } else if (draftOffer !== null) {
    label = "Pick your gear";
  } else if (!youReady) {
    label = "Pack and ready up";
  } else {
    const notReadyNames = seats.filter((s) => !s.ready).map((s) => s.displayLabel);
    label = `Waiting on ${notReadyNames.join(", ")}`;
  }

  const lastEntry = view.history[view.history.length - 1] ?? null;
  const lastResult = lastEntry === null ? null : { campNumber: lastEntry.campNumber, status: lastEntry.status };

  return {
    campNumber: view.campNumber,
    supplies: view.supplies,
    runStatus: view.runStatus,
    sign: { label },
    draftOffer,
    owned,
    capacity,
    capacityUsed,
    youReady,
    readyObjectId: READY_ID,
    seats,
    lastResult,
  };
}
