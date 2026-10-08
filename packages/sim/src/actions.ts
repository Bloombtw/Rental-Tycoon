import { CAR_MODELS, MAX_CAR_DAILY_PRICE, MAX_FLEET_SIZE, type CarModelId } from "./economy.js";
import {
  FleetFullError,
  InsufficientCashError,
  InvalidPriceError,
  SimOverflowError,
  UnknownCarError,
  UnknownCarModelError,
} from "./errors.js";
import type { Car, CarId, Cents, GameState } from "./state.js";

/** Buys a new car of the given model. Pure: returns a new state. */
export function buyCar(state: GameState, model: CarModelId): GameState {
  if (typeof model !== "string" || !Object.hasOwn(CAR_MODELS, model)) {
    throw new UnknownCarModelError(model);
  }
  const spec = CAR_MODELS[model];
  if (state.fleet.length >= MAX_FLEET_SIZE) throw new FleetFullError(MAX_FLEET_SIZE);
  if (!Number.isSafeInteger(state.cash)) throw new SimOverflowError("cash");
  if (state.cash < spec.purchasePrice) {
    throw new InsufficientCashError(spec.purchasePrice, state.cash);
  }
  let maxId = 0;
  for (const car of state.fleet) {
    // NaN propagates through Math.max and is caught below.
    maxId = Math.max(maxId, car.id);
  }
  const id = maxId + 1;
  if (!Number.isSafeInteger(id)) throw new SimOverflowError("carId");
  const bought: Car = {
    id,
    model,
    dailyPrice: spec.defaultDailyPrice,
    dailyCost: spec.dailyCost,
    rented: false,
  };
  return {
    ...state,
    cash: state.cash - spec.purchasePrice,
    fleet: [...state.fleet, bought],
  };
}

/** Sets the daily price of the first car with this id. Pure: returns a new state. */
export function setCarPrice(state: GameState, carId: CarId, dailyPrice: Cents): GameState {
  const index = state.fleet.findIndex((car) => car.id === carId);
  if (index === -1) throw new UnknownCarError(carId);
  if (
    typeof dailyPrice !== "number" ||
    !Number.isSafeInteger(dailyPrice) ||
    dailyPrice < 0 ||
    dailyPrice > MAX_CAR_DAILY_PRICE
  ) {
    throw new InvalidPriceError(dailyPrice);
  }
  // Normalise -0 to +0 so the state survives a JSON round-trip unchanged.
  const price = dailyPrice === 0 ? 0 : dailyPrice;
  return {
    ...state,
    fleet: state.fleet.map((car, i) => (i === index ? { ...car, dailyPrice: price } : car)),
  };
}
