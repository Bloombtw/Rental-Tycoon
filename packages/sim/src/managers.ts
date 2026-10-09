import { acceptanceChance, levelForXp, MAX_CAR_DAILY_PRICE, referencePrice } from "./economy.js";
import {
  InsufficientCashError,
  ManagerStateError,
  ModelLockedError,
  SimOverflowError,
  UnknownManagerError,
} from "./errors.js";
import type { Car, Cents, GameState } from "./state.js";
import { boostedAcceptance, washedReference, type Upgrades } from "./upgrades.js";

/** Staff that automates the agency (managers.md). */
export type ManagerId = "sales" | "pricing";

export const MANAGER_IDS: readonly ManagerId[] = Object.freeze(["sales", "pricing"] as const);

export type Managers = Readonly<Record<ManagerId, boolean>>;

export const NO_MANAGERS: Managers = Object.freeze({ sales: false, pricing: false });

export interface ManagerSpec {
  readonly id: ManagerId;
  readonly hireCost: Cents;
  readonly dailySalary: Cents;
  readonly unlockLevel: number;
}

/** Tunable placeholders. Deep-frozen. */
export const MANAGERS: Readonly<Record<ManagerId, ManagerSpec>> = Object.freeze({
  sales: Object.freeze({ id: "sales", hireCost: 8_000_00, dailySalary: 80_00, unlockLevel: 2 }),
  pricing: Object.freeze({
    id: "pricing",
    hireCost: 12_000_00,
    dailySalary: 120_00,
    unlockLevel: 3,
  }),
} as const satisfies Record<ManagerId, ManagerSpec>);

/** Demand points (percent of the fleet) the sales manager adds. */
export const SALES_BONUS_PCT = 15;

/** Price/reference ratios the pricing manager tries, in percent. */
const PRICE_STEPS_PCT: readonly number[] = Array.from({ length: 31 }, (_, i) => 50 + i * 5);

function hired(managers: Managers | undefined, id: ManagerId): boolean {
  return managers?.[id] === true;
}

/** Salaries paid at closing. */
export function managersSalary(managers: Managers | undefined): Cents {
  let total = 0;
  for (const id of MANAGER_IDS) if (hired(managers, id)) total += MANAGERS[id].dailySalary;
  return total;
}

export function salesBonusPct(managers: Managers | undefined): number {
  return hired(managers, "sales") ? SALES_BONUS_PCT : 0;
}

/**
 * Price with the best expected revenue (price × acceptance) for a car, given the upgrades. Whole
 * euros, within the allowed range.
 */
export function bestPrice(car: Car, upgrades: Upgrades | undefined): Cents {
  const reference = washedReference(referencePrice(car), upgrades);
  let best = reference;
  let bestValue = -1;
  for (const pct of PRICE_STEPS_PCT) {
    const price = Math.min(MAX_CAR_DAILY_PRICE, Math.round((reference * pct) / 100 / 100) * 100);
    const value = price * boostedAcceptance(acceptanceChance(price, reference), upgrades);
    if (value > bestValue) {
      bestValue = value;
      best = price;
    }
  }
  return best;
}

/** The pricing manager's morning: every car at its best price. Returns the same array if unchanged. */
export function managedFleet(
  fleet: readonly Car[],
  managers: Managers | undefined,
  upgrades: Upgrades | undefined,
): readonly Car[] {
  if (!hired(managers, "pricing")) return fleet;
  let copy: Car[] | null = null;
  fleet.forEach((car, i) => {
    const price = bestPrice(car, upgrades);
    if (price !== car.dailyPrice) {
      copy ??= fleet.slice();
      copy[i] = { ...car, dailyPrice: price };
    }
  });
  return copy ?? fleet;
}

function check(id: unknown): ManagerId {
  if (typeof id !== "string" || !Object.hasOwn(MANAGERS, id)) throw new UnknownManagerError(id);
  return id as ManagerId;
}

/** Hires a manager: pays the hiring cost. Pure. */
export function hireManager(state: GameState, id: ManagerId): GameState {
  const m = check(id);
  const spec = MANAGERS[m];
  if (hired(state.managers, m)) throw new ManagerStateError(m, true);
  if (levelForXp(state.xp) < spec.unlockLevel) throw new ModelLockedError(m, spec.unlockLevel);
  if (!Number.isSafeInteger(state.cash)) throw new SimOverflowError("cash");
  if (state.cash < spec.hireCost) throw new InsufficientCashError(spec.hireCost, state.cash);
  return {
    ...state,
    cash: state.cash - spec.hireCost,
    managers: { ...NO_MANAGERS, ...state.managers, [m]: true },
  };
}

/** Lets a manager go (no refund, no more salary). Pure. */
export function fireManager(state: GameState, id: ManagerId): GameState {
  const m = check(id);
  if (!hired(state.managers, m)) throw new ManagerStateError(m, false);
  return { ...state, managers: { ...NO_MANAGERS, ...state.managers, [m]: false } };
}
