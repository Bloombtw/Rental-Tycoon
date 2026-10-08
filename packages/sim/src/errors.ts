export type SimErrorCode =
  "INVALID_DAYS" | "SIM_OVERFLOW" | "INVALID_FLEET" | "INVALID_SEED" | "INVALID_STARTING_CASH";

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

export class SimOverflowError extends SimError {
  readonly code = "SIM_OVERFLOW" as const;
  readonly field: "cash" | "day";

  constructor(field: "cash" | "day") {
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
