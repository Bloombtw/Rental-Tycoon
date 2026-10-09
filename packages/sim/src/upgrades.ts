import { MAX_FLEET_SIZE } from "./economy.js";
import {
  InsufficientCashError,
  SimOverflowError,
  UnknownUpgradeError,
  UpgradeMaxedError,
} from "./errors.js";
import type { Cents, GameState } from "./state.js";

export type UpgradeId = "parking" | "counter" | "ads" | "wash";

/** Canonical display order. */
export const UPGRADE_IDS: readonly UpgradeId[] = Object.freeze([
  "parking",
  "counter",
  "ads",
  "wash",
] as const);

export type Upgrades = Readonly<Record<UpgradeId, number>>;

export interface UpgradeSpec {
  readonly id: UpgradeId;
  readonly maxLevel: number;
  readonly baseCost: Cents;
  /** Cost multiplier per level, in percent. */
  readonly growthPct: number;
}

/** Tunable placeholders (upgrades.md). Deep-frozen. */
export const UPGRADES: Readonly<Record<UpgradeId, UpgradeSpec>> = Object.freeze({
  parking: Object.freeze({ id: "parking", maxLevel: 9, baseCost: 2_000_00, growthPct: 160 }),
  counter: Object.freeze({ id: "counter", maxLevel: 5, baseCost: 3_000_00, growthPct: 180 }),
  ads: Object.freeze({ id: "ads", maxLevel: 5, baseCost: 2_500_00, growthPct: 170 }),
  wash: Object.freeze({ id: "wash", maxLevel: 5, baseCost: 5_000_00, growthPct: 190 }),
} as const satisfies Record<UpgradeId, UpgradeSpec>);

export const NO_UPGRADES: Upgrades = Object.freeze({ parking: 0, counter: 0, ads: 0, wash: 0 });

export const BASE_PARKING_SPOTS = 5;
export const PARKING_SPOTS_PER_LEVEL = 5;
/** Acceptance multiplier per counter level, in percent. */
export const COUNTER_BONUS_PCT = 5;
/** Highest acceptance the counter can reach. */
export const MAX_ACCEPTANCE = 0.99;
/** Demand points (percent of the fleet) added per ads level. */
export const ADS_BONUS_PCT = 10;
/** Reference price bonus per wash level, in percent. */
export const WASH_BONUS_PCT = 10;

const ROUND_TO: Cents = 100_00;

function level(upgrades: Upgrades | undefined, id: UpgradeId): number {
  const v = upgrades?.[id];
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : 0;
}

/** Price of the next level of `id` when it is at `currentLevel`, rounded to 100 €. Integer cents. */
export function upgradeCost(id: UpgradeId, currentLevel: number): Cents {
  const spec = UPGRADES[id];
  const n = Number.isSafeInteger(currentLevel) && currentLevel > 0 ? currentLevel : 0;
  let cost = spec.baseCost;
  for (let i = 0; i < n; i++) cost = Math.round((cost * spec.growthPct) / 100);
  return Math.max(ROUND_TO, Math.round(cost / ROUND_TO) * ROUND_TO);
}

/** Number of cars the parking holds. */
export function fleetCapacity(upgrades: Upgrades | undefined): number {
  return Math.min(
    MAX_FLEET_SIZE,
    BASE_PARKING_SPOTS + PARKING_SPOTS_PER_LEVEL * level(upgrades, "parking"),
  );
}

/** Smallest parking level that holds `fleetSize` cars. */
export function parkingLevelFor(fleetSize: number): number {
  const extra = Math.max(0, fleetSize - BASE_PARKING_SPOTS);
  return Math.min(UPGRADES.parking.maxLevel, Math.ceil(extra / PARKING_SPOTS_PER_LEVEL));
}

/** Acceptance after the counter bonus (a refused-at-any-price chance of 0 stays 0). */
export function boostedAcceptance(chance: number, upgrades: Upgrades | undefined): number {
  if (!(chance > 0)) return 0;
  const boosted = chance * (1 + (COUNTER_BONUS_PCT * level(upgrades, "counter")) / 100);
  return Math.min(Math.max(chance, MAX_ACCEPTANCE), boosted, 1);
}

/** Reference price after the wash bonus. Integer cents. */
export function washedReference(reference: Cents, upgrades: Upgrades | undefined): Cents {
  return Math.round((reference * (100 + WASH_BONUS_PCT * level(upgrades, "wash"))) / 100);
}

/** Demand percentage points added by advertising. */
export function adsBonusPct(upgrades: Upgrades | undefined): number {
  return ADS_BONUS_PCT * level(upgrades, "ads");
}

/** Buys the next level of an upgrade. Pure: returns a new state. */
export function buyUpgrade(state: GameState, id: UpgradeId): GameState {
  if (typeof id !== "string" || !Object.hasOwn(UPGRADES, id)) throw new UnknownUpgradeError(id);
  const current = level(state.upgrades, id);
  if (current >= UPGRADES[id].maxLevel) throw new UpgradeMaxedError(id);
  if (!Number.isSafeInteger(state.cash)) throw new SimOverflowError("cash");
  const cost = upgradeCost(id, current);
  if (state.cash < cost) throw new InsufficientCashError(cost, state.cash);
  return {
    ...state,
    cash: state.cash - cost,
    upgrades: { ...NO_UPGRADES, ...state.upgrades, [id]: current + 1 },
  };
}
