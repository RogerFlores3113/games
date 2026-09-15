// Zero-dependency, deterministic 128-bit-state PRNG, Fisher-Yates shuffle,
// and opaque card-id minting (D-04). No imports — packages/rules must have
// ZERO runtime dependencies (FDN-02).
//
// Why 128-bit state, not a 32-bit PRNG like mulberry32: a 32-bit PRNG seed
// space (2^32) is small enough that a player who can see every OTHER card in
// a shuffled deck could, in principle, brute-force the seed against the
// portion of the deck they *can* see and recover the remainder, including
// their own hidden card and the undealt deck order. Seeding sfc32 with all
// four cyrb128 words keeps the searchable state at 128 bits, matching
// mintGameSeed's 128-bit secret (apps/worker/src/seat-identity.ts), so the
// deck order is not meaningfully more guessable than the seed itself.
//
// cyrb128 and sfc32 are both public-domain algorithms by Andrew (bryc),
// widely used for exactly this "string seed -> fast deterministic PRNG"
// purpose. Adapted here as pure, non-mutating functions.

/** Four 32-bit words forming the PRNG's full state. */
export type RngState = readonly [number, number, number, number];

/** cyrb128: hashes a string into four 32-bit words. Pure, deterministic. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/** One pure sfc32 step. Returns a NEW state tuple; never mutates the input. */
function sfc32Step(state: RngState): { value: number; state: RngState } {
  let [a, b, c, d] = state;
  a |= 0;
  b |= 0;
  c |= 0;
  d |= 0;
  const t = ((a + b) | 0) + d | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return { value: t >>> 0, state: [a, b, c, d] as const };
}

/** Derives a fresh 128-bit RNG state from a seed string and an independent
 * "stream" name. Different stream names on the same seed yield independent,
 * uncorrelated generators (e.g. "deck" vs "card-ids"). Runs a handful of
 * warmup steps first, the standard sfc32 recipe for avoiding weak early
 * output from a freshly-hashed seed. */
export function seedToRngState(seed: string, stream: string): RngState {
  let state: RngState = cyrb128(`${stream}:${seed}`);
  for (let i = 0; i < 4; i++) {
    state = sfc32Step(state).state;
  }
  return state;
}

/** One pure PRNG step. `value` is an unsigned 32-bit integer. Returns a NEW
 * state; never mutates `state`. */
export function nextRandom(state: RngState): { value: number; state: RngState } {
  return sfc32Step(state);
}

/** Fisher-Yates shuffle over a copy of `items`, seeded deterministically from
 * (seed, stream). Never mutates `items`. */
export function shuffleWithSeed<T>(items: readonly T[], seed: string, stream: string): T[] {
  const result = items.slice();
  let state = seedToRngState(seed, stream);
  for (let i = result.length - 1; i > 0; i--) {
    const { value, state: nextState } = nextRandom(state);
    state = nextState;
    const j = Math.floor((value / 4294967296) * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** Mints an opaque 8-lowercase-letter id from successive PRNG draws, retrying
 * while the id collides with `taken`. Lowercase-only letters are deliberate:
 * an id can never contain a digit (so it cannot be mistaken for a deck
 * index) or a capitalized card-value token. */
export function mintCardId(
  rng: RngState,
  taken: ReadonlySet<string>,
): { id: string; rng: RngState } {
  let state = rng;
  for (;;) {
    let id = "";
    for (let i = 0; i < 8; i++) {
      const { value, state: nextState } = nextRandom(state);
      state = nextState;
      id += ID_ALPHABET[value % 26];
    }
    if (!taken.has(id)) {
      return { id, rng: state };
    }
  }
}
