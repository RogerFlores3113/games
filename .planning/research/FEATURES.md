# Feature Research

**Domain:** Digital co-op trick-taking (The Crew-like) + roguelite run structure + Hearthstone-style board interactables + hidden-info group notifications
**Researched:** 2026-09-22
**Confidence:** MEDIUM (trick-taking UX conventions are HIGH confidence, well-documented and consistent with the existing Hanabi codebase's own patterns; roguelite pacing/identity findings are MEDIUM, synthesized from multiple community/design sources rather than a single primary spec; board-interactable and hidden-info-notification findings are MEDIUM/LOW — thinner primary-source coverage, but the spec already answers most of the hidden-info question itself)

## Context

The Expedition design spec (`docs/superpowers/specs/2026-09-22-expedition-design.md`) is fixed and owner-approved. This research does not reopen design decisions — it checks the spec against what players of comparable games expect, and flags gaps for requirements-writing, not redesign.

Notably, the spec already resolves several of the questions below in the "right" direction: the Whisper's audience model (§6.4, "everyone sees that you whispered to that teammate," only the target sees the card) already matches the correct hidden-info-notification pattern found in research. The gaps below are mostly about *screen real estate and feedback the spec doesn't explicitly mention*, not missing mechanics.

## Feature Landscape

### Table Stakes (Users Expect These)

Features players of The Crew / BGA-style trick-takers will assume exist. Missing these makes the trick-taking core feel broken or amateurish, independent of the roguelite wrapper.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Legal-play highlighting/graying | Every digital trick-taker (BGA's The Crew, Trickster Cards, physical-deck apps) dims or blocks illegal plays so a follow-suit violation is caught before commit, not after. Hanabi already does this for legal actions | LOW | Expedition's `legalPlays(state, seat)` hook (§6.1) already returns this; UI just needs to render disabled/dimmed cards, same pattern as Hanabi's play/discard buttons |
| Who-led / trick-in-progress indicator | Players need to see which suit was led and who led it to reason about their own legal plays and teammates' signals, especially with only 1 Whisper/camp as communication | LOW | Camp scene table layout (Layout B, §7.2) naturally shows this if the led card is visually distinct (position/highlight) in the trick area; needs explicit mention in scene-model requirements — spec doesn't call it out |
| Last-trick / trick-history review | Standard in BGA's The Crew and virtually every digital trick-taker — players who look away or get distracted mid-trick need to confirm what just happened before the next trick starts, especially in a co-op game where mis-remembering who won costs the whole team | LOW–MEDIUM | **Not mentioned in the spec.** Needs at minimum a "last completed trick" glance (who led, what was played, who won); full multi-trick history is a stretch differentiator, not required for MVP |
| Round/camp result feedback | Players need unambiguous confirmation of camp success/failure and *why* (which objective failed, whose card, what condition) — this is what makes failure feel fair rather than arbitrary, doubly important in a game with server-authoritative "failure the moment an objective becomes impossible" (§3) | LOW–MEDIUM | Spec's `checkGameEnd`/failure detection (§3, §6.6) is authoritative but the *display* of "why it failed" isn't spelled out — the reveal/log mechanism (§6.3 `log(event, audience)`) supports this; needs an explicit "camp failed because X" UI moment before the replay/fireside transition |
| Objective visibility/tracking during play | Objectives sit in front of each seat with order badges (§5.3/§7.2) — players expect to see, at a glance, status of every objective (pending/done/failed) throughout the trick, not just at camp end | LOW | Already specced (§7.2 objectives in front of each seat); worth confirming per-objective status (pending/done/failed) is always visible, not just on hover |
| No-undo on played cards | Standard trick-taking convention (physical and digital): once a card hits the table it is committed — undo would let a player "take back" information already leaked to teammates via play order, which breaks the core hidden-info contract in exactly the way Hanabi's engine already guards against for actions generally | LOW | Consistent with the existing project convention (Hanabi actions apply exactly once, no undo) — carries over for free, but should be an explicit requirement so nobody proposes a "take back my play" affordance later |
| Turn/timing-window clarity ("whose turn is it, what can they do right now") | With four distinct timing windows (`pre-deal`, `objective-pick`, `between-tricks`, `passive`, §4.4) plus normal trick-taking turns, players need one unambiguous "what's happening now and what can I do" signal — more complex than a standard trick-taker because of the extra windows | MEDIUM | This is genuinely harder than a stock trick-taking UI because of the window system; flag as its own scene-model requirement, not an incidental part of "camp scene" |
| Reconnect/resume mid-camp | Already a project-wide requirement (inherited, §1 "non-negotiables") | Already built (Phase 5, Hanabi) | Expedition's `applyAction` idempotency and server-authoritative state reuse the same pattern; explicitly called out in spec §8 (e2e: "refresh mid-camp and resume") |

### Differentiators (Competitive Advantage)

Features that set Expedition apart from a stock trick-taker or a stock roguelite, aligned with the "identity built from gear" and "world is the interface" core value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Public loadouts as visible identity | Standard roguelite deckbuilders (Monster Train, Slay the Spire co-op) show build identity through visible relics/decks; Expedition's public loadouts (§4.2) do this for a co-op *trick-taker*, which is unusual in the genre — most trick-takers have zero build variety. This is the game's headline differentiator | Already specced | Confirm the fireside/camp scene actually surfaces *other players'* loadouts prominently, not just your own — identity only "reads" if teammates can see it during play, per research on Monster Train/Slay the Spire build legibility |
| Boss twists as pacing/variety spikes | Comparable to roguelite "elite" or "modifier" encounters (Slay the Spire's elites, Monster Train's champions) — a rules-modifying spike every few rounds keeps pacing from feeling like "the same trick-taking round six times" | Already specced (§5.3, provisional content) | Design research confirms twist-based pacing is a proven genre pattern; the spec's honest self-critique ("too close to The Crew") is correct scoping — twist *count and cadence* (1 boss every ~2-3 camps) matches genre norms well |
| Interactables (campfire, fireflies, lantern, mascot) | Direct analogue to Hearthstone's board interactables: give players something to do/notice during downtime (waiting for other players' turns, between-tricks windows) without affecting state. Hearthstone's own postmortems confirm this exists specifically to fill "your opponent's turn" idle time with delight, not mechanical depth | Already specced (§5.4), LOW complexity per item since they never touch server state | Genre research suggests 3-5 interactables is the sweet spot for a single scene before they read as clutter rather than charm; spec's four (campfire, fireflies, lantern, mascot) is right-sized — do not scope-creep this list |
| Whisper "everyone sees you whispered, only target sees the card" | This is the correct pattern for hidden-info notification in a group co-op setting — it lets the table reason about "someone whispered to Alex" as *public* information (which is itself strategically meaningful, e.g. "no more Whispers available this camp") while protecting the content. This is more sophisticated than most physical trick-takers' communication rules (The Crew's physical Communicator token is a public "high/low/only" reveal — Expedition's is stricter, arbitrary-card-to-one-person) | Already specced (§3, §6.4) | This *is* the answer to the "how to communicate hidden-info actions to a group" question — flag as differentiator worth calling out explicitly in requirements as "notify-of-action without leaking content," since it's easy to under-scope in implementation (e.g. accidentally showing a toast with the card value to everyone) |
| Run failure that replays rather than ends | Genre research on roguelike run-failure feedback confirms the biggest driver of player frustration is not understanding *why* they lost or feeling a loss was unrecoverable; Expedition's "failed camp costs 1 supply, camp is replayed with fresh deal" (§4.1) is gentler than typical permadeath roguelites and fits a co-op friend-group session (nobody wants a 40-minute run to end at minute 12 over one bad trick) | Already specced | Good fit for the audience; the requirement to write is really about *failure explanation* (see table stakes row above), not the replay mechanic itself, which is already correct |

### Anti-Features (Commonly Requested, Often Problematic)

Things this genre's fans sometimes want that would work against Expedition's specific constraints (server-authoritative, no chat, friend-group scale, one-file-extensible engine).

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Auto-play / pre-select next card while waiting (BGA's The Crew feature) | Speeds up play, reduces waiting between turns — genuinely popular on BGA | Conflicts with the Whisper's `between-tricks` timing window and gear activation windows (§4.4): if a card auto-plays the instant it's your turn, players lose the chance to use `between-tricks` gear or receive a Whisper before their play commits. It also risks a player's careful selection reacting to information (a Whisper, a gear use) that arrives moments before their actual turn | Keep it strictly manual for v1: a player must explicitly confirm their play once the window opens. Revisit later only as an *opt-in* "confirm queued play instantly" convenience once the window-timing model is proven not to be violated by it |
| Extensive run statistics / per-card win-rate analytics (common in Slay the Spire-likes) | Roguelite players are used to meta-progression screens showing card/build performance across runs | Directly conflicts with the spec's explicit v1 scope: "Anything persisting across runs except the room's best-run record (no meta-unlocks)" (§2) — this is a designed boundary, not an oversight | Room's best-run record (furthest camp, supplies left) is the correct, already-specced scope; do not add per-gear win-rate tracking in v1 |
| In-game chat/voice annotations layered on the Whisper | Players used to Discord-adjacent games may want to type a note alongside a Whisper ("this is my only red") | Directly conflicts with the project's standing anti-feature (no in-app chat) and the design's explicit premise that "table talk about hands is banned; everything that crosses the table goes through the game" (§1) — free-text would let players route around the Whisper's structured, server-verified nature | None needed — players are already on a voice call for genuinely game-external chatter; in-game communication stays structured (Whisper, gear) |
| Full replay/spectator mode for completed runs | Roguelite/deckbuilder genre convention (watch back your run) | Explicit project-wide out-of-scope item ("Spectators, replays, and saved game history — not asked for") carried over from Hanabi's PROJECT.md; adding it for Expedition specifically would be scope creep against a standing decision | Last-trick review (table stakes, above) covers the *in-camp* need; no full run replay |
| Undo / take-back on gear use or Whisper | Roguelite/card-game players sometimes expect a "misclick" safety net, especially for a targeted ability like Trained Manor's swap | Gear use and Whispers reveal information the instant they resolve (a swap, a peeked card) — an undo after the fact cannot un-reveal what a teammate already saw, and silently "faking" an undo (rolling back state but not memory) creates exactly the kind of inconsistency-between-players bug class Hanabi's leak-testing was built to prevent | Rely on `canUse`'s pre-action validation (§6.2, "returns true or a reason string") and clear confirm-before-commit UI for targeted gear/Whisper, rather than post-hoc undo |
| Elaborate secret/Easter-egg board interactions (Hearthstone's hidden multi-step board secrets) | Hearthstone's most beloved board interactions are the ones requiring specific sequences that took the community weeks to discover | High art/design effort for a four-person friend audience that will find any secret within one game night — payoff-to-effort ratio is poor at this project's scale, and it competes for art-pipeline time against the core gear/objective/boss content that actually needs polish first | Keep interactables simple, one-click, immediately delightful (spec's four items are already right-sized); do not invest in multi-step discoverable secrets |

## Feature Dependencies

```
Legal-play highlighting
    └──requires──> legalPlays(state, seat) hook (already specced, §6.1)

Who-led / trick-in-progress indicator
    └──requires──> Camp scene trick area (already specced, §7.2)
    └──enhances──> Legal-play highlighting (players reason about follow-suit against the led card)

Last-trick review
    └──requires──> Server retains last-completed-trick data in view (log/reveal mechanism, §6.3)
    └──enhances──> Camp/failure-result feedback (players can check what happened before a failure explanation lands)

Camp failure "why" feedback
    └──requires──> log(event, audience) toolkit primitive (already specced, §6.3)
    └──requires──> checkGameEnd / failure-check hooks (already specced, §6.1 failureChecks)

Timing-window clarity (whose turn, what window is open)
    └──requires──> buildSceneModel per phase (already specced, §7.1, §8 scene model unit tests)
    └──enhances──> Whisper UX and gear-use UX (both depend on a legible between-tricks window)

Public loadouts as identity
    └──requires──> Draft + loadout system (already specced, §4.2)
    └──requires──> Camp/fireside scene surfacing other players' gear, not just your own

Whisper "notify without leak"
    └──requires──> reveal(card, audience) toolkit primitive (already specced, §6.3, §6.4)
    └──conflicts with──> Auto-play/pre-select next card (anti-feature; timing-window race)
```

### Dependency Notes

- **Last-trick review requires server-side trick log with an audience:** unlike Hanabi's public discard pile (visible to all by design), Expedition's completed-trick log is fully public (no hidden info in a trick once resolved), so this is simpler than it sounds — it's a display feature over already-public data, not a new hidden-info concern. Flag as low-risk, moderate-value addition to requirements.
- **Timing-window clarity enhances both Whisper and gear UX:** the spec's four windows (§4.4) are more complex than a standard trick-taker's simple turn order. If the "what can I do right now" signal is weak, both the Whisper and gear-use features will feel confusing even though each is individually well-specced. This is the single biggest UX risk area distinct from the core trick-taking loop.
- **Auto-play conflicts with timing windows:** this is why BGA's own convention (which players will bring as an expectation from The Crew) should be explicitly excluded rather than silently omitted — a requirements reviewer familiar with BGA might otherwise assume it's wanted.

## MVP Definition

### Launch With (v1)

Minimum viable product for the trick-taking + roguelite core to not feel broken or confusing, on top of what the spec already commits to.

- [ ] Legal-play highlighting/graying on the hand — table stakes, trivial given `legalPlays` hook already exists
- [ ] Who-led / led-suit indicator in the trick area — table stakes, prevents illegal-play confusion and supports Whisper reasoning
- [ ] Last-completed-trick glance (who led, cards played, who won) — table stakes; not in the spec, should be added to requirements as a small addition
- [ ] Camp failure "why" feedback (which objective, whose card, what condition) before the replay/fireside transition — table stakes; the mechanism exists (§6.3 log/reveal), the display moment needs to be an explicit requirement
- [ ] Per-objective status (pending/done/failed) always visible during play, not just hover — table stakes given the spec's objective-badge UI
- [ ] Explicit "what window is open / what can I do" signal distinct from whose-turn-to-play — MEDIUM complexity, genuinely required given four timing windows
- [ ] Whisper notification pattern exactly as specced (public "whispered to X," private card) — already specced, just confirm it's enforced at the view-schema level like Hanabi's redaction
- [ ] Public loadouts visibly surfaced for all players during camp and fireside, not just the owner — already specced structurally, needs explicit "visible to whom, where" requirement

### Add After Validation (v1.x)

- [ ] Fuller trick history (not just last trick — e.g. scroll back through the camp) — add if playtesting shows players losing track across a whole camp, not just one trick
- [ ] "Confirm queued play instantly" auto-play convenience — only after confirming the window-timing model handles it without races; explicitly deferred, not core MVP
- [ ] Extra interactable variety or secret-style Easter eggs — only after the core four are proven not to be ignored/unnoticed in playtesting

### Future Consideration (v2+)

- [ ] Per-gear/per-objective run statistics — explicitly out of scope per spec (§2); would require a meta-progression rethink the owner hasn't asked for
- [ ] Run replay/spectator mode — explicit project-wide anti-feature; revisit only if directly requested

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Legal-play highlighting | HIGH | LOW | P1 |
| Who-led indicator | HIGH | LOW | P1 |
| Last-trick review | MEDIUM | LOW-MEDIUM | P1 |
| Camp failure "why" feedback | HIGH | LOW-MEDIUM | P1 |
| Objective status always visible | HIGH | LOW | P1 |
| Timing-window clarity | HIGH | MEDIUM | P1 |
| Whisper notify-without-leak enforcement | HIGH | LOW (mechanism specced) | P1 |
| Public loadout visibility (others', not just own) | HIGH (differentiator) | LOW-MEDIUM | P1 |
| Interactables (4 specced) | MEDIUM (delight) | LOW each | P2 |
| Boss twist variety/pacing | MEDIUM | Already specced | P2 (content, not engine) |
| Fuller multi-trick history | LOW-MEDIUM | MEDIUM | P3 |
| Auto-play convenience | LOW (nice-to-have, risky) | MEDIUM | P3, deferred |
| Run statistics/analytics | LOW (explicitly excluded) | MEDIUM-HIGH | Not in scope |
| Run replay/spectator | LOW (explicitly excluded) | HIGH | Not in scope |

## Sources

- [Board Game Arena — The Crew game panel](https://en.boardgamearena.com/gamepanel?game=thecrew) — confirms BGA's pre-select/auto-play-on-turn convention. MEDIUM confidence (WebSearch synthesis, not directly fetched).
- [Board Game Arena — The Crew: Mission Deep Sea](https://en.boardgamearena.com/gamepanel?game=thecrewdeepsea)
- [The Crew (card game) — Wikipedia](https://en.wikipedia.org/wiki/The_Crew_(card_game))
- [The Crew: The Quest for Planet Nine — BoardGameGeek](https://boardgamegeek.com/boardgame/284083/the-crew-the-quest-for-planet-nine) — confirms physical Communicator token mechanic (once/mission, high/low/only-card reveal, public information) as point of comparison for Expedition's stricter Whisper. MEDIUM confidence.
- [Official The Crew: The Quest for Planet Nine Rules](https://officialgamerules.org/game-rules/the-crew-the-quest-for-the-planet-nine/)
- [Commander token and communications satellite replacement — BGG thread](https://boardgamegeek.com/thread/2619643/commander-token-and-communications-satellite-repla)
- [Slay the Spire 2 Co-op Guide — sts2front](https://sts2front.com/tips/co-op-guide/) — co-op deckbuilder pacing/scaling patterns, shared map/individual decks convention. MEDIUM confidence.
- [Steam Workshop — Together in Spire (multiplayer mod)](https://steamcommunity.com/sharedfiles/filedetails/?id=2384072973)
- [Hearthstone Hypothesis — Why do the Game Board Interactions Exist? — Out of Games](https://outof.games/news/341-hearthstone-hypothesis-why-do-the-game-board-interactions-exist/) — origin and purpose of Hearthstone board interactables (idle-time delight, not mechanical depth). MEDIUM confidence.
- [Design and development of Hearthstone — Hearthstone Wiki](https://hearthstone.fandom.com/wiki/Design_and_development_of_Hearthstone)
- [Reworking progression in our roguelike deckbuilder — itch.io devlog](https://itch.io/t/6278140/reworking-progression-in-our-roguelike-deckbuilder-looking-for-feedback) — run-failure feedback and player frustration patterns. LOW-MEDIUM confidence (community devlog, not a primary design text).
- [Tackling deckbuilding and roguelite design in Abrakam's Roguebook — Game Developer](https://www.gamedeveloper.com/design/tackling-deckbuilding-design-in-abrakam-s-roguebook) — build-identity-through-visible-choices patterns, comparable to Monster Train's clan pairing system. MEDIUM confidence.
- `docs/superpowers/specs/2026-09-22-expedition-design.md` — primary source for what is already specced vs. genuinely missing; all "already specced" callouts verified directly against this file.
- `.planning/PROJECT.md` — source for standing project-wide anti-features (no chat, no spectators/replays, no accounts) that also apply to Expedition.

---
*Feature research for: Expedition (co-op roguelite trick-taker), milestone v2.0*
*Researched: 2026-09-22*
