/**
 * Deterministic randomness for feed composition.
 *
 * Parts of the feed are randomized on purpose — "People are also reading"
 * picks a random page so it isn't the same three articles forever. The
 * catch is that composition reruns whenever the composed-feed cache expires
 * (90s), so a user who backgrounded the app and came back found that block
 * reshuffled while the articles around it sat still. Randomness driven by a
 * a seed keeps the variety while making it stable for as long as the seed
 * is: same seed in, same block out, however many times it recomposes.
 */

/** FNV-1a. Turns a seed string into the 32-bit integer mulberry32 wants. */
export function hashSeed(input: string): number {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return hash >>> 0;
}

/**
 * mulberry32 — small, fast, and good enough for picking a page and shuffling
 * three items. Returns the same sequence for the same seed.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Fisher-Yates, returning a new array.
 *
 * `sort(() => Math.random() - 0.5)` — what this replaces — is neither
 * uniform (some orderings are far likelier than others) nor pure (it sorts
 * in place, mutating the caller's array).
 */
export function shuffleWith<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
