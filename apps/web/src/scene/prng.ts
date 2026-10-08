/**
 * Deterministic, stateless hash used for the look of the city (building variants, trees, speeds).
 * Independent from the simulation's rng.ts. Pure: no three, no DOM.
 */

export const CITY_SEED = 0x5eedc17;

/** Integer value of a number for hashing: non-finite -> 0, otherwise wrapped to 32 bits. */
function int32(n: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) | 0 : 0;
}

/** Stable value in [0, 1) for a grid cell and a salt. Same input, same output, no state. */
export function cellHash(col: number, row: number, salt: number): number {
  let h = CITY_SEED | 0;
  h = Math.imul(h ^ int32(col), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ int32(row), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ int32(salt), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
