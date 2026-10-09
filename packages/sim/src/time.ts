import {
  acceptanceChance,
  DEMAND_BASE,
  DEMAND_MAX_PCT,
  DEMAND_MIN_PCT,
  MAX_FLEET_SIZE,
  referencePrice,
  rentalXp,
} from "./economy.js";
import { InvalidMinutesError, SimOverflowError } from "./errors.js";
import { createRng, type Rng } from "./rng.js";
import { adsBonusPct, boostedAcceptance, washedReference } from "./upgrades.js";
import { managedFleet, managersSalary, salesBonusPct } from "./managers.js";
import { boostDemandPct, revenueMultiplier } from "./shop.js";
import type { Car, GameState, RentalOutcome } from "./state.js";

/** Opening hours 09:00 -> 21:00, in game minutes. */
export const DAY_MINUTES = 720;
/** 09:00 expressed in minutes since midnight (display only). */
export const OPENING_CLOCK_MINUTE = 540;
export const DEPARTURE_STAGGER_MINUTES = 2;
export const RENTAL_MINUTES = 600;
export const MAX_ADVANCE_MINUTES = 720;

/** Departure slot (minutes since opening) of the car at `index`, or null if it has none. */
export function departureMinute(index: number): number | null {
  if (typeof index !== "number" || !Number.isSafeInteger(index)) return null;
  if (index < 0 || index >= MAX_FLEET_SIZE) return null;
  return index * DEPARTURE_STAGGER_MINUTES;
}

/** Return time (minutes since opening) of the car at `index`, or null if it has no slot. */
export function returnMinute(index: number): number | null {
  const dep = departureMinute(index);
  return dep === null ? null : dep + RENTAL_MINUTES;
}

/**
 * Advances the simulation by `minutes` game minutes, processing the events of minutes
 * a .. a+n-1 in order. Event-based: O(fleet) per day. Pure.
 */
export function advanceMinutes(state: GameState, minutes: number): GameState {
  if (
    typeof minutes !== "number" ||
    !Number.isSafeInteger(minutes) ||
    minutes < 0 ||
    minutes > MAX_ADVANCE_MINUTES
  ) {
    throw new InvalidMinutesError(minutes);
  }
  const start = state.minute;
  if (
    typeof start !== "number" ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    start >= DAY_MINUTES
  ) {
    throw new SimOverflowError("minute");
  }
  if (minutes === 0) return state;
  if (typeof state.cash !== "number" || !Number.isSafeInteger(state.cash)) {
    throw new SimOverflowError("cash");
  }
  if (typeof state.todayRevenue !== "number" || !Number.isSafeInteger(state.todayRevenue)) {
    throw new SimOverflowError("cash");
  }

  const end = start + minutes;
  let cash = state.cash;
  let todayRevenue = state.todayRevenue;
  let day = state.day;
  let lastDay = state.lastDay;
  const left = state.customersLeft;
  let customersLeft = typeof left === "number" && Number.isSafeInteger(left) && left > 0 ? left : 0;
  let xp = Number.isSafeInteger(state.xp) && state.xp > 0 ? state.xp : 0;
  let copy: Car[] | null = null;
  // Created on first draw only, so a span without random events leaves rngState untouched.
  const lazy: { rng: Rng | null } = { rng: null };
  const draw = (): Rng => (lazy.rng ??= createRng(state.rngState));

  /** Processes departure slots in minutes [from, to). Minute 0 opens the day: customers are drawn. */
  const depart = (from: number, to: number): void => {
    if (to <= from) return;
    if (from === 0) {
      const bonus =
        adsBonusPct(state.upgrades) +
        salesBonusPct(state.managers) +
        boostDemandPct({ ...state, day });
      const pct = draw().int(DEMAND_MIN_PCT + bonus, DEMAND_MAX_PCT + bonus);
      customersLeft = DEMAND_BASE + Math.round((state.fleet.length * pct) / 100);
      // The pricing manager sets the day's prices before the first customer (managers.md).
      const current = copy ?? state.fleet;
      const managed = managedFleet(current, state.managers, state.upgrades);
      if (managed !== current) copy = managed.slice();
    }
    const first = Math.ceil(from / DEPARTURE_STAGGER_MINUTES);
    const limit = Math.min(state.fleet.length, MAX_FLEET_SIZE);
    for (let i = first; i < limit && i * DEPARTURE_STAGGER_MINUTES < to; i++) {
      const car = (copy ?? state.fleet)[i];
      if (car === undefined) continue;
      let outcome: RentalOutcome;
      if (!(customersLeft > 0)) {
        outcome = "noCustomer";
      } else {
        customersLeft -= 1;
        const reference = washedReference(referencePrice(car), state.upgrades);
        const chance = boostedAcceptance(
          acceptanceChance(car.dailyPrice, reference),
          state.upgrades,
        );
        outcome = draw().next() < chance ? "rented" : "tooExpensive";
      }
      const rented = outcome === "rented";
      if (rented) {
        // A revenue booster pays double (shop.md); XP stays on the price.
        const earned = car.dailyPrice * revenueMultiplier({ ...state, day });
        cash += earned;
        todayRevenue += earned;
        if (!Number.isSafeInteger(cash) || !Number.isSafeInteger(todayRevenue)) {
          throw new SimOverflowError("cash");
        }
        xp += rentalXp(car.dailyPrice); // agency experience (agency-level.md)
      }
      if (car.rented !== rented || car.outcome !== outcome) {
        if (copy === null) copy = state.fleet.slice();
        copy[i] = { ...car, rented, outcome };
      }
    }
  };

  depart(start, Math.min(end, DAY_MINUTES));
  let minute = end;
  if (end >= DAY_MINUTES) {
    let costs = managersSalary(state.managers);
    for (const car of state.fleet) {
      costs += car.dailyCost;
      if (!Number.isSafeInteger(costs)) throw new SimOverflowError("cash");
    }
    cash -= costs;
    if (!Number.isSafeInteger(cash)) throw new SimOverflowError("cash");
    lastDay = { revenue: todayRevenue, costs };
    todayRevenue = 0;
    day += 1;
    if (!Number.isSafeInteger(day)) throw new SimOverflowError("day");
    minute = end - DAY_MINUTES;
    depart(0, minute);
  }
  return {
    seed: state.seed,
    rngState: lazy.rng === null ? state.rngState : lazy.rng.state(),
    day,
    minute,
    cash,
    todayRevenue,
    customersLeft,
    upgrades: state.upgrades,
    xp,
    managers: state.managers,
    dailyReward: state.dailyReward,
    shop: state.shop,
    fleet: copy ?? state.fleet,
    lastDay,
  };
}
