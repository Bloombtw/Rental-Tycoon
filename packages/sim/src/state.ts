/** Money is always an integer number of cents. Never use floats for money. */
export type Cents = number;

export interface GameState {
  readonly seed: number;
  readonly rngState: number;
  /** Simulation day, starting at 0. */
  readonly day: number;
  readonly cash: Cents;
}

export function createGame(seed: number, startingCash: Cents = 50_000_00): GameState {
  if (!Number.isSafeInteger(seed)) throw new RangeError("seed must be a safe integer");
  if (!Number.isSafeInteger(startingCash) || startingCash < 0) {
    throw new RangeError("startingCash must be a non-negative integer of cents");
  }
  return { seed, rngState: seed >>> 0, day: 0, cash: startingCash };
}
