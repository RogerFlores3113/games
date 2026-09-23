/**
 * The landing form always renders every game's create-time settings panel
 * (hidden by CSS until that game is picked, so it works pre-hydration).
 * Hidden controls are still submitted, so each game's config controls use a
 * name namespaced by gameId. Only the selected game's field is read, which
 * means one game's panel can never supply config for another, and two games'
 * radios can never join the same radio group.
 */
export function configFieldName(gameId: string): string {
  return `config.${gameId}`;
}

/** Reads the create-room request fields out of the landing form's
 * `FormData`, used by both the JS path (`LandingForm`) and the native
 * form POST (`/api/room`). Returns raw, unvalidated values; callers must
 * still run `CreateRoomRequestSchema`. */
export function readCreateRoomForm(formData: FormData): {
  gameId: unknown;
  displayName: unknown;
  config: unknown;
} {
  const selectedGame = formData.get("gameId") ?? undefined;
  const config =
    typeof selectedGame === "string" ? (formData.get(configFieldName(selectedGame)) ?? undefined) : undefined;
  return {
    gameId: selectedGame,
    displayName: formData.get("displayName") ?? undefined,
    config,
  };
}
