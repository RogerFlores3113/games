# Phase 10: Run Layer, Gear Engine & Bosses - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The full six-camp Expedition run as a pure rules layer in `packages/rules/src/expedition/`, built on the Phase 9 Core:

- supplies, fail-then-replay, and camp-number capacity
- the draft and loadouts
- the layered rule-hook composition (base → boss twist → gear), plus the toolkit and reveals
- the v1 gear catalogue (10 items), the 4 provisional boss twists, and the Whisper
- catalogue contract tests
- deterministic replay from the seed and action log

Requirements: COMM-01, COMM-02, RUN-01..07, GEAR-01..06, BOSS-01, ENG-01, ENG-02.

Out of this phase:
- `GameAdapter` registration, `toPlayerView`, zod schemas, worker wiring and the leak checker. Phase 11 owns these.
- Any Phaser or scene work. Phase 12+.
- GEAR-05 (confirm step) and GEAR-06 (visible reason) are UI-facing. This phase delivers only the engine side: final-once-resolved actions, and `canUse` returning a reason string.

</domain>

<decisions>
## Implementation Decisions

### Replay & boss rules
- **D-01:** After a failed camp, the crew returns to the fireside before the replay. Players may re-pack their loadout within the same capacity; capacity stays the camp number, so failing never makes anyone stronger. Nobody drafts, because drafting happens only after a *cleared* camp.
- **D-02:** A failed boss camp keeps the same boss twist on replay. The twist is fixed per boss camp, not per attempt.
- **D-03:** Camp 6's twist is drawn from the boss pool minus camp 3's twist, so a run never repeats a boss twist.
- **D-04:** Rain Poncho cancels the twist for that attempt only. Used flags reset on replay (RUN-06), so the twist returns on a replay unless someone uses Poncho again.

### Draft & gear ownership
- **D-05:** Different players may own the same gear. Offers exclude only gear the *offered player* already owns (spec §4.2 as written).
- **D-06:** Arriving at the fireside, a player's loadout defaults to their last loadout. New capacity is empty space they can fill. This applies after a cleared camp and before a replay.
- **D-07:** The next camp, or a replay, starts only when every player is Ready, with their draft picked if a draft is due. A disconnected player pauses the table in place until they reconnect, the same as Hanabi's pause. There is no host force-start.

### Gear edge-case rulings
- **D-08:** Signal Flare (`broadcast`) must be armed *before* whispering. It is unusable once you have whispered this camp (`canUse` returns a reason). An armed Flare widens the audience of your **next** Whisper only, then it is spent. A second Whisper from Signal Whistle is private unless broadcast again.
- **D-09:** Machete (`commandeer`) is usable in **any** between-tricks window, including before trick 1, where it takes the first lead from the expedition leader. Objective picking happens before that window opens, so the expedition leader still picks the first objective.
- **D-10:** Trail Map (`reassign`) always swaps between **the user and one chosen teammate**. Its targets become a single `teammate` target rather than the spec's `player-pair`. Only unresolved objectives move; completed ones stay.
- **D-11:** Camouflage (`ghost`):
  - The dropped objective is **removed from play**: it no longer needs completing and cannot fail the camp.
  - Camouflage stays unusable once you have won a trick this camp (spec guard kept).
  - Its "win any trick → camp fails" check is stated over the whole camp, which the guard makes equivalent to "from activation onward". This was the owner's clarification, option 2.

### Window waiting & pacing
- **D-12:** In the pre-deal window, the deal waits for each player with pre-deal gear equipped to use it or skip it. Players without pre-deal gear are never blocked.
- **D-13:** Between tricks there is no wait and no grace period. The window closes the moment the trick's leader plays, and actions are serialised in arrival order (spec §4.4).
- **D-14:** For camp 5's trick-count objective, the seeded RNG chooses between no-tricks and exactly-N. For exactly-N, N is drawn from a range in the balance table, so it can be tuned without code changes.
- **D-15:** The trick-count objective is a normal face-up objective in the pool, taken in the clockwise pick order. This matches Phase 9's A-TRICKCOUNT: N comes from the `ObjectiveSlot` input, supplied by the balance table.

### Claude's Discretion
- **Hook-robustness debt carried from Phase 9** (`09-VERIFICATION.md` deferred items, `09-REVIEW.md`):
  - WR-03: the `isTrump` hook is never called. Route the joker checks through it as part of hook composition.
  - WR-05: validate the `trickWinner` hook's result.
  - WR-06: a bad `nextLeader` result currently leaves the camp stuck, which must end. Pick one policy for rule-hook failures. Also skip `nextLeader` after the final trick.
  - All three must be resolved here, since this phase introduces the layered overrides that make them reachable.
- The shape of the hook-composition API (each layer receives the previous layer's answer, per spec §6.1), the toolkit's internal structure, and the balance-table format.
- How reveals are stored: a list of reveals with audiences, cleared at camp end or replay.
- Spyglass and Trained Monkey randomness: draw from the carried seeded RNG only, never `Math.random()`.
- Energy Tonic stacking: capacity +2 and +1 failure cost per equipped Tonic (spec §5.1). Duplicate ownership across players is allowed (D-05), so several Tonics can be equipped at once.
- Thick Fog: face-down random assignment of objectives. Choose the distribution rule for fewer objectives than players.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Game design (owner-approved)
- `docs/superpowers/specs/2026-09-22-expedition-design.md`:
  - §3: round rules, including the Whisper
  - §4: the run (supplies, replay, capacity, draft, loadout, camp ramp, timing windows)
  - §5: gear, objective kinds and boss twists (boss twists are provisional)
  - §6: engine architecture (rule-hook layers, `GearDef` and targets, toolkit, reveals, randomness, adapter shape)
  - §8: testing, including the catalogue contract tests
- The decisions D-01..D-15 above override the spec wherever they are more specific: Flare scope, Machete before trick 1, Trail Map targets, Camouflage.

### Requirements
- `.planning/REQUIREMENTS.md`: COMM-01, COMM-02, RUN-01..07, GEAR-01..06, BOSS-01, ENG-01, ENG-02
- `.planning/ROADMAP.md`: the Phase 10 success criteria, 1–5

### Phase 9 foundation (what this phase extends)
- `.planning/phases/09-expedition-rules-core/09-VERIFICATION.md`: the passed verification, plus the deferred WR-03/WR-05/WR-06 that this phase must close
- `.planning/phases/09-expedition-rules-core/09-REVIEW.md`: details of the hook-robustness findings, and the open IN-* items
- `.planning/phases/09-expedition-rules-core/09-RESEARCH.md`: Core architecture and the labeled assumptions (A-HOLDER, A-TIE, A-TRICKCOUNT, A-MULTI, A-LAST, A-END)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/rules/src/expedition/rules.ts`: the `CoreRules` hook type and `baseRules`, with 7 hooks (deckFor, leaderFor, isTrump, trickWinner, legalPlays, nextLeader, failureChecks). The layered composition and the new hooks (whisper*, objectiveAssignment, capacity, failureCost) extend this.
- `packages/rules/src/expedition/camp.ts`:
  - `createCamp(seatIds, seed, objectiveSlots, rules)` becomes the per-attempt camp builder under the run layer.
  - `ObjectiveSlot` is how the balance table injects objective kinds and N.
- `packages/rules/src/expedition/actions.ts`: `applyCampAction` handles pick-objective and play-card. Whisper and use-gear join here or in a run-level dispatcher.
- `packages/rules/src/expedition/objectives.ts`: the `OBJECTIVE_KINDS` registry. It is monotone after 09-07, and it is the pattern for the gear and boss registries.
- `packages/rules/src/expedition/test-support.ts`: `driveCamp` and `enumerateLegalActions` (built from legality checks only). Extend them for whole-run simulation.
- `packages/rules/src/shuffle.ts`: the seeded sfc32/cyrb128 PRNG with stream names. The run carries this generator (spec §6.5, RUN-07).
- `packages/rules/src/adapter.ts`: the generic `AdapterResult<TState, TError>` type.

### Established Patterns
- State is derived, not cached. Status and phase are recomputed from state, following Hanabi's `endgame.ts`.
- Transitions are pure and never mutate. Illegal actions return an error and change nothing.
- Legality checks run in a fixed guard order, and card lookups are restricted to the actor's own hand.
- `purity.test.ts` scans the whole `expedition/` directory, so new files are covered automatically.
- Every core function takes `rules: CoreRules = baseRules` as its last parameter.

### Integration Points
- The run layer wraps `CampState` in a run state holding: camp number, supplies, owned and equipped gear, draft offers, the boss twist per boss camp, reveals, RNG state and phase.
- Phase 11 wraps the run state in a `GameAdapter`. Keep everything this phase adds framework-free and view-agnostic, with no `toPlayerView` here.

</code_context>

<specifics>
## Specific Ideas

- The owner wants content to be easy to extend: new gear, objective kinds, boss twists and interactables should each be one file plus one registry line, with automatic contract tests (ENG-01, ENG-02).
- The four boss twists are explicitly **provisional placeholders**, because they are too close to The Crew. Build the boss system so replacing them touches only catalogue files.

</specifics>

<deferred>
## Deferred Ideas

None came up in this discussion. Already deferred at milestone scoping: the best-run record, a "why we failed" moment, a "what can I do now" window signal, and multi-trick history (see the spec §10 and REQUIREMENTS.md Future Requirements).

</deferred>

---

*Phase: 10-run-layer-gear-engine-bosses*
*Context gathered: 2026-09-26*
