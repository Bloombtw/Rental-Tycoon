const UINT32_RANGE = 2 ** 32;

interface RandomSource {
  getRandomValues(a: Uint32Array<ArrayBuffer>): Uint32Array<ArrayBuffer>;
}

function isUint32(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < UINT32_RANGE;
}

function defaultSource(): RandomSource | undefined {
  try {
    if (typeof crypto === "undefined") return undefined;
    return { getRandomValues: (a) => crypto.getRandomValues(a) };
  } catch {
    return undefined;
  }
}

/** Random unsigned 32-bit integer for `createGame`. Never throws, always in [0, 2^32 - 1]. */
export function newSeed(random?: RandomSource): number {
  try {
    const source = random ?? defaultSource();
    if (source) {
      const value = source.getRandomValues(new Uint32Array(1))[0];
      if (isUint32(value)) return value;
    }
  } catch {
    // fall back below
  }
  const fallback = Math.floor(Math.random() * UINT32_RANGE);
  return isUint32(fallback) ? fallback : 0;
}
