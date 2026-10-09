import {
  CAR_MODELS,
  CAR_MODEL_IDS,
  DEMAND_BASE,
  DEMAND_MAX_PCT,
  MAX_CAR_DAILY_COST,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  type CarModelId,
} from "./economy.js";
import { SimError } from "./errors.js";
import {
  RENTAL_OUTCOMES,
  type Car,
  type DayReport,
  type GameState,
  type RentalOutcome,
} from "./state.js";
import { DAY_MINUTES } from "./time.js";

/** Shape version of GameState. Bump on ANY shape change and add a migration. */
export const GAME_STATE_VERSION = 2;

export type GameStateIssue = "type" | "range" | "unknownModel" | "duplicateId" | "inconsistent";

export class InvalidGameStateError extends SimError {
  readonly code = "INVALID_GAME_STATE" as const;
  readonly path: string;
  readonly issue: GameStateIssue;

  constructor(path: string, issue: GameStateIssue) {
    super(`invalid game state at ${path} (${issue})`);
    this.name = "InvalidGameStateError";
    this.path = path;
    this.issue = issue;
  }
}

export class UnsupportedGameStateVersionError extends SimError {
  readonly code = "UNSUPPORTED_STATE_VERSION" as const;
  readonly version: unknown;
  readonly newer: boolean;

  constructor(version: unknown, newer: boolean) {
    super("unsupported game state version");
    this.name = "UnsupportedGameStateVersionError";
    this.version = version;
    this.newer = newer;
  }
}

const UINT32_MAX = 4_294_967_295;

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only (never the prototype chain). Getters that throw are caught by the caller. */
function own(obj: object, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  return (obj as Record<string, unknown>)[key];
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function int(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new InvalidGameStateError(path, "type");
  }
  if (value < min || value > max) throw new InvalidGameStateError(path, "range");
  // Normalise -0 to 0.
  return value === 0 ? 0 : value;
}

function parseCar(raw: unknown, index: number, seen: Set<number>): Car {
  const p = `fleet[${index}]`;
  if (!isRecord(raw)) throw new InvalidGameStateError(p, "type");
  const id = int(own(raw, "id"), `${p}.id`, 1, Number.MAX_SAFE_INTEGER);
  if (seen.has(id)) throw new InvalidGameStateError(`${p}.id`, "duplicateId");
  seen.add(id);

  let model: CarModelId | undefined;
  if (hasOwn(raw, "model")) {
    const m = own(raw, "model");
    if (typeof m !== "string") throw new InvalidGameStateError(`${p}.model`, "type");
    const found = CAR_MODEL_IDS.find((candidate) => candidate === m);
    if (found === undefined) throw new InvalidGameStateError(`${p}.model`, "unknownModel");
    model = found;
  }
  const dailyPrice = int(own(raw, "dailyPrice"), `${p}.dailyPrice`, 0, MAX_CAR_DAILY_PRICE);
  const dailyCost = int(own(raw, "dailyCost"), `${p}.dailyCost`, 0, MAX_CAR_DAILY_COST);
  if (model !== undefined && dailyCost !== CAR_MODELS[model].dailyCost) {
    throw new InvalidGameStateError(`${p}.dailyCost`, "inconsistent");
  }
  const rented = own(raw, "rented");
  if (typeof rented !== "boolean") throw new InvalidGameStateError(`${p}.rented`, "type");

  let outcome: RentalOutcome | undefined;
  if (hasOwn(raw, "outcome")) {
    const o = own(raw, "outcome");
    if (typeof o !== "string") throw new InvalidGameStateError(`${p}.outcome`, "type");
    outcome = RENTAL_OUTCOMES.find((candidate) => candidate === o);
    if (outcome === undefined) throw new InvalidGameStateError(`${p}.outcome`, "range");
    if ((outcome === "rented") !== rented) {
      throw new InvalidGameStateError(`${p}.outcome`, "inconsistent");
    }
  }

  const car: Car =
    model === undefined
      ? { id, dailyPrice, dailyCost, rented }
      : { id, model, dailyPrice, dailyCost, rented };
  return outcome === undefined ? car : { ...car, outcome };
}

/** Most customers a day can draw (full fleet, top of the demand range). */
const MAX_CUSTOMERS = DEMAND_BASE + Math.round((MAX_FLEET_SIZE * DEMAND_MAX_PCT) / 100);

function parse(raw: unknown): GameState {
  if (!isRecord(raw)) throw new InvalidGameStateError("$", "type");
  const seed = int(own(raw, "seed"), "seed", Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const rngState = int(own(raw, "rngState"), "rngState", 0, UINT32_MAX);
  const day = int(own(raw, "day"), "day", 0, Number.MAX_SAFE_INTEGER);
  const minute = int(own(raw, "minute"), "minute", 0, DAY_MINUTES - 1);
  const cash = int(own(raw, "cash"), "cash", Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const todayRevenue = int(own(raw, "todayRevenue"), "todayRevenue", 0, Number.MAX_SAFE_INTEGER);
  if (minute === 0 && todayRevenue !== 0) {
    throw new InvalidGameStateError("todayRevenue", "inconsistent");
  }
  const customersLeft = int(own(raw, "customersLeft"), "customersLeft", 0, MAX_CUSTOMERS);

  const rawFleet = own(raw, "fleet");
  if (!Array.isArray(rawFleet)) throw new InvalidGameStateError("fleet", "type");
  const length: number = rawFleet.length;
  if (length > MAX_FLEET_SIZE) throw new InvalidGameStateError("fleet", "range");
  const items: unknown[] = rawFleet;
  const seen = new Set<number>();
  const fleet: Car[] = [];
  for (let i = 0; i < length; i++) fleet.push(parseCar(items[i], i, seen));

  const rawLast = own(raw, "lastDay");
  let lastDay: DayReport | null;
  if (rawLast === null) {
    lastDay = null;
  } else if (isRecord(rawLast)) {
    lastDay = {
      revenue: int(own(rawLast, "revenue"), "lastDay.revenue", 0, Number.MAX_SAFE_INTEGER),
      costs: int(own(rawLast, "costs"), "lastDay.costs", 0, Number.MAX_SAFE_INTEGER),
    };
  } else {
    throw new InvalidGameStateError("lastDay", "type");
  }
  if ((lastDay === null) !== (day === 0))
    throw new InvalidGameStateError("lastDay", "inconsistent");

  return { seed, rngState, day, minute, cash, todayRevenue, customersLeft, fleet, lastDay };
}

/** v1 → v2: adds `customersLeft` (generous: one per car for the rest of the day). */
function migrateV1(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const fleet = own(raw, "fleet");
  const count = Array.isArray(fleet) ? Math.min(fleet.length, MAX_CUSTOMERS) : 0;
  return { ...raw, customersLeft: count };
}

/** Pure. Returns a fresh, normalised copy (known fields only) or throws InvalidGameStateError. */
export function validateGameState(raw: unknown): GameState {
  try {
    return parse(raw);
  } catch (error) {
    if (error instanceof InvalidGameStateError) throw error;
    // Throwing getters, revoked proxies, exotic objects.
    throw new InvalidGameStateError("$", "type");
  }
}

/** Pure. Migrates from `stateVersion` to GAME_STATE_VERSION (none in v1), then validates. */
export function restoreGameState(raw: unknown, stateVersion: unknown): GameState {
  if (
    typeof stateVersion !== "number" ||
    !Number.isSafeInteger(stateVersion) ||
    stateVersion < 1 ||
    stateVersion > GAME_STATE_VERSION
  ) {
    const newer =
      typeof stateVersion === "number" &&
      Number.isSafeInteger(stateVersion) &&
      stateVersion > GAME_STATE_VERSION;
    throw new UnsupportedGameStateVersionError(stateVersion, newer);
  }
  let data = raw;
  if (stateVersion < 2) {
    try {
      data = migrateV1(data);
    } catch {
      throw new InvalidGameStateError("$", "type");
    }
  }
  return validateGameState(data);
}
