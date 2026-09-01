# Feature Research

**Domain:** Online multiplayer Hanabi (private, link-based, no-accounts) — cooperative hidden-information card game
**Researched:** 2026-09-01
**Confidence:** MEDIUM-HIGH (hanab.live behavior verified via its own docs/GitHub; BGA behavior verified via community write-ups and BGA's own docs; physical-game accessibility analysis verified via a dedicated teardown; some hanab.live internals — exact disconnect/idle-kick timers, exact mobile CSS behavior — could not be confirmed from public docs and are flagged LOW confidence)

## Research Basis

Primary sources actually consulted (not assumed):
- **hanab.live** (Hanabi-Live project) — `docs/features.md` and `docs/rules.md` from the GitHub repo, which document the UI's clue-arrow system, card note system, color-blind mode, replay/spectator tooling, and the deck-empty final-round rule.
- **Board Game Arena's Hanabi** — a detailed community comparison (Zamiell's hanabi-conventions BGA.md) written specifically to catalogue what BGA's implementation gets wrong relative to hanab.live, plus BGA's own tips/help pages (which notably contain zero UI/accessibility documentation — itself a finding).
- **Meeple Like Us "Hanabi (2010) — Accessibility Teardown"** — an accessibility-focused review of the physical game that directly addresses the core question "what does it mean to give a colour clue when a player is colour-blind?" and concludes the base physical game fails colorblind players (grade D), which is the exact failure mode a digital implementation must not repeat.

This is a small, well-understood genre (essentially one dominant open-source reference implementation, one dominant commercial-but-mediocre implementation, and a handful of minor clones). The feature landscape is narrow and largely settled — the interesting research finding is less "what features exist" and more "which features hanab.live has that BGA conspicuously lacks, and why those specific gaps are the ones that hurt."

## Feature Landscape

### Table Stakes (Users Expect These)

Features a working online Hanabi is not playable without. All of these are already implied by PROJECT.md's Active requirements — this table cross-checks them against the two reference implementations and adds detail on what "done" looks like.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Always-visible game state: 8 clue tokens (count + spent/available), 3 fuse tokens (count + lost), deck count, discard pile, 5 (or 6) played stacks | Hanabi is a game entirely about shared public state; if a player has to ask "how many clues do we have," the UI has failed. Both hanab.live and BGA show all of this persistently, never behind a menu. | LOW | This is just a status bar / board render. Confirmed in hanab.live `features.md`: "play stacks are on the left... clue log top-right, statistics center-right, deck bottom-left, discard bottom-right." Fixed, glanceable positions are the standard, not a tab or drawer. |
| Whose-turn indicator | With 4-5 players and no chat, "wait, is it my turn?" is a top complaint in any turn-based web game. hanab.live bolds the active player's name; a stronger treatment (highlighted seat, active border) is even more mobile-friendly. | LOW | Table stakes; trivial to implement, high cost if missing. |
| Clue-touch highlighting on the receiving hand | When a clue is given, every card it touches (and only those cards) must be visibly marked, immediately, and persistently until the card leaves the hand or gets more information. hanab.live uses an orange border for "touched by a positive clue" plus a directional arrow with a colored circle showing which clue type/value was given. This is not cosmetic — it's the entire mechanism by which players "see" what was said. | MEDIUM | This is the single most load-bearing rendering feature in the whole app. Getting it wrong (e.g., clue flashes and disappears, or doesn't distinguish "touched" from "not touched") makes the game literally unplayable, because unlike physical Hanabi where a spoken clue plus finger-pointing is unambiguous, digital play has no other channel for "these are the ones I mean" if voice/chat commentary about clues is disallowed by convention (many groups insist on clue-only communication about hands). Persistence matters: the highlight must survive until state changes, not just flash on click. |
| Per-card accumulated clue state, shown on the card face for the CARD OWNER'S teammates and reflected back for the owner as "known info" | Everyone but the hand's owner sees the actual card; but every player (including the owner) needs to see the *history* of what's been said about a card — e.g. "this card is not red, not a 1" as negative information accumulates. hanab.live auto-narrows candidate suit/rank pips on the card as clues land, for both positive and negative information. | MEDIUM-HIGH | This is the "what do I know about my own cards" affordance, and it is genuinely table stakes, not power-user tooling — see the dedicated section below. Missing negative-clue tracking is BGA's single most criticized gap. |
| Legal-action enforcement matching real rules (clue must touch ≥1 card, must name exactly one color or one rank, touches every matching card in hand; discard/play always legal except discard disabled at 8 clue tokens) | Table stakes because Hanabi's action legality is exactly the game's rules layer; PROJECT.md already specifies this. Both reference apps enforce this server-side. | MEDIUM | Already an Active requirement. Note the "discard forbidden at 8 clues" edge case and "no clue tokens available" must gray out the clue action, not just reject on submit — reactive graying-out of illegal actions is standard UX in both apps and prevents a confusing rejected-action round-trip. |
| Correct end-of-game detection: 3 fuses, all stacks at 25, OR final round after deck empties (every player including the one who drew the last card gets exactly one more turn) | This is the rule most reimplementations get wrong (confirmed directly in hanab.live's own rules doc, which spells this out explicitly because it's a common point of confusion even among experienced players). Getting the final round wrong either cheats the team out of a turn or grants an extra one. | MEDIUM | Already Active. hanab.live rules.md: "everybody gets one more turn (including the player who drew the last card)." Also note the score-boosting edge case: completing a suit with a 5 grants a bonus clue token, UNLESS the team is already at 8, in which case it's forfeit — a small rule easy to drop. |
| End-of-game score screen with the score (0-25) and a legible band/label (e.g., "flawless," "so-so," "you have set the Hanabi world back several years" — the traditional joke bands range roughly 0 = "worst" through 25 = "legendary") | Score alone is a bare number; both real-world play and hanab.live culture treat the descriptive band as part of the payoff — it's the "did we do well?" answer for a cooperative game with no winner/loser dynamic. | LOW | Simple lookup table by score. Optional flavor text is cheap and meaningfully improves the "we just finished a game" moment for a casual friend-group product whose whole value prop is "feels good to play together." |
| Room creation → shareable link → join by display name → seat assignment → ready-up → start | This is literally the product's core value prop ("click a link and be playing in seconds"). Neither hanab.live nor BGA needs this exact flow (they have persistent accounts + a lobby browser), so this is the one area where the reference implementations are NOT the model — but every ad hoc web-game-with-a-room-code product (Codenames.game, Jackbox, Skribbl) validates this pattern as the expected UX for accountless friend-group games. | MEDIUM | Needs: room creation, link generation, name entry (with basic collision handling — two "Alex"s), a seat/ready state visible to everyone before start, and a host-initiated (or auto, once full) start. This is squarely in PROJECT.md's Active scope already. |
| Disconnect indicator + reconnect-to-same-seat | PROJECT.md already specifies this as a hard requirement, and it is genuinely non-negotiable for a 25-minute session over unreliable home wifi/phone connections. The player-facing bar here is: a departed player's seat clearly shows "disconnected" (not frozen, not a blank/broken hand), the rest of the table can keep talking/planning, and on return the player resumes with full state, no lost turn, no re-entered name. | HIGH | This is the hardest table-stakes item technically (state durability across reconnects, server-authoritative resume) but is a UX table stakes item, not a differentiator — see the disconnect section below for what "good" looks like from the player's seat. |
| Colorblind-safe suit distinction (see dedicated section) | With Rainbow in the box-variant scope, color is not optional decoration — it is the entire semantic content of half the clue actions. A colorblind player who cannot distinguish red/green (the single most common form) cannot play the base game without an accommodation. This is table stakes, not an accessibility "nice to have," because the game is mathematically about color+number. | LOW-MEDIUM | Cheap to build (suit letter/icon per card, chosen distinct from clue-button color), catastrophic to omit for a real friend group where the odds of at least one colorblind player over enough sessions are non-trivial. hanab.live ships this baseline behind a single settings toggle. |
| Mobile/touch-usable card table layout for 4-5 hands | Not explicitly in PROJECT.md's Active list as a line item, but implied by "no downloads... games are played by people already talking on a voice call" — some of those people will be on a phone. hanab.live's own UI targets drag-to-play/drag-to-discard plus a dedicated companion site (hanab.cards) built specifically because the main site's touch experience wasn't good enough for phones. | MEDIUM-HIGH | This is the most likely "looks table-stakes-adjacent, actually needs real design work" item — see mobile section below. |

### Differentiators (Meaningfully Improves Play, Not Required for MVP)

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Player-authored card notes (right-click/long-press a card in your own hand to leave a free-text or templated note) | This is hanab.live's signature feature and the single biggest gap BGA is criticized for lacking ("There is no ability to mark notes on a card... players must resort to external tools"). For casual/beginner play it's genuinely optional (players can hold state in their head or on paper next to the voice call), but for anyone playing with any convention system, or across a longer multi-round session, it becomes very valuable quickly. | MEDIUM | Verdict: differentiator, not table stakes, **for this project's stated audience** (a friend group, not a competitive convention-following community) — but it is the highest-value single differentiator to add post-MVP because it's exactly the kind of "make actual play meaningfully better" feature that separates a good implementation from a merely correct one. Auto-suggested notes matching a typed card name (hanab.live: typing "r1" renders as a red-1 icon) is a nice but skippable refinement. |
| A clue history / log (chronological list of "Alice clued Bob: red," etc.) | Useful for recalling what happened 3 turns ago without needing every card's accumulated state to carry the whole story, and useful after a rejoin so a reconnecting player can catch up beyond just the current board state. hanab.live shows this as a persistent side panel. | LOW-MEDIUM | Differentiator rather than table stakes because the persistent per-card highlighting (table stakes above) already carries the load-bearing information; the log is a memory aid, not the primary information channel. Good candidate for a v1.x add given how cheap it is once turn history exists in state anyway. |
| "Empathy view" / auto-inference of possible card identities from all public information (not just explicit clues, but what's inferable from other players' plays/discards) | This is genuinely advanced (H-Group convention tooling territory), valuable to serious players, actively unnecessary/confusing to a casual friend group. | HIGH | Explicitly defer — this borders on "playing the game for the players" and is the kind of feature that belongs, if ever, in a far-future milestone, not v1 or v1.x. |
| In-game replay / turn scrubber (within the just-finished or in-progress game) | Lets the table look back at "wait, what did that clue mean" without breaking flow via a real-time argument. hanab.live has this; BGA has it but it's specifically criticized as unpausable/unscrubbable, which is worse than not having it because it creates false expectations. | MEDIUM-HIGH | Explicitly out of scope per PROJECT.md ("replays... not asked for; revisit only if the group wants it"). Flagging it here because it's the single feature most likely to be requested by the group after a session ends in an argument about what a clue meant — worth having on the v1.x backlog rather than being surprised by the request. |
| "Fireworks night" luminosity-as-signal visual theme (cards visually brighter/more saturated as they accumulate positive information) | This is explicitly called out in PROJECT.md's Key Decisions as differentiating: "card luminosity carries real signal about what has been clued... rather than being decoration." Neither hanab.live nor BGA does this — both use flat borders/pips rather than a luminosity gradient. | MEDIUM | This is a genuine design differentiator worth the investment specifically because it doubles as a colorblind-safe redundant channel (brightness/saturation is perceivable independent of hue) — so it should be designed together with the colorblind accessibility work, not after it. |
| Sound/haptic cue for "it's your turn" or "you were clued" | Small but real quality-of-life; lets a player glance away from the tab during a slow-thinking teammate's turn (very real in Hanabi, which has long thinking pauses) and still notice their turn without staring at the screen. | LOW | Cheap add once realtime push exists. Good v1.x candidate. |

### Anti-Features (Things to Deliberately Not Build)

| Feature | Why It Seems Appealing | Why It's Actually Harmful (or Just Not Worth It) Here | Alternative |
|---------|------------------------|--------------------------------------------------------|-------------|
| In-app chat / clue-explanation text box | "Players might want to discuss strategy." | Already explicitly out of scope in PROJECT.md, and correctly so: it adds a moderation/spam-nothing-burden surface for zero benefit when the audience is already on a live voice call. Worse: an in-app text channel invites players to type out card identities in violation of Hanabi's core rule (only clues communicate hand information) — a chat box is an attractive nuisance for players to accidentally cheat by typing "my hand is..." | None needed — voice call is the channel, by design. |
| Accounts / persistent profiles / stats / ELO | "Feels more like a 'real' game platform." | Out of scope per PROJECT.md, correctly: pure friction for a known friend group, and it converts an ephemeral link-and-play app into an identity-management product with all the associated security/privacy surface (password reset, data retention, etc.) for a feature nobody asked for. | Ephemeral display names scoped to the room only. |
| Public lobby / matchmaking / spectator browsing of other tables | "More people playing = more engagement." | Explicitly out of scope; there is no "more engagement" goal here — the entire product thesis is one small group. A public lobby also reintroduces the exact abuse/moderation/bot-account surface accounts were correctly rejected to avoid. | Rooms are private-by-link only; no discovery surface at all. |
| Bot auto-play / AI takeover of a disconnected player's seat so the game "keeps going" | Superficially solves "what happens when someone drops," and hanab.live's ecosystem does have community bots (e.g., hanabi-bot) that can literally play. | For a cooperative logic game, a bot silently taking over a human's seat mid-game destroys the actual point of play (reasoning about what your specific, known teammates would do) and risks making illegal-feeling or convention-violating moves the humans then have to live with. It also masks the failure state — the group would rather know "Steve dropped, we're paused" and wait/decide than have a bot quietly finish the game for him. | Disconnect indicator + pause-in-place + reconnect-to-resume (already the Active requirement) is strictly better for this use case. |
| Full H-Group/extended variant catalogue (Pink, White, Brown, Omni, Null, Prism, Up-or-Down, Clue Starved, etc.) | "hanab.live has 50+ variants, more options = more replay value." | Explicitly out of scope, correctly — this is what makes hanab.live's rules engine as large as it is; chasing that catalogue turns "ship Hanabi" into "ship a generalized card-game rules DSL," which is a different, much larger project and directly conflicts with the "prove the foundation on one game" strategy. | Base + Rainbow + Black only, per PROJECT.md. If the group later wants one specific variant, add it narrowly rather than building the general catalogue engine. |
| A full "what BGA does" replay-scrubber-lite that half-works | "We should have *some* replay." | A replay feature that can't pause/scrub (BGA's actual, criticized implementation) is worse than no replay at all — it creates the expectation of review capability and then frustrates it. If replay is ever added (v1.x+, per PROJECT.md's "revisit only if the group wants it"), it should be done properly (pausable, scrubbable, shareable) or not at all. | Skip entirely for v1; if requested later, build it right rather than building BGA's version of it. |
| Native mobile app / app-store distribution | "Better mobile experience." | Out of scope per PROJECT.md — "the web link is the whole distribution model." An app reintroduces install friction that directly contradicts the core value prop ("click a link... within seconds"). | Responsive, touch-first web layout (see mobile section) achieves the same experience goal without the distribution cost. |
| Forcing/enforcing a specific convention system (e.g., requiring "always play the newest card in your chop" or similar H-Group rules server-side) | BGA lets a room creator pick a "convention set" for the table, which sounds like helpful onboarding. | Convention systems are a social/strategic layer, not a rules layer — the server should not encode or enforce them. For a casual friend group they'd be pure overhead; even for a serious group, conventions are a human agreement, not something to bake into legality checks (a legal-but-unconventional clue must still be a legal move). | If anything, this belongs as an optional, purely informational room-setup note/description field, not enforced logic — and it's not needed for v1. |

## Feature Dependencies

```
Room creation + link generation
    └──requires──> Ephemeral room/seat model (no accounts)
                       └──requires──> Server-authoritative per-seat state filtering
                                          └──enables──> Legal-action enforcement (server checks, not client trust)
                                          └──enables──> Reconnect-to-same-seat (state lives server-side, keyed by seat not by socket)

Clue-touch highlighting on receiving hand
    └──requires──> Per-card accumulated clue state model (positive + negative info per card)
                       └──enables──> Card notes (notes annotate the same per-card state object)
                       └──enables──> Clue history/log (log is a derived view over the same clue events)

Colorblind-safe suit distinction (letters/icons per suit)
    └──enhances──> Clue-touch highlighting (redundant channel: works even if a player can't distinguish the clue color itself)
    └──enhances──> "Fireworks night" luminosity theme (luminosity is a colorblind-safe redundant signal by itself; combining both is stronger than either alone)

Disconnect indicator + pause-in-place
    └──requires──> Reconnect-to-same-seat
    └──conflicts──> Bot auto-play takeover (anti-feature — solves the same problem worse)

Turn indicator + "waiting on X"
    └──requires──> Whose-turn state already tracked server-side for legal-action enforcement (no new state, just surfacing it)

Mobile/touch card table layout
    └──requires──> Clue-touch highlighting and per-card state (must remain legible at small size — this is a rendering/layout constraint on an existing feature, not a new one)

End-of-game score + band
    └──requires──> Correct end-condition detection (3 fuses / 25 / final round)

Replay/scrubber (deferred)
    └──requires──> Turn-by-turn state history retained server-side (not currently required by any v1 feature — this is why it's out of scope: adding it later means adding a new data-retention concern, not just a UI feature)
```

### Dependency Notes

- **Clue-touch highlighting requires a real per-card clue-state model, not just a flash animation.** This is the crux of the "table stakes vs. power-user tooling" question in the note-taking section below: the underlying data model (what has this specific card been told, positively and negatively) is *required* infrastructure for basic play, not an add-on. Card notes and the clue log are cheap to add on top of that model once it exists, which is why they're differentiators (small marginal cost) rather than requiring separate infrastructure.
- **Colorblind support enhances rather than blocks other features**, but it must be designed in from the first rendering pass, not retrofitted — suit-identifying letters/icons need visual real estate reserved on the card face from day one, and the "fireworks night" luminosity concept should be built with colorblind-safe luminosity/saturation curves rather than pure hue shifts, since the two features share the same visual budget on a small card.
- **Disconnect-and-resume conflicts with bot-takeover as an anti-feature**: these solve the same underlying problem (a player is gone) with opposite philosophies (pause-and-wait for humans vs. keep-going-without-them). PROJECT.md has already chosen pause-and-resume; bot takeover should not be added later without treating it as a distinct, separately-justified feature, not a natural extension.
- **Replay is explicitly deferred, and that deferral has a real cost that should be visible to the roadmap**: if the state model doesn't retain turn history at all, adding replay later means introducing a new retention/data-model concern, not just a new screen. This is worth a one-line flag for the architecture phase: decide whether turn history is retained (cheap insurance) even though replay itself is not being built in v1.

## MVP Definition

### Launch With (v1)

Everything here is already reflected in, or directly implied by, PROJECT.md's Active requirements — this list cross-references and adds implementation-level clarity where research surfaced a concrete risk.

- [ ] Room creation, shareable link, name-only join, seat assignment, ready-up, start — the core "click a link and play" loop
- [ ] Persistent, glanceable game state: clue tokens, fuse tokens, deck count, discard pile, played stacks
- [ ] Whose-turn indicator, always visible
- [ ] Server-authoritative legal-action enforcement (clue rules, discard-at-8-clues lockout, play/discard always available)
- [ ] Clue-touch highlighting that persists on the board (not a flash) and shows which cards a clue touched, on the receiving hand
- [ ] Per-card accumulated clue state (positive AND negative info) visible to every player who can see that hand, and reflected back to the owning player as "what has been said about this unseen card" — this is the true table-stakes version of "what do I know about my own cards" (see next section)
- [ ] Correct end-condition detection: 3 fuses, all stacks complete, final round after deck empties (including the bonus-clue-on-completed-5, forfeit-if-at-8 edge case)
- [ ] Score display with a legible band/label at game end
- [ ] Disconnect indicator (clear, not a frozen/broken UI) + reconnect to the same seat with full state resume
- [ ] Colorblind-safe suit identification (letter or icon per suit, visible regardless of color perception) — must work correctly with Rainbow (a 6th suit that all color clues touch) and Black (fuse-unforgiving) in play
- [ ] Basic mobile/touch viability: the board must be usable (not just "technically renders") on a phone screen for a 4-5 player hand layout

### Add After Validation (v1.x)

Trigger for adding: the group has played several real sessions on v1 and specifically felt the absence.

- [ ] Player-authored card notes on own hand — add once the group is playing regularly enough that "I forget what I inferred 3 turns ago" becomes a recurring complaint
- [ ] Clue history / event log panel — cheap once turn history exists in state; add if reconnect-catch-up or mid-game recall becomes friction
- [ ] Sound/subtle notification for "your turn" — add if players report missing their turn while off-tab on a voice call
- [ ] Replay of the just-finished game — add only if the group explicitly asks after an argument about what a clue meant (per PROJECT.md: "revisit only if the group wants it"); if added, do it properly (pausable/scrubbable) rather than BGA's half-measure

### Future Consideration (v2+)

Defer until the Hanabi foundation is proven and/or Innovation milestone work is underway.

- [ ] Empathy/auto-inference tooling (H-Group-style convention assistance) — defer indefinitely; actively risks changing the character of casual play for this specific audience
- [ ] Extended variant catalogue beyond Rainbow/Black — defer indefinitely per PROJECT.md; only reconsider if the specific friend group requests one named variant, and add it narrowly
- [ ] Any bot/AI player — not currently justified by the product's stated audience (fixed friend group, not solo/practice play)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Room/link/seat/start lifecycle | HIGH | MEDIUM | P1 |
| Always-visible board state (tokens/deck/stacks/discard) | HIGH | LOW | P1 |
| Turn indicator | HIGH | LOW | P1 |
| Legal-action enforcement | HIGH | MEDIUM | P1 |
| Clue-touch highlighting (persistent) | HIGH | MEDIUM | P1 |
| Per-card accumulated clue state (pos + neg) | HIGH | MEDIUM-HIGH | P1 |
| End-condition detection + scoring | HIGH | MEDIUM | P1 |
| Disconnect indicator + reconnect-to-seat | HIGH | HIGH | P1 |
| Colorblind-safe suit ID | HIGH | LOW-MEDIUM | P1 |
| Mobile/touch-usable layout | MEDIUM-HIGH | MEDIUM-HIGH | P1 |
| "Fireworks night" luminosity signal theme | MEDIUM | MEDIUM | P1 (per PROJECT.md decision) |
| Card notes | MEDIUM | MEDIUM | P2 |
| Clue history/log | MEDIUM | LOW-MEDIUM | P2 |
| Turn/clue sound notification | LOW-MEDIUM | LOW | P2 |
| Replay/scrubber | MEDIUM | MEDIUM-HIGH | P3 |
| Empathy/auto-inference tooling | LOW (for this audience) | HIGH | P3 (or never) |
| Extended variant catalogue | LOW (for this audience) | HIGH | P3 (or never) |
| Bot/AI player | LOW (for this audience) | HIGH | Reject |

**Priority key:** P1 = must have for launch; P2 = should have, add when possible; P3 = nice to have / future consideration.

## Deep Dive: Clue History / "What Do I Know About My Own Cards" — Table Stakes vs. Power-User

This was flagged in the research question as the area most likely to be misjudged, so it gets its own section.

**The finding, stated plainly:** there are two distinct things bundled under "what do I know," and they have different table-stakes status.

1. **Per-card accumulated clue state (positive and negative information, rendered automatically on the card)** — this IS table stakes. It is not optional tooling; it is the digital replacement for what a physical Hanabi table does implicitly through shared memory and finger-pointing. In a physical game, when someone says "these two are red," every player at the table can also visually confirm which cards did NOT get touched, and everyone remembers that going forward because the cards are physically sitting there with a "red" clue chip typically placed under them, plus everyone's shared short-term memory. A digital implementation removes the ambient shared-memory context of sitting at a real table, so it MUST make the equivalent information persistently visible or the game becomes meaningfully harder than the physical version for no reason. This is exactly the gap BGA is most heavily criticized for ("no ability to see negative clues... quite cumbersome to track via memory") — and it is presented in every source as a real deficiency, not a matter of taste. **Verdict: table stakes, must be in v1.**

2. **Card notes (free-text or templated annotations a player manually writes on their own unseen cards, e.g., "probably a 2, could be chop")** — this is the differentiator. It's a memory/strategy aid layered on top of the auto-tracked state above, valuable for longer or more convention-heavy play, but a group can play a complete, correct, enjoyable game of Hanabi without ever writing a note, as long as the auto-tracked clue state (item 1) is solid. hanab.live's notes feature is beloved by its serious-player community, but that community is playing dozens of games with convention systems (finesses, chop moves, etc.) that this project has explicitly put out of scope. For a casual friend group's v1, notes are real value but not launch-blocking. **Verdict: differentiator, add in v1.x.**

The risk this research is flagging directly: it would be easy to read "hanab.live has notes, so we need notes" and either (a) over-invest in notes for v1 while under-investing in the actually-load-bearing accumulated-clue-state rendering, or (b) treat both as equally optional "polish" and ship neither, which would replicate BGA's specifically-criticized failure mode. The correct call is: auto-tracked per-card state is P1/table stakes; manual notes are P2/differentiator.

## Deep Dive: Colorblind Accessibility (Concrete, Not a Checkbox)

**The problem is structural, not cosmetic.** The Meeple Like Us accessibility teardown of the physical game states it precisely: "What does it mean to give a colour clue when one or more players may be colour blind?" — the clue itself, as spoken/typed language ("these are blue"), carries no information to a player who cannot perceive that hue distinction, regardless of how the cards are drawn. The physical game's attempted mitigation (distinct firework burst art per color) failed in practice — the reviewer notes multiple colors literally share the same burst shape ("White gets a spherical burst. Red gets... a spherical burst.") — and the game was graded D for colorblind accessibility, with the reviewer stating outright he "wouldn't recommend the game to anyone that was colour-blind" in its base physical form.

**The fix that the digital ecosystem actually converged on, and that this project should adopt:** hanab.live's color-blind mode does not try to make colors more distinguishable — it sidesteps the problem by adding a **suit-identifying letter or icon directly on every card**, independent of and in addition to color. This means a colorblind player never needs to distinguish red from green by hue at all: they read the letter. The *clue itself* is still phrased/rendered as "color," but the player's own perception of which physical card that clue refers to no longer depends on color perception, because the highlighted card also carries a redundant, colorblind-safe identifier.

**Concrete implications for this project:**
- Every card, at all times, needs a non-color-dependent suit identifier (letter, icon, or pattern) baked into the base card rendering — not a toggle-on afterthought, and not something that only appears in a special "colorblind mode." Making it a togglable mode risks (a) it being forgotten/undermaintained, and (b) an at-the-table friend group where only one of five players needs it, but everyone needs to see the same board to talk about it together (they're on a shared voice call describing what they see) — a per-user toggle that changes what's rendered creates a "wait, what are you looking at" mismatch. The cleaner solution for THIS product (small group, real-time verbal coordination) is to make the accessible rendering the only rendering, always on, rather than a personal setting some players enable and others don't.
- **Rainbow is the sharpest test of this**, precisely because it is explicitly in v1 scope: Rainbow is a 6th suit touched by every color clue, meaning a Rainbow card's identity is NOT resolved by any single color clue the way a normal suit's is — it needs its own unambiguous non-color identifier even more than the base 5 suits do, since players will otherwise conflate "was clued red" with "is red" in a game where a Rainbow card is also clued red (and blue, and green...). A distinct letter/icon (not reusing any of the 5 base-suit letters) for Rainbow is non-negotiable.
- The "fireworks night" luminosity-as-signal visual direction already planned in PROJECT.md is a genuine opportunity here: luminosity/saturation gradients are far more colorblind-robust than hue-based coding alone, so if clue-accumulation is partly communicated via brightness (as PROJECT.md's Key Decisions state), that reinforces accessibility rather than fighting it — but only if the luminosity curve is designed to be perceivable independent of hue (i.e., don't rely on "more saturated red" as the only signal for a red card gaining information, since saturation-of-a-hue-you-can't-distinguish doesn't help; use actual lightness/brightness steps).
- Do not rely on the clue button's color alone to teach the suit-to-color mapping; pair every clue-color button with the same letter/icon used on the cards, so the mapping is learnable and consistent across the whole UI, not just on cards.

**Confidence:** MEDIUM-HIGH on the "add a non-color identifier to every card, always on" solution — this is directly evidenced by hanab.live's actual shipped approach and matches the explicit recommendation in the Meeple Like Us teardown ("symbols... would solve the problem neatly"). LOW confidence on any specific icon/letter set — that's a design decision for later, not a research finding.

## Deep Dive: Disconnect/Reconnect — What "Good" Looks Like From the Player's Seat

Public documentation on hanab.live's exact disconnect-handling internals (idle timers, kick policy) could not be confirmed from available sources — flagged as a gap. However, PROJECT.md already establishes the correct target behavior independently, and it matches what every other source on player disconnects in cooperative/turn-based games converges on. Concretely, for a friend-group product where a 25-minute cooperative game must survive a dropped connection:

- **From the departed player's perspective on return:** rejoin via the same link, land back in the same seat automatically (no re-picking a name, no re-explaining who they are), see the exact current state including whatever happened while they were away, and be able to act immediately if it's their turn.
- **From the remaining players' perspective while someone is gone:** an unambiguous "Alex is disconnected" indicator on that seat — not a frozen screen, not a hand that silently stops responding, not an error. The rest of the table should be able to keep talking (they're on voice call already) and, critically, the game should NOT auto-pass or force a default action on the disconnected player's turn — it should simply wait, matching how a real table would react to someone stepping away mid-turn.
- **What NOT to do (validated as an anti-feature above):** don't auto-play a "safe" action for them, and don't hand their seat to a bot. Both remove player agency from a game whose entire value is human reasoning about known, specific teammates.
- This is squarely why PROJECT.md correctly treats this as a hard, non-negotiable requirement rather than a stretch goal — it is genuinely table stakes for this product's real usage pattern, and it's also the single highest-implementation-cost table-stakes item, since it requires the server-authoritative state model to be keyed durably by seat rather than by an ephemeral socket connection.

## Deep Dive: Mobile/Touch Viability

hanab.live's own team apparently judged their main site's touch experience insufficient and built a separate companion (hanab.cards) specifically for mobile — that's a real signal (LOW-MEDIUM confidence, inferred from its existence and stated purpose rather than a direct design document) that a card-table-with-many-hands layout does not trivially work on a phone. Concrete risks specific to this project's 4-5 player hand layout on a small screen:

- With 4-5 hands of 4-5 cards each, plus stacks, discard, and tokens, a literal "everyone's hand visible around a table" desktop layout will not fit a phone viewport at a legible size. The mobile layout likely needs to be materially different from desktop (e.g., a scrollable/paged view of hands, or a compact per-player strip), not a shrunk version of the same layout.
- Touch targets for the three actions (clue/play/discard) plus clue-target selection (choosing a player and a color/rank) need distinctly tap-friendly hit areas — click-and-drag interactions (hanab.live's play/discard-by-drag) are known to be worse on touch than on a mouse; tap-to-select-then-confirm patterns generally translate better to touch than drag-based ones.
- The colorblind-safe suit letters/icons and the persistent clue-touch highlighting both need to remain legible at the smaller card sizes a mobile layout forces — this is a real constraint to design against jointly, not an afterthought after desktop is done.
- **Verdict:** table stakes for this product (implied by "click a link... within seconds" as the entire distribution model, on an audience likely to include phone users on a voice call), but it is real, non-trivial design and layout work — it should be treated as its own scoped concern in the roadmap rather than assumed to fall out "for free" from a responsive CSS pass on the desktop layout.

## Sources

- [Hanabi-Live/hanabi-live — GitHub repo](https://github.com/Hanabi-Live/hanabi-live) — HIGH confidence (official project source)
- [hanabi-live/docs/features.md](https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/features.md) — HIGH confidence (official project documentation); source for clue-arrow/orange-border highlighting, card notes system, color-blind mode toggle, spectator/replay tooling, turn-bolding, keyboard shortcuts
- [hanabi-live/docs/rules.md](https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/rules.md) — HIGH confidence; source for final-round-after-deck-empties wording and the bonus-clue-on-completed-5 / forfeit-at-8 edge case
- [hanab.live](https://hanab.live/) — HIGH confidence (the live product itself)
- [hanab.cards](https://www.hanab.cards/) — MEDIUM confidence (existence and stated mobile-friendly purpose, inferred rather than deeply audited)
- [Zamiell/hanabi-conventions — BGA.md](https://github.com/Zamiell/hanabi-conventions/blob/master/misc/BGA.md) — MEDIUM confidence (community-authored, but written by an experienced player specifically to document BGA's UI gaps in detail; consistent with BGA's own docs containing zero UI/accessibility material); source for BGA's lack of negative-clue tracking, lack of notes, unpausable replay, no shared replays
- [Board Game Arena — Tips Hanabi](https://en.doc.boardgamearena.com/Tips_hanabi) — MEDIUM confidence (official BGA docs); notable finding is what it does NOT contain (no UI, colorblind, or accessibility content at all)
- [Meeple Like Us — Hanabi (2010) Accessibility Teardown](https://www.meeplelikeus.co.uk/hanabi-2010-accessibility-teardown/) — HIGH confidence (dedicated accessibility review); source for the structural colorblind problem statement and the "symbols would solve it neatly" recommendation, and the D-grade verdict on the physical game
- [Wikipedia — Hanabi (card game)](https://en.wikipedia.org/wiki/Hanabi_(card_game)) — MEDIUM confidence, used only for cross-checking rules already specified in PROJECT.md

---
*Feature research for: online multiplayer Hanabi (private/no-accounts) — features dimension*
*Researched: 2026-09-01*
