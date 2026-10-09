import type { Cents } from "./state.js";

export type SimErrorCode =
  | "INVALID_DAYS"
  | "INVALID_MINUTES"
  | "SIM_OVERFLOW"
  | "INVALID_FLEET"
  | "INVALID_SEED"
  | "INVALID_STARTING_CASH"
  | "INSUFFICIENT_CASH"
  | "FLEET_FULL"
  | "UNKNOWN_CAR_MODEL"
  | "UNKNOWN_CAR"
  | "INVALID_PRICE"
  | "INVALID_GAME_STATE"
  | "UNSUPPORTED_STATE_VERSION"
  | "UNKNOWN_UPGRADE"
  | "UPGRADE_MAXED"
  | "MODEL_LOCKED"
  | "UNKNOWN_MANAGER"
  | "MANAGER_STATE"
  | "REWARD_ALREADY_CLAIMED";

/** Base class of every typed sim error. Extends RangeError for compatibility. */
export abstract class SimError extends RangeError {
  abstract readonly code: SimErrorCode;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidDaysError extends SimError {
  readonly code = "INVALID_DAYS" as const;
  readonly days: unknown;

  constructor(days: unknown) {
    super("days must be a safe integer between 0 and MAX_ADVANCE_DAYS");
    this.name = "InvalidDaysError";
    this.days = days;
  }
}

export class InvalidMinutesError extends SimError {
  readonly code = "INVALID_MINUTES" as const;
  readonly minutes: unknown;

  constructor(minutes: unknown) {
    super("minutes must be a safe integer between 0 and MAX_ADVANCE_MINUTES");
    this.name = "InvalidMinutesError";
    this.minutes = minutes;
  }
}

export class SimOverflowError extends SimError {
  readonly code = "SIM_OVERFLOW" as const;
  readonly field: "cash" | "day" | "carId" | "minute";

  constructor(field: "cash" | "day" | "carId" | "minute") {
    super(`${field} left the safe integer range`);
    this.name = "SimOverflowError";
    this.field = field;
  }
}

export class InvalidFleetError extends SimError {
  readonly code = "INVALID_FLEET" as const;
  readonly index: number | null;
  readonly field: "fleet" | "dailyPrice" | "dailyCost";

  constructor(index: number | null, field: "fleet" | "dailyPrice" | "dailyCost") {
    super(
      index === null ? `invalid fleet (${field})` : `invalid fleet: car ${index}, field ${field}`,
    );
    this.name = "InvalidFleetError";
    this.index = index;
    this.field = field;
  }
}

export class InvalidSeedError extends SimError {
  readonly code = "INVALID_SEED" as const;
  readonly seed: unknown;

  constructor(seed: unknown) {
    super("seed must be a safe integer");
    this.name = "InvalidSeedError";
    this.seed = seed;
  }
}

export class InvalidStartingCashError extends SimError {
  readonly code = "INVALID_STARTING_CASH" as const;
  readonly startingCash: unknown;

  constructor(startingCash: unknown) {
    super("startingCash must be a non-negative integer of cents");
    this.name = "InvalidStartingCashError";
    this.startingCash = startingCash;
  }
}

export class InsufficientCashError extends SimError {
  readonly code = "INSUFFICIENT_CASH" as const;
  readonly required: Cents;
  readonly available: Cents;

  constructor(required: Cents, available: Cents) {
    super("not enough cash for this purchase");
    this.name = "InsufficientCashError";
    this.required = required;
    this.available = available;
  }
}

export class UnknownUpgradeError extends SimError {
  readonly code = "UNKNOWN_UPGRADE" as const;
  readonly upgrade: unknown;

  constructor(upgrade: unknown) {
    super("unknown upgrade");
    this.name = "UnknownUpgradeError";
    this.upgrade = upgrade;
  }
}

export class UpgradeMaxedError extends SimError {
  readonly code = "UPGRADE_MAXED" as const;
  readonly upgrade: string;

  constructor(upgrade: string) {
    super("the upgrade is at its maximum level");
    this.name = "UpgradeMaxedError";
    this.upgrade = upgrade;
  }
}

export class FleetFullError extends SimError {
  readonly code = "FLEET_FULL" as const;
  readonly maxFleetSize: number;

  constructor(maxFleetSize: number) {
    super("the fleet is full");
    this.name = "FleetFullError";
    this.maxFleetSize = maxFleetSize;
  }
}

export class UnknownManagerError extends SimError {
  readonly code = "UNKNOWN_MANAGER" as const;
  readonly manager: unknown;

  constructor(manager: unknown) {
    super("unknown manager");
    this.name = "UnknownManagerError";
    this.manager = manager;
  }
}

/** Hiring someone already hired, or firing someone who is not. */
export class ManagerStateError extends SimError {
  readonly code = "MANAGER_STATE" as const;
  readonly manager: string;
  readonly alreadyHired: boolean;

  constructor(manager: string, alreadyHired: boolean) {
    super(alreadyHired ? "manager already hired" : "manager not hired");
    this.name = "ManagerStateError";
    this.manager = manager;
    this.alreadyHired = alreadyHired;
  }
}

export class RewardAlreadyClaimedError extends SimError {
  readonly code = "REWARD_ALREADY_CLAIMED" as const;
  readonly day: unknown;

  constructor(day: unknown) {
    super("daily reward already claimed or invalid day");
    this.name = "RewardAlreadyClaimedError";
    this.day = day;
  }
}

export class ModelLockedError extends SimError {
  readonly code = "MODEL_LOCKED" as const;
  readonly model: string;
  readonly requiredLevel: number;

  constructor(model: string, requiredLevel: number) {
    super("this car model is not unlocked yet");
    this.name = "ModelLockedError";
    this.model = model;
    this.requiredLevel = requiredLevel;
  }
}

export class UnknownCarModelError extends SimError {
  readonly code = "UNKNOWN_CAR_MODEL" as const;
  readonly model: unknown;

  constructor(model: unknown) {
    super("unknown car model");
    this.name = "UnknownCarModelError";
    this.model = model;
  }
}

export class UnknownCarError extends SimError {
  readonly code = "UNKNOWN_CAR" as const;
  readonly carId: unknown;

  constructor(carId: unknown) {
    super("unknown car");
    this.name = "UnknownCarError";
    this.carId = carId;
  }
}

export class InvalidPriceError extends SimError {
  readonly code = "INVALID_PRICE" as const;
  readonly dailyPrice: unknown;

  constructor(dailyPrice: unknown) {
    super("dailyPrice must be a safe integer of cents between 0 and MAX_CAR_DAILY_PRICE");
    this.name = "InvalidPriceError";
    this.dailyPrice = dailyPrice;
  }
}
