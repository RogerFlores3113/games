# Innovation (base game): Research Summary

**Researched:** 2026-09-19
**Scope:** Carl Chudyk's Innovation, base game only. No Echoes, Figures, Cities, Artifacts or Unseen.

| File | Contents |
|------|----------|
| `RULES.md` | Full rules, a 3rd vs 4th edition comparison, 34 numbered edge cases, per-seat hidden information, and side-by-side card text for all 115 cards (Appendix A) |
| `CARDS.md` / `cards.json` | Card catalog: 105 cards for 3rd edition, 115 for 4th. Includes the 4-slot icon layouts, dogma icons, effects, implementation flags and the 3rd→4th diff |
| `LAYOUT.md` | Card anatomy and proportions, a splay-visibility table, card backs, board rendering in other online implementations, art licensing, and a rendering recommendation |
| `ENGINE.md` | Engine architecture (a generator replayed within one action), the pending-decision model, adapter changes, leak-check extensions, sizing and phase breakdown |

## Key facts

- **Icon slots.** Each card has 4 slots, in the order `[TL, BL, BC, BR]`. Exactly one slot holds the hexagon image and the other three hold icons. The 3×2 six-slot grid belongs to the Cities expansion only.
- **Splay visibility.** A covered card in a splayed pile shows only some of its slots:

  | Splay | Slots that count on each covered card |
  |-------|---------------------------------------|
  | Left | BR |
  | Right | TL, BL |
  | Up | BL, BC, BR |
  | Aslant (4th edition only) | all four |

  The top card always counts all four slots. The hexagon never counts as an icon. A pile of 0 or 1 cards loses its splay.
- **Card backs.** A back shows the card's age, and in 4th edition also its set. Other players therefore see the count and ages of your hand and score pile, but never which cards they are. Nobody ever sees which card an achievement is, including its owner. Boards are fully public; in 4th edition that includes covered cards. The deck is sent as counts only.
- **No randomness after setup.** This is what makes the generator-replay engine possible.
- **Dogma effects.**
  - Icon counts are fixed when the dogma starts.
  - Players whose count is at least equal share the effect. Only players with strictly fewer are vulnerable to demands.
  - Players act in turn order starting from the left, and the activating player goes last.
  - Players drawing a card can empty an age pile partway through an effect; later draws then come from the next age up.
  - Drawing above the top age (10 in 3rd edition, 11 in 4th) ends the game immediately, even partway through an effect.

## Recommended architecture (from ENGINE.md)

- **Card data** lives in a plain table generated from `cards.json`.
- **Card effects** are TypeScript generators that `yield` a decision request whenever a player has to choose something. They are built from a library of roughly 40 primitives. There is no custom card-description language.
- **Saving mid-effect.** A generator can't be written to Durable Object storage. Instead the state saves the snapshot from the start of the action, the ordered answers given so far, and the pending decision. Each new answer replays the action from the snapshot, and a per-answer check restarts the action from its snapshot if the replay doesn't match.
- **Pending decisions.**
  - One player chooses at a time; the setup meld is the exception, with everyone choosing at once.
  - Only the chooser receives the legal options.
  - Everyone else sees "waiting on X", without an option count.
  - A decision id rejects stale clicks.
  - Forced choices resolve automatically.
- **Adapter changes.**
  - The `Variant` type, `AdapterError` and `GameEndResult` are currently Hanabi-specific. Innovation needs winners, not a co-op score.
  - The worker has a single hard-coded `activeGame`.
  - Innovation needs 2–4 player seat limits.
- **Size.** Roughly 4–6× the Hanabi engine, not counting the UI. Suggested order:
  1. Generalise the adapter.
  2. Innovation with no dogmas: setup, draw, meld, achieve.
  3. The dogma framework plus about 8 cards that cover every decision type. This is the highest-risk step.
  4. The remaining cards in three batches: ages 1–3, 4–6, 7–10 (and 11).
  5. Soak testing and hardening.
- **Top risks.**
  - Hidden-information leaks through new channels: the snapshot, recorded answers, the log, and option counts.
  - Replay going nondeterministic.
  - Rules misreadings across more than 100 unusual cards.
  - Effort.

## Disagreements between the researchers

- **Edition.** RULES.md and ENGINE.md recommend **4th edition**. It is the current official ruleset and has a live Asmadi card reference. It also checks achievements and wins only at the end of each action, which is much simpler to run on a server. LAYOUT.md suggested shipping 3rd edition first. BGA still runs 3rd edition in production, with 4th in alpha. `cards.json` holds both editions, so the choice doesn't block the data work.
- **Board-pile visibility in 3rd edition** (whether players may look through covered cards) is low-confidence. 4th edition says board cards are public.

## Decisions needed from the owner

1. **Edition: 4th (recommended) or 3rd.** 4th edition adds age 11, the aslant splay, a 7th icon, Junk, and new achievement timing. 3rd edition is what BGA players know.
2. **Player counts for v1.** 4th edition requires the Parley rule in 4-player games without teams. The suggested v1 is 2p, 3p and 2v2 teams, or build Parley.
3. **Card text.** Card names and effect text are Asmadi's copyright. The options are to reproduce the text verbatim (low risk for a friends-only link, not zero), paraphrase it, or email Asmadi (innovation@asmadigames.com) for permission.
4. **Art.** Use our own card renderer with the official layout proportions and openly licensed icons (Lucide, game-icons.net). Never use Asmadi's art or card backs.
5. **Rulings.** Adopt BGA's reading where the rules are ambiguous. The main example is skipping "if you do" after a partial action.

## Data provenance (cards.json)

- **Sources.**
  - BGA's MIT-licensed source (micahstairs/bga-innovation) provides 3rd and 4th edition text and icons.
  - Asmadi's official 4th edition card reference is authoritative for 4th edition.
  - The 2011 FAQ card list and jrdek/innovation were used for cross-checks.
- **4th edition icons.** All 460 icon slots were checked against Asmadi's card images.
- **Known corrections and caveats.**
  - Reformation's second effect in 3rd edition: BGA's text data duplicates the first effect, and this is corrected.
  - City States BR is castle.
  - The special-achievement conditions come from BGA only.
  - Difficulty flags are pattern-matched estimates.
