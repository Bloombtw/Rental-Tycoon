import type { Cents } from "./state.js";

/** Tunable placeholders: always reference by name. */
export const MAX_CAR_DAILY_PRICE: Cents = 1_000_00;
export const MAX_CAR_DAILY_COST: Cents = 1_000_00;
export const MAX_FLEET_SIZE = 50;
export const MAX_ADVANCE_DAYS = 3_650;

export type CarModelId =
  "used" | "compact" | "hybrid" | "suv" | "van" | "electric" | "sport" | "luxury";

export interface CarModel {
  readonly id: CarModelId;
  readonly purchasePrice: Cents;
  readonly dailyCost: Cents;
  readonly defaultDailyPrice: Cents;
  /** Agency level that unlocks the model (agency-level.md). */
  readonly unlockLevel: number;
}

/** Canonical display order (also the unlock order). */
export const CAR_MODEL_IDS: readonly CarModelId[] = Object.freeze([
  "used",
  "compact",
  "hybrid",
  "suv",
  "van",
  "electric",
  "sport",
  "luxury",
] as const);

const model = (
  id: CarModelId,
  purchasePrice: Cents,
  dailyCost: Cents,
  defaultDailyPrice: Cents,
  unlockLevel: number,
): CarModel => Object.freeze({ id, purchasePrice, dailyCost, defaultDailyPrice, unlockLevel });

/** Tunable placeholders. Deep-frozen. */
export const CAR_MODELS: Readonly<Record<CarModelId, CarModel>> = Object.freeze({
  used: model("used", 4_000_00, 60_00, 90_00, 1),
  compact: model("compact", 9_000_00, 25_00, 60_00, 1),
  hybrid: model("hybrid", 16_000_00, 10_00, 120_00, 1),
  suv: model("suv", 22_000_00, 30_00, 150_00, 2),
  van: model("van", 18_000_00, 35_00, 140_00, 3),
  electric: model("electric", 28_000_00, 8_00, 160_00, 4),
  sport: model("sport", 45_000_00, 50_00, 260_00, 5),
  luxury: model("luxury", 70_000_00, 60_00, 380_00, 6),
} satisfies Record<CarModelId, CarModel>);

/* ------------------------------------------------------------------ agency level (agency-level.md) */

export const MAX_AGENCY_LEVEL = 10;
/** Total XP needed to reach level n (index n − 1); level 1 is free. 1 XP per euro of rental revenue. */
export const LEVEL_XP: readonly number[] = Object.freeze([
  0, 1_500, 4_000, 9_000, 18_000, 35_000, 60_000, 100_000, 160_000, 250_000,
]);

/** Agency level for a total XP (1..MAX_AGENCY_LEVEL). Garbage gives 1. */
export function levelForXp(xp: unknown): number {
  if (typeof xp !== "number" || !Number.isFinite(xp) || xp <= 0) return 1;
  let level = 1;
  for (let n = 2; n <= MAX_AGENCY_LEVEL; n++) {
    const need = LEVEL_XP[n - 1];
    if (need !== undefined && xp >= need) level = n;
  }
  return level;
}

/** XP earned by renting a car at `dailyPrice`: one per whole euro. */
export function rentalXp(dailyPrice: Cents): number {
  return Number.isSafeInteger(dailyPrice) && dailyPrice > 0 ? Math.floor(dailyPrice / 100) : 0;
}

/* ------------------------------------------------------------------ demand (random-demand.md) */

/** Customers per day = DEMAND_BASE + round(fleet × r), r uniform in [MIN, MAX] percent. */
export const DEMAND_BASE = 1;
export const DEMAND_MIN_PCT = 70;
export const DEMAND_MAX_PCT = 115;
/** Reference price of a car without a model (test fixtures). */
export const FIXTURE_REFERENCE_PRICE: Cents = 90_00;

/** Acceptance curve: [price / reference, probability], piecewise linear, flat outside. */
const ACCEPTANCE_CURVE: readonly (readonly [number, number])[] = [
  [0.5, 0.98],
  [1, 0.85],
  [1.5, 0.4],
  [2, 0],
];

/** Reference ("advised") daily price of a car. */
export function referencePrice(car: { readonly model?: CarModelId | undefined }): Cents {
  const model = car.model;
  return model !== undefined && Object.hasOwn(CAR_MODELS, model)
    ? CAR_MODELS[model].defaultDailyPrice
    : FIXTURE_REFERENCE_PRICE;
}

/** Probability (0..1) that a customer accepts `price` for a car whose reference price is `reference`. */
export function acceptanceChance(price: Cents, reference: Cents): number {
  if (!Number.isFinite(price) || !Number.isFinite(reference) || reference <= 0) return 0;
  const x = price / reference;
  const first = ACCEPTANCE_CURVE[0];
  const last = ACCEPTANCE_CURVE[ACCEPTANCE_CURVE.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < ACCEPTANCE_CURVE.length; i++) {
    const a = ACCEPTANCE_CURVE[i - 1];
    const b = ACCEPTANCE_CURVE[i];
    if (a === undefined || b === undefined) continue;
    if (x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return last[1];
}
