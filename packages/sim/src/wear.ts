import { CAR_MODELS } from "./economy.js";
import {
  CarBrokenError,
  CarInServiceError,
  CarNotBrokenError,
  CarRentedOutError,
  InsufficientCashError,
  SimOverflowError,
  UnknownCarError,
} from "./errors.js";
import type { Car, CarId, Cents, GameState } from "./state.js";
import { departureMinute, returnMinute } from "./time.js";

/* Resale, wear, breakdowns, repair and service (resale-wear.md). All pure. */

/** Purchase price of a car without a model (test fixtures). */
export const FIXTURE_PURCHASE_PRICE: Cents = 4_000_00;

/** Condition a repaired car comes back with at least. */
export const REPAIR_MIN_CONDITION = 50;
/** The mechanic services cars whose condition is below this percentage. */
export const MECHANIC_SERVICE_BELOW = 40;
/** Wear at closing: a rented car loses `WEAR_RENTED_MIN..WEAR_RENTED_MAX`, a parked one 1 point. */
export const WEAR_RENTED_MIN = 2;
export const WEAR_RENTED_MAX = 5;
export const WEAR_PARKED = 1;

const EURO: Cents = 100;
const RESALE_ROUND: Cents = 100 * EURO;

/** Days owned. 0 when absent or corrupt. */
export function carAge(car: Car): number {
  const age = car.age;
  return typeof age === "number" && Number.isSafeInteger(age) && age > 0 ? age : 0;
}

/** Condition in percent (0..100). 100 when absent or corrupt. */
export function carCondition(car: Car): number {
  const c = car.condition;
  if (typeof c !== "number" || !Number.isFinite(c)) return 100;
  return Math.min(100, Math.max(0, Math.round(c)));
}

export function isBroken(car: Car): boolean {
  return car.broken === true;
}

function purchasePriceOf(car: Car): Cents {
  const model = car.model;
  return model !== undefined && Object.hasOwn(CAR_MODELS, model)
    ? CAR_MODELS[model].purchasePrice
    : FIXTURE_PURCHASE_PRICE;
}

/** Rounds num / den to the nearest integer (halves up). Integers only, so no float drift. */
function roundDiv(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/** Repair price: 6 % of the purchase price, to the euro. */
export function repairCost(car: Car): Cents {
  return roundDiv(purchasePriceOf(car) * 6, 100 * EURO) * EURO;
}

/** Service price: 0.3 % of the purchase price per missing point of condition, to the euro. 0 at 100 %. */
export function serviceCost(car: Car): Cents {
  const missing = 100 - carCondition(car);
  return roundDiv(purchasePriceOf(car) * missing * 3, 100_000) * EURO;
}

/** What the mechanic pays for a repair: half the price. */
export function mechanicRepairCost(car: Car): Cents {
  return roundDiv(repairCost(car), 2);
}

/** What the mechanic pays for a service: half the price (labour is free). */
export function mechanicServiceCost(car: Car): Cents {
  return roundDiv(serviceCost(car), 2);
}

/** Probability that a working car breaks down at opening: 0 % when new, 25 % at 0 %. */
export function breakdownChance(car: Car): number {
  return (100 - carCondition(car)) / 400;
}

/**
 * Resale value: purchase price × max(20 %, 85 % − 0.4 % × age) × (50 % + 50 % × condition / 100),
 * rounded to 100 €. A broken car is worth 60 % of that (again rounded to 100 €).
 */
export function resaleValue(car: Car): Cents {
  const ageFactor = Math.max(200, 850 - 4 * carAge(car)); // per mille
  const conditionFactor = 5_000 + 50 * carCondition(car); // per ten thousand
  const value =
    roundDiv(purchasePriceOf(car) * ageFactor * conditionFactor, 10_000_000 * RESALE_ROUND) *
    RESALE_ROUND;
  return isBroken(car) ? roundDiv(value * 6, 10 * RESALE_ROUND) * RESALE_ROUND : value;
}

function indexOfCar(state: GameState, carId: CarId): number {
  const index = state.fleet.findIndex((car) => car.id === carId);
  if (index === -1) throw new UnknownCarError(carId);
  return index;
}

function pay(state: GameState, cost: Cents): Cents {
  if (!Number.isSafeInteger(state.cash)) throw new SimOverflowError("cash");
  if (state.cash < cost) throw new InsufficientCashError(cost, state.cash);
  return state.cash - cost;
}

function replaceAt(state: GameState, index: number, car: Car | null): readonly Car[] {
  return car === null
    ? state.fleet.filter((_, i) => i !== index)
    : state.fleet.map((c, i) => (i === index ? car : c));
}

/** A car after its repair: no more breakdown, condition at least 50 %. */
export function repairedCar(car: Car): Car {
  // The "broken" outcome of the last slot is obsolete once the car runs again.
  const { outcome, ...rest } = car;
  return {
    ...(outcome === undefined || outcome === "broken" ? rest : car),
    broken: false,
    condition: Math.max(carCondition(car), REPAIR_MIN_CONDITION),
  };
}

/** Repairs a broken car: pays `repairCost`, the breakdown goes, the condition is at least 50 %. */
export function repairCar(state: GameState, carId: CarId): GameState {
  const index = indexOfCar(state, carId);
  const car = state.fleet[index];
  if (car === undefined) throw new UnknownCarError(carId);
  if (!isBroken(car)) throw new CarNotBrokenError(carId);
  const cash = pay(state, repairCost(car));
  const repaired = repairedCar(car);
  return { ...state, cash, fleet: replaceAt(state, index, repaired) };
}

/** Services a car: pays `serviceCost`, the condition goes back to 100 %. */
export function serviceCar(state: GameState, carId: CarId): GameState {
  const index = indexOfCar(state, carId);
  const car = state.fleet[index];
  if (car === undefined) throw new UnknownCarError(carId);
  if (isBroken(car)) throw new CarBrokenError(carId);
  if (carCondition(car) >= 100) throw new CarInServiceError(carId);
  const cash = pay(state, serviceCost(car));
  return { ...state, cash, fleet: replaceAt(state, index, { ...car, condition: 100 }) };
}

/** True when the car at `index` is out on a rental at the state's time (between departure and return). */
function isOutOnRental(car: Car, index: number, minute: number): boolean {
  const dep = departureMinute(index);
  const ret = returnMinute(index);
  if (dep === null || ret === null || car.rented !== true) return false;
  // The state's minute has not been processed yet: a slot is processed once dep < minute.
  return dep < minute && minute < ret;
}

/** False while the car is out on a rental; false for an unknown car. */
export function canSellNow(state: GameState, carId: CarId): boolean {
  const index = state.fleet.findIndex((car) => car.id === carId);
  const car = state.fleet[index];
  if (car === undefined) return false;
  return !isOutOnRental(car, index, state.minute);
}

/** Sells a car: credits `resaleValue`, the car leaves the fleet. Its id is never reused. */
export function sellCar(state: GameState, carId: CarId): GameState {
  const index = indexOfCar(state, carId);
  const car = state.fleet[index];
  if (car === undefined) throw new UnknownCarError(carId);
  if (isOutOnRental(car, index, state.minute)) throw new CarRentedOutError(carId);
  if (!Number.isSafeInteger(state.cash)) throw new SimOverflowError("cash");
  const cash = state.cash + resaleValue(car);
  if (!Number.isSafeInteger(cash)) throw new SimOverflowError("cash");
  return { ...state, cash, fleet: replaceAt(state, index, null) };
}
