import { MAX_ACCEPTED_DAILY_PRICE, MAX_FLEET_SIZE } from "./economy.js";
import { InvalidMinutesError, SimOverflowError } from "./errors.js";
import type { Car, GameState } from "./state.js";

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
  let copy: Car[] | null = null;

  /** Processes departure slots in minutes [from, to). */
  const depart = (from: number, to: number): void => {
    if (to <= from) return;
    const first = Math.ceil(from / DEPARTURE_STAGGER_MINUTES);
    const limit = Math.min(state.fleet.length, MAX_FLEET_SIZE);
    for (let i = first; i < limit && i * DEPARTURE_STAGGER_MINUTES < to; i++) {
      const car = state.fleet[i];
      if (car === undefined) continue;
      const rented = car.dailyPrice <= MAX_ACCEPTED_DAILY_PRICE;
      if (rented) {
        cash += car.dailyPrice;
        todayRevenue += car.dailyPrice;
        if (!Number.isSafeInteger(cash) || !Number.isSafeInteger(todayRevenue)) {
          throw new SimOverflowError("cash");
        }
      }
      if (copy === null ? car.rented !== rented : copy[i]?.rented !== rented) {
        if (copy === null) copy = state.fleet.slice();
        copy[i] = { ...car, rented };
      }
    }
  };

  depart(start, Math.min(end, DAY_MINUTES));
  let minute = end;
  if (end >= DAY_MINUTES) {
    let costs = 0;
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
    rngState: state.rngState,
    day,
    minute,
    cash,
    todayRevenue,
    fleet: copy ?? state.fleet,
    lastDay,
  };
}
