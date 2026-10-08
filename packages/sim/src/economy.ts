import type { Cents } from "./state.js";

/** Tunable placeholders: always reference by name. */
export const MAX_ACCEPTED_DAILY_PRICE: Cents = 150_00;
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
