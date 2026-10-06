import type { ExpeditionView } from "@games/rules";
import type { RoomView } from "@games/schema";
import { characterName } from "./source-text";

/**
 * What the kick panel shows: the vote on each dropped teammate the crew can
 * kick now, who is back and waiting to rejoin, and, for a kicked player who
 * reconnected, where they come back in. Built from the room's `kickVotes`
 * and the game view's `kicked`; null when there is nothing to show.
 */

export interface KickVoteRow {
  seatId: string;
  name: string;
  votes: number;
  needed: number;
  youVoted: boolean;
  canVote: boolean;
}

export interface KickPanelModel {
  votes: KickVoteRow[];
  /** What a kick does at this point of the run. */
  consequence: string;
  /** Kicked teammates who are back, waiting for the next loadout. */
  returning: string[];
  /** Set when the viewer is the one out of the crew. */
  yours: { title: string; text: string } | null;
}

function consequenceOf(game: ExpeditionView): string {
  const stage = game.stage;
  const now =
    stage.tag === "camp"
      ? `Kicking restarts camp ${stage.camp.index} without them, at no cost.`
      : stage.tag === "loadout"
        ? `Kicking sets out for camp ${stage.camp.index} without them.`
        : stage.tag === "muster"
          ? "Kicking starts the run without them."
          : "Kicking goes on without them.";
  return `${now} If they come back, they rejoin at the next loadout.`;
}

/** Where a kicked player comes back in, from the run's stage. */
function rejoinPoint(game: ExpeditionView): string {
  const stage = game.stage;
  switch (stage.tag) {
    case "camp":
      return `the next loadout, once camp ${stage.camp.index} ends`;
    case "shop":
    case "draft":
    case "event":
      return `the loadout before camp ${stage.next}`;
    case "route":
      return stage.options[0] === undefined ? "the next loadout" : `the loadout before camp ${stage.options[0].next.index}`;
    case "muster":
    case "loadout":
    case "ended":
      return "the next loadout";
  }
}

export function buildKickPanel(room: Pick<RoomView, "youSeatId" | "seats" | "kickVotes">, game: ExpeditionView): KickPanelModel | null {
  const nameOf = (seatId: string): string => room.seats.find((s) => s.seatId === seatId)?.displayLabel ?? "A teammate";
  const you = game.kicked.find((k) => k.seatId === room.youSeatId);
  const yours =
    you === undefined
      ? null
      : game.runStatus !== "in_progress"
        ? { title: "The run is over", text: "The crew finished the run without you." }
        : {
            title: "You're out of the crew for now",
            text: `The crew went on while you were away. You rejoin${you.characterId === null ? "" : ` as ${characterName(you.characterId)}`}, with your items and upgrade, at ${rejoinPoint(game)}.`,
          };
  const votes = (room.kickVotes ?? []).map((k) => ({
    seatId: k.targetSeatId,
    name: nameOf(k.targetSeatId),
    votes: k.voterSeatIds.length,
    needed: k.needed,
    youVoted: k.voterSeatIds.includes(room.youSeatId),
    canVote: k.youCanVote,
  }));
  const returning = you === undefined ? game.kicked.filter((k) => k.back).map((k) => nameOf(k.seatId)) : [];
  if (votes.length === 0 && returning.length === 0 && yours === null) return null;
  return { votes, consequence: consequenceOf(game), returning, yours };
}
