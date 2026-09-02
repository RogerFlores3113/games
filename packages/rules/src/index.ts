// Framework-free package: the game-adapter interface and game rules engines.
// Deliberately declares ZERO dependencies (not even @games/schema) so it builds
// and tests in complete isolation, per FDN-02.
// This file currently only carries the Wave 0 monorepo-resolution smoke sentinel.
// The applyAction/toPlayerView/checkGameEnd adapter contract and the D-15 counter
// game land in later plans of this phase.

export const RULES_SMOKE = "rules-smoke-ok";
