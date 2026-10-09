import {
  CAR_MODELS,
  advanceMinutes,
  buyCar,
  activateBooster,
  buyUpgrade,
  claimDailyReward,
  grantPurchase,
  createGame,
  fireManager,
  hireManager,
  levelForXp,
  claimMission,
  setCarPrice,
  type BoosterId,
  type ManagerId,
  type Receipt,
  type UpgradeId,
  type CarId,
  type CarModelId,
  type Cents,
  type GameState,
} from "@rt/sim";
import { formatCents } from "../format.js";
import { dayBannerText, isSpeed, type Speed } from "./clock.js";
import {
  CAR_MODEL_LABELS,
  BOOSTER_LABELS,
  PURCHASE_FAILED_ERROR,
  MANAGER_LABELS,
  NEW_GAME_NOTICE,
  purchaseNotice,
  UPGRADE_LABELS,
  errorMessage,
  levelUpNotice,
  missionNotice,
} from "./messages.js";
import { offlineDays, playOffline, type OfflineReport } from "./offline.js";
import { initialTutorial, tutorialNext, type TutorialStep } from "./tutorial.js";

export const DEFAULT_SEED = 1;

export interface UiState {
  readonly game: GameState;
  /** French message of the last refused action. */
  readonly error: string | null;
  /** French message of the last successful action. */
  readonly notice: string | null;
  readonly speed: Speed;
  readonly paused: boolean;
  /** Has time ever run (used to highlight the "Reprendre" button). */
  readonly hasRun: boolean;
  /** "New day" toast text. */
  readonly dayBanner: string | null;
  /** Result of the last absence, shown until the player taps "Récupérer". Already in `game`. */
  readonly offline: OfflineReport | null;
  /** Guided first minute (tutorial.md); "done" once finished or skipped. */
  readonly tutorial: TutorialStep;
}

export type GameAction =
  | { type: "buyCar"; model: CarModelId }
  | { type: "setCarPrice"; carId: CarId; dailyPrice: Cents }
  | { type: "buyUpgrade"; upgrade: UpgradeId }
  | { type: "hireManager"; manager: ManagerId }
  | { type: "fireManager"; manager: ManagerId }
  | { type: "claimDailyReward"; today: number }
  | { type: "grantPurchase"; receipt: Receipt }
  | { type: "activateBooster"; booster: BoosterId }
  /** The live checkout could not start (network, endpoint down). */
  | { type: "purchaseFailed" }
  | { type: "claimMission"; slot: number }
  | { type: "advanceTime"; minutes: number }
  | { type: "setSpeed"; speed: Speed }
  | { type: "togglePause" }
  | { type: "pause" }
  | { type: "dismissMessage" }
  | { type: "dismissDayBanner" }
  | { type: "newGame"; seed: number }
  /** The player was away `elapsedMs` (closed app or background): play the offline days. */
  | { type: "returnAfter"; elapsedMs: number }
  | { type: "claimOffline" }
  | { type: "tutorialNext" }
  | { type: "skipTutorial" };

function isSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 2 ** 32;
}

export function initUiState(game?: GameState): UiState {
  const g = game ?? createGame(DEFAULT_SEED);
  return {
    game: g,
    error: null,
    notice: null,
    speed: 1,
    paused: true,
    hasRun: false,
    dayBanner: null,
    offline: null,
    tutorial: initialTutorial(g),
  };
}

/** Moves the tutorial forward from what the action did (tutorial.md). */
function advanceTutorial(prev: UiState, next: UiState, type: unknown): UiState {
  let step = next.tutorial;
  if (type === "skipTutorial") step = "done";
  else if (type === "tutorialNext") step = tutorialNext(step);
  else if (step === "buy" && next.game.fleet.length > 0) step = "price";
  else if (step === "price" && type === "setCarPrice" && next.game !== prev.game) step = "run";
  else if (step === "run" && !next.paused) step = "wait";
  else if (step === "wait" && next.game.day > prev.game.day) step = "report";
  return step === next.tutorial ? next : { ...next, tutorial: step };
}

/** Plays the offline days of an absence; a second absence before the claim adds up. */
function returnAfter(state: UiState, elapsedMs: unknown): UiState {
  const played = playOffline(state.game, offlineDays(elapsedMs));
  if (played === null) return state;
  const prev = state.offline;
  const report: OfflineReport =
    prev === null
      ? played.report
      : { days: prev.days + played.report.days, delta: prev.delta + played.report.delta };
  return {
    ...state,
    game: played.game,
    offline: report,
    paused: true,
    dayBanner: null,
    notice: null,
  };
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
    case "claimMission": {
      const r = claimMission(game, action.slot);
      return { game: r.state, notice: missionNotice([r.mission]) };
    }
    case "grantPurchase": {
      const next = grantPurchase(game, action.receipt);
      if (next === game) return { game, notice: "Achat déjà crédité." };
      return { game: next, notice: purchaseNotice(action.receipt.productId) };
    }
    case "activateBooster":
      return {
        game: activateBooster(game, action.booster),
        notice: `${BOOSTER_LABELS[action.booster]} activé !`,
      };
    case "claimDailyReward": {
      const next = claimDailyReward(game, action.today);
      return {
        game: next,
        notice: `Prime du jour encaissée : +${formatCents(next.cash - game.cash)}.`,
      };
    }
    case "hireManager":
      return {
        game: hireManager(game, action.manager),
        notice: `${MANAGER_LABELS[action.manager]} embauché.`,
      };
    case "fireManager":
      return {
        game: fireManager(game, action.manager),
        notice: `${MANAGER_LABELS[action.manager]} licencié.`,
      };
    case "buyUpgrade": {
      const next = buyUpgrade(game, action.upgrade);
      const level = next.upgrades[action.upgrade];
      return {
        game: next,
        notice: `${UPGRADE_LABELS[action.upgrade]} : niveau ${String(level)} atteint.`,
      };
    }
    default:
      throw new Error("unknown action");
  }
}

function advanceTime(state: UiState, minutes: unknown): UiState {
  if (state.paused) return state;
  try {
    const next = advanceMinutes(state.game, minutes as number);
    if (next === state.game) return state;
    const closed = next.day > state.game.day;
    const before = levelForXp(state.game.xp);
    const after = levelForXp(next.xp);
    return {
      ...state,
      game: next,
      dayBanner: closed ? dayBannerText(next.day, next.lastDay) : state.dayBanner,
      ...(after > before ? { notice: levelUpNotice(after), error: null } : {}),
    };
  } catch (err) {
    return { ...state, paused: true, error: errorMessage(err), notice: null };
  }
}

/** Never throws: any failure while reading a forged action leaves the state untouched. */
export function gameReducer(state: UiState, action: GameAction): UiState {
  try {
    const next = reduce(state, action);
    const type: unknown = (action as { type?: unknown } | null | undefined)?.type;
    // A new game restarts the tutorial from its own initial step.
    return type === "newGame" ? next : advanceTutorial(state, next, type);
  } catch {
    return state;
  }
}

function reduce(state: UiState, action: GameAction): UiState {
  const type: unknown = (action as { type?: unknown } | null | undefined)?.type;
  switch (type) {
    case "newGame": {
      const seed: unknown = (action as { seed?: unknown }).seed;
      if (!isSeed(seed)) return state;
      return { ...initUiState(createGame(seed)), notice: NEW_GAME_NOTICE };
    }
    case "purchaseFailed":
      return { ...state, notice: null, error: PURCHASE_FAILED_ERROR };
    case "returnAfter":
      return returnAfter(state, (action as { elapsedMs?: unknown }).elapsedMs);
    case "claimOffline":
      return state.offline === null ? state : { ...state, offline: null };
    case "dismissMessage":
      return { ...state, error: null, notice: null };
    case "dismissDayBanner":
      return state.dayBanner === null ? state : { ...state, dayBanner: null };
    case "advanceTime":
      return advanceTime(state, (action as { minutes?: unknown }).minutes);
    case "setSpeed": {
      const speed: unknown = (action as { speed?: unknown }).speed;
      if (!isSpeed(speed)) return state;
      return { ...state, speed, paused: false, hasRun: true };
    }
    case "togglePause":
      return state.paused ? { ...state, paused: false, hasRun: true } : { ...state, paused: true };
    case "pause":
      return state.paused ? state : { ...state, paused: true };
    case "buyCar":
    case "setCarPrice":
    case "buyUpgrade":
    case "hireManager":
    case "fireManager":
    case "claimDailyReward":
    case "grantPurchase":
    case "activateBooster":
    case "claimMission":
      try {
        const result = applyAction(state.game, action);
        return { ...state, game: result.game, error: null, notice: result.notice };
      } catch (err) {
        return { ...state, error: errorMessage(err), notice: null };
      }
    default:
      return state;
  }
}
