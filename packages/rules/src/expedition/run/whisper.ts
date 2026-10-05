// The Whisper (Plan 10-06, spec §3 "The Whisper", §6.4). This is the one
// mid-camp player action that is not a card play and is not routed through
// the toolkit (Plan 10-04) — a Whisper only ever appends a Reveal and a
// public LogEntry, it never touches CampState.
//
// COMM-01's split: the log entry names the whisperer and the target (public
// — everyone sees WHO whispered to WHOM) while the card identity lives
// exclusively inside the Reveal's audience-scoped list (private — only the
// audience ever learns WHAT was named). A LogEntry never carries a card id
// (types.ts's own contract).
//
// COMM-02's lifetime: reveals live on AttemptState, so a Whisper's Reveal
// persists for the rest of the CURRENT ATTEMPT ONLY — it is torn down the
// instant the attempt is replaced (a failed camp's replay) or the camp ends
// and a new one is dealt (RUN-06's reset-on-replay contract already covers
// this: a fresh AttemptState always starts with reveals: []).
//
// AUDIENCE IS COMPUTED PRE-APPEND: whisperAudience(run, ...) is evaluated
// against the RunState as it stood BEFORE this whisper is recorded, so a
// layer reading whispersUsedBy sees prior whispers only.
//
// whispersUsedBy is DERIVED from the attempt's log (no counter field is ever
// stored — matches types.ts's own "derive, don't cache" discipline): it is
// the count of "whisper" and "whisper-washed" log entries whose actorSeatId
// is the seat in question.
//
// WASHED WHISPERS: while fewer than rules.washedWhispers crew whispers have
// been sent this attempt (Rain, Downpour), a whisper is spent with no
// Reveal at all; its public "whisper-washed" log entry tells the table.
//
// Sources that change whisper legality, audience or count act
// ONLY through the composed RunHooks (whisperAllowed/whisperAudience/
// whispersPerCamp); this file never names any of them.

import { findOwnCard } from "../legality";
import { currentWindow } from "./windows";
import { attemptOf, withAttempt } from "./attempt";
import { rulesFor } from "./compose";
import { react } from "./react";
import type { Catalog, LogEntry, Reveal, RunAt, RunError, RunState } from "./types";
import type { AdapterResult } from "../../adapter";

const isWhisper = (entry: LogEntry): boolean => entry.event === "whisper" || entry.event === "whisper-washed";

/** COMM-01/COMM-02: the count of this attempt's whispers, heard or washed
 * away, whose actorSeatId is `seatId`. Returns 0 with no attempt in
 * progress — there is nothing to derive from. */
export function whispersUsedBy(run: RunState, seatId: string): number {
  return (attemptOf(run)?.log ?? []).filter((entry) => isWhisper(entry) && entry.actorSeatId === seatId).length;
}

/** Every whisper the crew has sent this attempt, heard or washed away. */
export function crewWhispers(run: RunState): number {
  return (attemptOf(run)?.log ?? []).filter(isWhisper).length;
}

/** Guard order (COMM-01): wrong_phase (no attempt) -> wrong_window (must be between tricks, D-13: no grace period)
 * -> whisper_blocked (a source layer forbids it) -> no_whispers_left
 * (per-camp cap, composed) -> invalid_target (self or a non-seat) ->
 * card_not_in_hand (own-hand-only, T-10-20). */
export function whisperLegality(
  run: RunState,
  actorSeatId: string,
  targetSeatId: string,
  cardId: string,
  catalog: Catalog,
): { legal: true } | { legal: false; reason: RunError } {
  const attempt = attemptOf(run);
  if (attempt === null) {
    return { legal: false, reason: "wrong_phase" };
  }
  const rules = rulesFor(run, catalog);
  if (currentWindow(run, rules) !== "between-tricks") {
    return { legal: false, reason: "wrong_window" };
  }
  if (!rules.whisperAllowed(run, actorSeatId)) {
    return { legal: false, reason: "whisper_blocked" };
  }
  if (whispersUsedBy(run, actorSeatId) >= rules.whispersPerCamp(run, actorSeatId)) {
    return { legal: false, reason: "no_whispers_left" };
  }
  if (targetSeatId === actorSeatId || !run.seatIds.includes(targetSeatId)) {
    return { legal: false, reason: "invalid_target" };
  }
  if (findOwnCard(attempt.camp, actorSeatId, cardId) === null) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  return { legal: true };
}

/** Applies a legal Whisper: computes the audience BEFORE appending anything,
 * then appends the Reveal and the public LogEntry immutably, and lets the
 * camp's modifiers react to it. A washed whisper appends only its log
 * entry. Never mutates `run`. */
export function applyWhisper(
  run: RunState,
  actorSeatId: string,
  action: { readonly targetSeatId: string; readonly cardId: string },
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  const legality = whisperLegality(run, actorSeatId, action.targetSeatId, action.cardId, catalog);
  if (!legality.legal) {
    return { ok: false, error: legality.reason };
  }

  const rules = rulesFor(run, catalog);
  const attempt = attemptOf(run)!; // legality already proved there is one
  const ordinal = crewWhispers(run);
  const sent = { type: "whisper-sent", ordinal, fromSeatId: actorSeatId, toSeatId: action.targetSeatId } as const;

  if (ordinal < rules.washedWhispers(run)) {
    const washed: LogEntry = { event: "whisper-washed", actorSeatId, subjectSeatIds: [action.targetSeatId], sourceId: null, audience: "public" };
    return { ok: true, state: react(withAttempt(run, { ...attempt, log: [...attempt.log, washed] }) as RunAt<"camp">, [sent], catalog) };
  }

  const audience = rules.whisperAudience(run, actorSeatId, action.targetSeatId);
  if (audience.length === 0 || audience.some((seatId) => !run.seatIds.includes(seatId))) {
    throw new Error("whisper: whisperAudience returned an empty or invalid audience");
  }

  const reveal: Reveal = {
    cardId: action.cardId,
    fromSeatId: actorSeatId,
    audience,
    source: "whisper",
    targetSeatId: action.targetSeatId,
  };
  const logEntry: LogEntry = {
    event: "whisper",
    actorSeatId,
    subjectSeatIds: [action.targetSeatId],
    sourceId: null,
    audience: "public",
  };

  const whispered = withAttempt(run, { ...attempt, reveals: [...attempt.reveals, reveal], log: [...attempt.log, logEntry] }) as RunAt<"camp">;
  return { ok: true, state: react(whispered, [sent], catalog) };
}
