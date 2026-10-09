import type { Cents } from "./state.js";

/** Tunable placeholders: always reference by name. */
export const MAX_CAR_DAILY_PRICE: Cents = 1_000_00;
export const MAX_CAR_DAILY_COST: Cents = 1_000_00;
export const MAX_FLEET_SIZE = 50;
export const MAX_ADVANCE_DAYS = 3_650;

export type CarModelId = "used" | "compact" | "hybrid";

export interface CarModel {
  readonly id: CarModelId;
  readonly purchasePrice: Cents;
  readonly dailyCost: Cents;
  readonly defaultDailyPrice: Cents;
}

/** Canonical display order. */
export const CAR_MODEL_IDS: readonly CarModelId[] = Object.freeze([
  "used",
  "compact",
  "hybrid",
] as const);

/** Tunable placeholders. Deep-frozen. */
export const CAR_MODELS: Readonly<Record<CarModelId, CarModel>> = Object.freeze({
  used: Object.freeze({
    id: "used",
    purchasePrice: 4_000_00,
    dailyCost: 60_00,
    defaultDailyPrice: 90_00,
  }),
  compact: Object.freeze({
    id: "compact",
    purchasePrice: 9_000_00,
    dailyCost: 25_00,
    defaultDailyPrice: 60_00,
  }),
  hybrid: Object.freeze({
    id: "hybrid",
    purchasePrice: 16_000_00,
    dailyCost: 10_00,
    defaultDailyPrice: 120_00,
  }),
} as const satisfies Record<CarModelId, CarModel>);

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
