import {
  MAX_CAR_DAILY_COST,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  type CarModelId,
} from "./economy.js";
import { InvalidFleetError, InvalidSeedError, InvalidStartingCashError } from "./errors.js";
import { NO_UPGRADES, parkingLevelFor, type Upgrades } from "./upgrades.js";
import { NO_MANAGERS, type Managers } from "./managers.js";
import { NO_DAILY_REWARD, type DailyRewardState } from "./dailyReward.js";
import { INITIAL_SHOP, type ShopState } from "./shop.js";
import { INITIAL_MISSIONS, type MissionsState } from "./missions.js";
import { FIRST_EVENT_DAY, type ActiveEvent } from "./events.js";

/** Money is always an integer number of cents. Never use floats for money. */
export type Cents = number;

/** Integer >= 1, assigned by createGame. */
export type CarId = number;

export interface Car {
  readonly id: CarId;
  /** Present for bought cars; absent for createGame fixtures. */
  readonly model?: CarModelId;
  readonly dailyPrice: Cents;
  readonly dailyCost: Cents;
  /** Rented at its last departure slot. */
  readonly rented: boolean;
  /** What happened at its last departure slot; absent before its first slot. */
  readonly outcome?: RentalOutcome;
  /** Days owned; absent = 0 (resale-wear.md). */
  readonly age?: number;
  /** Condition in percent, 0..100; absent = 100. */
  readonly condition?: number;
  /** Broken down, waiting for a repair; absent = false. */
  readonly broken?: boolean;
}

export type RentalOutcome = "rented" | "tooExpensive" | "noCustomer" | "broken";

export const RENTAL_OUTCOMES: readonly RentalOutcome[] = Object.freeze([
  "rented",
  "tooExpensive",
  "noCustomer",
  "broken",
] as const);

export interface NewCar {
  readonly dailyPrice: Cents;
  readonly dailyCost: Cents;
}

export interface GameState {
  readonly seed: number;
  readonly rngState: number;
  /** Simulation day, starting at 0. */
  readonly day: number;
  /** Minutes elapsed since opening (09:00), 0..719. */
  readonly minute: number;
  readonly cash: Cents;
  /** Revenue collected since opening (already in cash). */
  readonly todayRevenue: Cents;
  /** Customers still to come today (drawn at opening). */
  readonly customersLeft: number;
  /** Level of each upgrade (upgrades.md). */
  readonly upgrades: Upgrades;
  /** Agency experience: one per euro of rental revenue (agency-level.md). */
  readonly xp: number;
  /** Hired staff (managers.md). */
  readonly managers: Managers;
  /** Daily login reward streak (daily-reward.md). */
  readonly dailyReward: DailyRewardState;
  /** Diamonds, boosters and real-money purchases (shop.md). */
  readonly shop: ShopState;
  /** Active missions of the chain (missions.md). */
  readonly missions: MissionsState;
  /** Running or finished random event; null when none (events.md). */
  readonly event: ActiveEvent | null;
  /** First day on which a new event may start (events.md). */
  readonly nextEventDay: number;
  /** Id the next bought car gets; ids are never reused, even after a sale (resale-wear.md). */
  readonly nextCarId: number;
  readonly fleet: readonly Car[];
  /** Report of the last closed day; null before the first closing. */
  readonly lastDay: DayReport | null;
}

export interface DayReport {
  readonly revenue: Cents;
  readonly costs: Cents;
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
    minute: 0,
    cash: startingCash,
    todayRevenue: 0,
    customersLeft: 0, // drawn when minute 0 is processed
    upgrades: { ...NO_UPGRADES, parking: parkingLevelFor(cars.length) },
    xp: 0,
    managers: NO_MANAGERS,
    dailyReward: NO_DAILY_REWARD,
    shop: INITIAL_SHOP,
    missions: INITIAL_MISSIONS,
    event: null,
    nextEventDay: FIRST_EVENT_DAY,
    nextCarId: cars.length + 1,
    fleet: cars,
    lastDay: null,
  };
}
