import { MAX_ADVANCE_DAYS } from "./economy.js";
import { InvalidDaysError, SimOverflowError } from "./errors.js";
import type { GameState } from "./state.js";
import { advanceMinutes, DAY_MINUTES } from "./time.js";

/** Advances the simulation to the next opening. Pure: same input, same output. */
export function tick(state: GameState): GameState {
  const m = state.minute;
  if (typeof m !== "number" || !Number.isSafeInteger(m) || m < 0 || m >= DAY_MINUTES) {
    throw new SimOverflowError("minute");
  }
  return advanceMinutes(state, DAY_MINUTES - m);
}

/** Applies `tick` `days` times. `days` is validated before any simulation. */
export function advance(state: GameState, days: number): GameState {
  if (
    typeof days !== "number" ||
    !Number.isSafeInteger(days) ||
    days < 0 ||
    days > MAX_ADVANCE_DAYS
  ) {
    throw new InvalidDaysError(days);
  }
  let current = state;
  for (let i = 0; i < days; i++) current = tick(current);
  return current;
}
