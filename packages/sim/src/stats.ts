import type { Car, Cents } from "./state.js";

/** One closed day (stats.md). */
export interface DayRecord {
  readonly day: number;
  readonly revenue: Cents;
  readonly costs: Cents;
  /** Cash after the closing. */
  readonly cash: Cents;
}

/** Cumulative rentals and revenue of one model. */
export interface ModelStat {
  readonly rentals: number;
  readonly revenue: Cents;
}

export const MAX_HISTORY_DAYS = 60;

/** Key of `GameState.modelStats` for a car: its model id, or "other". */
export function modelStatKey(car: Car): string {
  return car.model ?? "other";
}
