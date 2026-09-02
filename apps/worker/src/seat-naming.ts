// D-09: duplicate display names are auto-suffixed on join ("Roger" ->
// "Roger (2)"). This is purely a display concern — seats are identified
// internally by a stable identifier (ROOM-03's actual identity requirement),
// never by this label. This module knows nothing about the room beyond the
// list of labels already in use — no identifiers, no credentials, no
// lifecycle state — it only derives a collision-free label from a requested
// name and that list.

/**
 * Derives a collision-free display label for a newly requested name.
 *
 * Comparison is case-insensitive (so "roger" collides with "Roger"), but
 * the returned label always preserves the caller's own casing — the point
 * of the suffix is that two voice-call participants can tell their seats
 * apart on screen, not that names get normalized.
 *
 * The probe is bounded: `MAX_PLAYERS` (5) means at most a handful of
 * iterations, so a simple linear search from 2 upward provably terminates.
 */
export function deriveDisplayLabel(
  requestedName: string,
  existingLabels: readonly string[],
): string {
  const trimmed = requestedName.trim();
  const existingLower = existingLabels.map((label) => label.toLowerCase());

  if (!existingLower.includes(trimmed.toLowerCase())) {
    return trimmed;
  }

  let suffix = 2;
  for (;;) {
    const candidate = `${trimmed} (${suffix})`;
    if (!existingLower.includes(candidate.toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }
}
