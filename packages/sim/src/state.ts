import { MAX_CAR_DAILY_COST, MAX_CAR_DAILY_PRICE, MAX_FLEET_SIZE } from "./economy.js";
import { InvalidFleetError, InvalidSeedError, InvalidStartingCashError } from "./errors.js";

/** Money is always an integer number of cents. Never use floats for money. */
export type Cents = number;

/** Integer >= 1, assigned by createGame. */
export type CarId = number;

export interface Car {
  readonly id: CarId;
  readonly dailyPrice: Cents;
  readonly dailyCost: Cents;
  /** Rented during the last simulated day. */
  readonly rented: boolean;
}

export interface NewCar {
  readonly dailyPrice: Cents;
  readonly dailyCost: Cents;
}

export interface GameState {
  readonly seed: number;
  readonly rngState: number;
  /** Simulation day, starting at 0. */
  readonly day: number;
  readonly cash: Cents;
  readonly fleet: readonly Car[];
}

function isCentsInRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function copyFleet(fleet: unknown): Car[] {
  if (!Array.isArray(fleet) || fleet.length > MAX_FLEET_SIZE) {
    throw new InvalidFleetError(null, "fleet");
  }
  const items: unknown[] = fleet;
  const cars: Car[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "object" || item === null) throw new InvalidFleetError(i, "dailyPrice");
    const raw = item as { dailyPrice?: unknown; dailyCost?: unknown };
    const dailyPrice = raw.dailyPrice;
    const dailyCost = raw.dailyCost;
    if (!isCentsInRange(dailyPrice, MAX_CAR_DAILY_PRICE)) {
      throw new InvalidFleetError(i, "dailyPrice");
    }
    if (!isCentsInRange(dailyCost, MAX_CAR_DAILY_COST)) {
      throw new InvalidFleetError(i, "dailyCost");
    }
    cars.push({ id: i + 1, dailyPrice, dailyCost, rented: false });
  }
  return cars;
}

export function createGame(
  seed: number,
  startingCash: Cents = 50_000_00,
  fleet: readonly NewCar[] = [],
): GameState {
  if (typeof seed !== "number" || !Number.isSafeInteger(seed)) throw new InvalidSeedError(seed);
  if (typeof startingCash !== "number" || !Number.isSafeInteger(startingCash) || startingCash < 0) {
    throw new InvalidStartingCashError(startingCash);
  }
  const cars = copyFleet(fleet);
  // Normalise -0 to +0 so the state survives a JSON round-trip unchanged.
  const normalizedSeed = seed === 0 ? 0 : seed;
  return {
    seed: normalizedSeed,
    rngState: normalizedSeed >>> 0,
    day: 0,
    cash: startingCash,
    fleet: cars,
  };
}
