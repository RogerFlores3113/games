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
// against the RunState as it stood BEFORE this whisper is recorded. Signal
// Flare's D-08 effect hook reads "have I whispered yet this camp" via
// whispersUsedBy, and that count must reflect prior whispers only, never the
// one currently being applied — so audience is always computed first, and
// the log/reveal append happens only after.
//
// whispersUsedBy is DERIVED from the attempt's log (no counter field is ever
// stored — matches types.ts's own "derive, don't cache" discipline): it is
// the count of "whisper" log entries whose actorSeatId is the seat in
// question.
//
// Monsoon, Rain Poncho, Whistle and Flare (the gear/boss content that
// modifies whisper legality/audience/count) act ONLY through the composed
// RunHooks (whisperAllowed/whisperAudience/whispersPerCamp) — this file
// never names any of them.

import { findOwnCard } from "../legality";
import { currentWindow } from "./windows";
import { rulesFor } from "./compose";
import type { Catalog, LogEntry, Reveal, RunError, RunState } from "./types";
import type { AdapterResult } from "../../adapter";

/** COMM-01/COMM-02: the count of this attempt's "whisper" log entries whose
 * actorSeatId is `seatId`. Returns 0 with no attempt in progress — there is
 * nothing to derive from. */
export function whispersUsedBy(run: RunState, seatId: string): number {
  if (run.attempt === null) return 0;
  return run.attempt.log.filter((entry) => entry.event === "whisper" && entry.actorSeatId === seatId).length;
}

/** Guard order (COMM-01): wrong_phase (no attempt, or the camp hasn't been
 * dealt yet) -> wrong_window (must be between tricks, D-13: no grace period)
 * -> whisper_blocked (a boss/gear layer forbids it) -> no_whispers_left
 * (per-camp cap, composed) -> invalid_target (self or a non-seat) ->
 * card_not_in_hand (own-hand-only, T-10-20). */
export function whisperLegality(
  run: RunState,
  actorSeatId: string,
  targetSeatId: string,
  cardId: string,
  catalog: Catalog,
): { legal: true } | { legal: false; reason: RunError } {
  if (run.attempt === null || run.attempt.camp === null) {
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
  if (findOwnCard(run.attempt.camp, actorSeatId, cardId) === null) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  return { legal: true };
}

/** Applies a legal Whisper: computes the audience BEFORE appending anything
 * (Signal Flare's D-08 hook relies on this ordering), then appends the
 * Reveal and the public LogEntry immutably. Never mutates `run`. */
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
  const audience = rules.whisperAudience(run, actorSeatId, action.targetSeatId);
  if (audience.length === 0 || audience.some((seatId) => !run.seatIds.includes(seatId))) {
    throw new Error("whisper: whisperAudience returned an empty or invalid audience");
  }

  const attempt = run.attempt!; // legality already proved attempt !== null

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
    gearId: null,
    audience: "public",
  };

  return {
    ok: true,
    state: {
      ...run,
      attempt: {
        ...attempt,
        reveals: [...attempt.reveals, reveal],
        log: [...attempt.log, logEntry],
      },
    },
  };
}
