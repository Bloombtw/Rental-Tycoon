import type { GameState } from "./state.js";

/** Advances the simulation by one day. Pure: same input, same output. */
export function tick(state: GameState): GameState {
  return { ...state, day: state.day + 1 };
}
