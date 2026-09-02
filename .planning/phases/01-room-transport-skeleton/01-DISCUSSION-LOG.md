# Phase 1: Room & Transport Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 01-room-transport-skeleton
**Areas discussed:** Room link & lifecycle, Seat identity & host role, Lobby behavior, In-progress arrival & placeholder game

---

## Room link & lifecycle

### What should the shareable room link look like?

| Option | Description | Selected |
|--------|-------------|----------|
| `/room/ABC123` — short code | 6-char nanoid, uppercase-safe alphabet, readable aloud on a voice call | ✓ |
| `/room/{12-char id}` | Longer nanoid, effectively unguessable, link-only sharing | |
| `/room/purple-fox-42` — word slug | Human-memorable, needs a wordlist and collision handling | |

**Notes:** Chosen because the group is on a voice call — the code gets read out loud.

### When should an abandoned room be garbage collected (ROOM-08)?

| Option | Description | Selected |
|--------|-------------|----------|
| Idle timeout via DO alarm | ~12h idle in-game, ~1h idle lobby | ✓ |
| Fixed 24h TTL from creation | One rule, no per-state tuning | |
| Short idle timeout (~1h everywhere) | Aggressive cleanup, minimal storage | |

### What does the host do on the landing page to create a room?

| Option | Description | Selected |
|--------|-------------|----------|
| Name + variant, then straight into the lobby | One screen, host seated immediately, link ready to copy | ✓ |
| One-click create, name asked in the lobby | Fastest possible link | |
| Create screen, then a dedicated share screen | Makes the share step unmissable | |

### How should Phase 1 prove RT-02 (cold link click after a week)?

| Option | Description | Selected |
|--------|-------------|----------|
| Documented manual cold-start check | Deploy, wait, click fresh link, confirm seconds | ✓ |
| Automated latency test on a fresh room ID | Proves cold-DO latency, not week-long idleness | |
| Both | Automated guard plus one-time manual confirmation | |

---

## Seat identity & host role

### How is a returning browser matched back to its seat?

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage token per room | Server-minted seat token, replayed on connect | ✓ |
| Token in the URL after joining | Travels with a bookmarked link, but leakable | |
| localStorage + cookie fallback | Belt and braces, more code paths | |

### What happens when every seat is claimed (RT-07)?

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse with a clear message | "This room is full (5/5)" — no seat, no partial join | ✓ |
| Refuse, but offer to create a new room | Dead end becomes a next step | |
| Hold them as a waiting observer | Auto-claim if a seat frees before start | |

### Who is host, and what if they disconnect in the lobby?

| Option | Description | Selected |
|--------|-------------|----------|
| Creator is host; auto-transfer if they drop | Host passes to next connected seat after a lobby grace period | ✓ |
| Creator is host, permanently | Simplest, but a dead host laptop strands the table | |
| No host — anyone can start | Removes the host concept entirely | |

### Second tab with a valid seat token?

| Option | Description | Selected |
|--------|-------------|----------|
| Newest connection wins, older one is told | Seat rebinds to newest socket; stale tab notified | ✓ |
| Both tabs stay live on one seat | Fan out to every socket holding the token | |
| Reject the second tab | Safest, annoying if the first socket is dead | |

**Notes:** Explicitly scoped as "don't corrupt seat state"; Phase 5 owns real multi-tab hardening.

---

## Lobby behavior

### How should duplicate display names be disambiguated (ROOM-03)?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-suffix on join | "Roger" → "Roger (2)", no friction at the door | ✓ |
| Ask them to pick another name | Keeps names as typed, costs a retry | |
| Allow duplicates, distinguish by seat position | No name mangling, but confusing on a call | |

### How does the ready-up gate work (ROOM-06)?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit ready toggle, all seated must be ready | Unambiguous, nobody dealt in while alt-tabbed | |
| No ready state — host starts when they like | Seat list only; readiness judged on the voice call | ✓ |
| Ready toggle, host can start anyway | Ready is advisory | |

**Notes:** This conflicted with ROOM-04 and Phase 1 success criteria #2/#3, which was raised immediately and resolved in the next question.

### What becomes of ROOM-04's visible ready state?

| Option | Description | Selected |
|--------|-------------|----------|
| Reinterpret as connection status | Note the reinterpretation in CONTEXT.md only | |
| Amend ROOM-04 and success criterion #2 | Update REQUIREMENTS.md and ROADMAP.md so no agent builds a ready toggle | ✓ |
| Keep the ready toggle after all, but non-blocking | Requirement met literally, host keeps control | |

**Notes:** Amendments applied on 2026-09-01 to `.planning/REQUIREMENTS.md` (ROOM-04) and `.planning/ROADMAP.md` (Phase 1 criteria #2 and #3 — #3 also referenced readiness and was amended in the same pass).

### Can a seated player leave or change seats in the lobby?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave frees the seat; no seat swapping | Seat order is join order | ✓ |
| Leave frees the seat, and seats are rearrangeable | Deliberate turn-order control, more UI | |
| Seats are sticky — no leaving | Simple, but a bailed friend blocks a seat forever | |

### Can the variant change in the lobby (ROOM-05)?

| Option | Description | Selected |
|--------|-------------|----------|
| Host can change it until start | Locked at start; saves recreating the room | ✓ |
| Locked at creation | Simplest state model | |
| Any seated player can change it | Table decision, small race to reason about | |

---

## In-progress arrival & placeholder game

### Arriving at a link for an in-progress game (ROOM-07)?

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking message naming the room state | No board, no partial state, honest dead end | ✓ |
| Message plus a spectate-free waiting screen | Auto-joins if a seat frees mid-game | |
| Message plus a "create your own room" button | Shares a component with the room-full refusal | |

### What is the FDN-01 placeholder game?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared counter / click-the-button | Turn order + action submission + broadcast, no rules | ✓ |
| Toy secret-holding game now | Pulls Phase 2 work forward, blurs the phase boundary | |
| Bare adapter, no playable placeholder | Types and unit tests only, weaker end-to-end proof | |

### How much visual polish should Phase 1's screens get?

| Option | Description | Selected |
|--------|-------------|----------|
| Deliberately plain, themed later | Tailwind defaults, no design work | |
| Establish the dark theme now | Palette and CSS variables set up in Phase 1, shared by every later screen | ✓ |
| Plain, but set up the design tokens | Scaffold `@theme` without design decisions | |

**Notes:** User chose to front-load the "fireworks night" palette rather than restyle in Phase 6.

### How should persisted DO room state be versioned across deploys?

| Option | Description | Selected |
|--------|-------------|----------|
| Version field, unknown version = reset room | Resets to empty lobby rather than misreading state | ✓ |
| Version field with migration functions | Correct in principle, ongoing cost for 25-minute games | |
| No versioning in Phase 1 | Least work now, expensive to retrofit | |

---

## Claude's Discretion

- Exact idle-timeout values within the stated intent (~12h in-game, ~1h lobby).
- Monorepo layout, workspace tooling, tsconfig project references.
- Wire message envelope shapes and Zod schema design.
- Host-transfer and second-tab grace period lengths.
- Lobby visual layout beyond "dark theme established".
- DNS / Vercel project wiring mechanics for FDN-04.

## Deferred Ideas

- Mid-game seat reclaim for a new person (a permanent dropout's seat) — Phase 5 territory if ever wanted.
- Multiple live sockets per seat — Phase 5 (RT-08).
- Schema migration functions for persisted room state — rejected for v1.
- Seat rearrangement / deliberate turn-order control in the lobby — cut.
