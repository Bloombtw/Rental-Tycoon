import {
  CAR_MODELS,
  buyCar,
  createGame,
  setCarPrice,
  tick,
  type CarId,
  type CarModelId,
  type Cents,
  type GameState,
} from "@rt/sim";
import { formatCents } from "../format.js";
import { CAR_MODEL_LABELS, errorMessage } from "./messages.js";

export const DEFAULT_SEED = 1;

export interface UiState {
  readonly game: GameState;
  /** French message of the last refused action. */
  readonly error: string | null;
  /** French message of the last successful action. */
  readonly notice: string | null;
}

export type GameAction =
  | { type: "buyCar"; model: CarModelId }
  | { type: "setCarPrice"; carId: CarId; dailyPrice: Cents }
  | { type: "nextDay" }
  | { type: "dismissMessage" };

export function initUiState(game?: GameState): UiState {
  return { game: game ?? createGame(DEFAULT_SEED), error: null, notice: null };
}

function applyAction(game: GameState, action: GameAction): { game: GameState; notice: string } {
  switch (action.type) {
    case "buyCar": {
      const next = buyCar(game, action.model);
      const model = CAR_MODELS[action.model];
      const label = CAR_MODEL_LABELS[action.model];
      return {
        game: next,
        notice: `${label} achetée pour ${formatCents(model.purchasePrice)}.`,
      };
    }
    case "setCarPrice": {
      const next = setCarPrice(game, action.carId, action.dailyPrice);
      // Read the price back from the new state (the sim normalises -0 to +0).
      const applied = next.fleet.find((car) => car.id === action.carId);
      return {
        game: next,
        notice: `Prix de la voiture n°${action.carId} fixé à ${formatCents(applied?.dailyPrice ?? 0)}/jour.`,
      };
    }
    case "nextDay": {
      const next = tick(game);
      const net = next.lastDay ? next.lastDay.revenue - next.lastDay.costs : 0;
      return {
        game: next,
        notice: `Jour ${next.day} terminé : résultat ${formatCents(net)}.`,
      };
    }
    default:
      throw new Error("unknown action");
  }
}

export function gameReducer(state: UiState, action: GameAction): UiState {
  try {
    const type: unknown = (action as { type?: unknown } | null | undefined)?.type;
    if (type === "dismissMessage") {
      return { game: state.game, error: null, notice: null };
    }
    if (type !== "buyCar" && type !== "setCarPrice" && type !== "nextDay") return state;
    const result = applyAction(state.game, action);
    return { game: result.game, error: null, notice: result.notice };
  } catch (err) {
    return { game: state.game, error: errorMessage(err), notice: null };
  }
}
