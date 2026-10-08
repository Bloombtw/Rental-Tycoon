import { MAX_ACCEPTED_DAILY_PRICE, MAX_ADVANCE_DAYS } from "./economy.js";
import { InvalidDaysError, SimOverflowError } from "./errors.js";
import type { Car, GameState } from "./state.js";

/** Advances the simulation by one day. Pure: same input, same output. */
export function tick(state: GameState): GameState {
  const fleet: Car[] = [];
  let revenue = 0;
  let costs = 0;
  for (const car of state.fleet) {
    const rented = car.dailyPrice <= MAX_ACCEPTED_DAILY_PRICE;
    if (rented) revenue += car.dailyPrice;
    costs += car.dailyCost;
    fleet.push({ id: car.id, dailyPrice: car.dailyPrice, dailyCost: car.dailyCost, rented });
  }
  const net = revenue - costs;
  const cash = state.cash + net;
  const day = state.day + 1;
  if (!Number.isSafeInteger(cash)) throw new SimOverflowError("cash");
  if (!Number.isSafeInteger(day)) throw new SimOverflowError("day");
  if (
    !Number.isSafeInteger(revenue) ||
    !Number.isSafeInteger(costs) ||
    !Number.isSafeInteger(net)
  ) {
    throw new SimOverflowError("cash");
  }
  return { seed: state.seed, rngState: state.rngState, day, cash, fleet };
}

/** Applies `tick` `days` times. `days` is validated before any simulation. */
export function advance(state: GameState, days: number): GameState {
  if (
    typeof days !== "number" ||
    !Number.isSafeInteger(days) ||
    days < 0 ||
    days > MAX_ADVANCE_DAYS
  ) {
    throw new InvalidDaysError(days);
  }
  let current = state;
  for (let i = 0; i < days; i++) current = tick(current);
  return current;
}
