import {
  CAR_MODELS,
  activeEvent,
  advanceMinutes,
  buyCar,
  activateBooster,
  buyUpgrade,
  claimDailyReward,
  grantPurchase,
  createGame,
  giveWelcomeGift,
  upgradeCost,
  fireManager,
  hireManager,
  levelForXp,
  claimMission,
  setCarPrice,
  repairCar,
  serviceCar,
  sellCar,
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
  EVENT_LABELS,
  eventBannerText,
  eventEffectText,
  levelUpNotice,
  missionNotice,
} from "./messages.js";
import { offlineDays, playOffline, type OfflineReport } from "./offline.js";
import { departuresBetween } from "../scene/gains.js";
import {
  initialTutorial,
  TUTORIAL_FAREWELL_FUNDS,
  TUTORIAL_START_FUNDS,
  isUiTutorialEvent,
  nextTutorialStep,
  settleTutorial,
  type TutorialEvent,
  type TutorialStep,
} from "./tutorial.js";

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
  /** "Event started" toast text (events.md). */
  readonly eventBanner: string | null;
  /** Result of the last absence, shown until the player taps "Récupérer". Already in `game`. */
  readonly offline: OfflineReport | null;
  /** Tutorial with René (tutorial.md); "done" once finished or skipped. */
  readonly tutorial: TutorialStep;
  /** The tutorial is shown again on an advanced game: it may be skipped. */
  readonly tutorialReplay: boolean;
  /** Cents earned by the first car seen leaving during the tutorial (René comments on it). */
  readonly tutorialGain: number | null;
}

export type GameAction =
  | { type: "buyCar"; model: CarModelId }
  | { type: "setCarPrice"; carId: CarId; dailyPrice: Cents }
  | { type: "repairCar"; carId: CarId }
  | { type: "serviceCar"; carId: CarId }
  | { type: "sellCar"; carId: CarId }
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
  | { type: "dismissEventBanner" }
  /** The player tapped the HUD event chip: remind the effect as a notice. */
  | { type: "eventInfo" }
  | { type: "newGame"; seed: number }
  /** The player was away `elapsedMs` (closed app or background): play the offline days. */
  | { type: "returnAfter"; elapsedMs: number }
  | { type: "claimOffline" }
  /** A UI event the tutorial listens to (tap, panel or drawer opened). */
  | { type: "tutorialEvent"; event: TutorialEvent }
  /** Only allowed when the tutorial is replayed. */
  | { type: "skipTutorial" }
  | { type: "replayTutorial" }
  /** Starts the clock again without changing the speed (tutorial steps where time must run). */
  | { type: "resume" };

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
    eventBanner: null,
    offline: null,
    tutorial: initialTutorial(g),
    tutorialReplay: false,
    tutorialGain: null,
  };
}

/** Tutorial events caused by what a successful action did (tutorial.md). */
function tutorialEvents(prev: UiState, next: UiState, type: unknown): TutorialEvent[] {
  switch (type) {
    case "buyCar":
      return next.error === null && next.game !== prev.game ? [{ type: "carBought" }] : [];
    case "setCarPrice":
      return next.error === null && next.game !== prev.game ? [{ type: "priceSet" }] : [];
    case "buyUpgrade":
      return next.error === null && next.game !== prev.game ? [{ type: "upgradeBought" }] : [];
    case "setSpeed":
      if (next === prev) return [];
      return [
        ...(prev.paused && !next.paused ? [{ type: "timeStarted" } as const] : []),
        { type: "speedSet", speed: next.speed },
      ];
    case "togglePause":
      return prev.paused && !next.paused ? [{ type: "timeStarted" }] : [];
    case "advanceTime": {
      if (next.game === prev.game) return [];
      const events: TutorialEvent[] = [];
      const first = departuresBetween(prev.game, next.game)[0];
      if (first !== undefined) events.push({ type: "carDeparted", amount: first.amount });
      if (next.game.day > prev.game.day) events.push({ type: "dayClosed" });
      return events;
    }
    default:
      return [];
  }
}

function applyTutorialEvent(ui: UiState, event: TutorialEvent): UiState {
  let gain = ui.tutorialGain;
  if (
    event.type === "carDeparted" &&
    ui.tutorial === "watchCar" &&
    gain === null &&
    Number.isSafeInteger(event.amount) &&
    event.amount >= 0
  ) {
    gain = event.amount;
  }
  // René only comments once he has seen a car leave: before that a tap does nothing.
  if (event.type === "tap" && ui.tutorial === "watchCar" && gain === null) return ui;
  const step = nextTutorialStep(ui.tutorial, event);
  if (step === ui.tutorial && gain === ui.tutorialGain) return ui;
  return { ...ui, tutorial: step, tutorialGain: gain };
}

/**
 * Keeps the tutorial coherent with the game: skips what is already done or impossible, and gives
 * René's welcome gift when the cash cannot pay the first upgrade (once: only the very first
 * run, and only on that step, where nothing else can spend money).
 */
export function settleUi(ui: UiState): UiState {
  if (ui.tutorial === "done") return ui.tutorialReplay ? { ...ui, tutorialReplay: false } : ui;
  const step = settleTutorial(ui.tutorial, ui.game, ui.tutorialReplay);
  let next: UiState = step === ui.tutorial ? ui : { ...ui, tutorial: step };
  // The till starts empty: René tops it up so the first car can be bought (tutorial.md).
  if (
    (step === "openCars" || step === "buyUsed") &&
    !ui.tutorialReplay &&
    ui.game.fleet.length === 0 &&
    ui.game.cash < TUTORIAL_START_FUNDS
  ) {
    next = gift(next, TUTORIAL_START_FUNDS - ui.game.cash, "René te lance :");
  }
  if (step === "buyUpgrade" && !ui.tutorialReplay) {
    const missing = upgradeCost("ads", ui.game.upgrades.ads) - ui.game.cash;
    if (missing > 0) {
      try {
        const game = giveWelcomeGift(ui.game, missing);
        next = {
          ...next,
          game,
          notice: `René complète la caisse : +${formatCents(game.cash - ui.game.cash)}.`,
        };
      } catch {
        // an overflowing cash is far beyond the price: nothing to give
      }
    }
  }
  return next;
}

function advanceTutorial(prev: UiState, next: UiState, type: unknown): UiState {
  let ui = next;
  if (prev.tutorial !== "done") {
    for (const event of tutorialEvents(prev, next, type)) ui = applyTutorialEvent(ui, event);
  }
  ui = settleUi(ui);
  // René's parting gift (tutorial.md): once, when the first run ends (never on a replay).
  if (prev.tutorial === "goodbye" && ui.tutorial === "done" && !prev.tutorialReplay) {
    ui = gift(ui, TUTORIAL_FAREWELL_FUNDS, "René te laisse");
  }
  return ui;
}

/** Adds René's money to the cash with a notice. An overflowing cash gets nothing. */
function gift(ui: UiState, amount: number, who: string): UiState {
  try {
    const game = giveWelcomeGift(ui.game, amount);
    if (game === ui.game) return ui;
    return { ...ui, game, notice: `${who} ${formatCents(game.cash - ui.game.cash)}.`, error: null };
  } catch {
    return ui;
  }
}

/** Plays the offline days of an absence; a second absence before the claim adds up. */
function returnAfter(state: UiState, elapsedMs: unknown): UiState {
  // No offline earnings while René is teaching: nothing runs behind the tutorial.
  if (state.tutorial !== "done") return state;
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
    eventBanner: null,
    notice: null,
  };
}

function carNo(id: unknown): string {
  return typeof id === "number" && Number.isSafeInteger(id) ? String(id) : "—";
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
    case "repairCar": {
      const next = repairCar(game, action.carId);
      return {
        game: next,
        notice: `Voiture n°${carNo(action.carId)} réparée pour ${formatCents(Math.max(0, game.cash - next.cash))}.`,
      };
    }
    case "serviceCar": {
      const next = serviceCar(game, action.carId);
      return {
        game: next,
        notice: `Voiture n°${carNo(action.carId)} entretenue pour ${formatCents(Math.max(0, game.cash - next.cash))}.`,
      };
    }
    case "sellCar": {
      const next = sellCar(game, action.carId);
      return {
        game: next,
        notice: `Voiture n°${carNo(action.carId)} vendue pour ${formatCents(Math.max(0, next.cash - game.cash))}.`,
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
    const event = activeEvent(next);
    const prevEvent = activeEvent(state.game);
    const started =
      event !== null &&
      (prevEvent === null ||
        prevEvent.kind !== event.kind ||
        prevEvent.startDay !== event.startDay);
    return {
      ...state,
      game: next,
      dayBanner: closed ? dayBannerText(next.day, next.lastDay) : state.dayBanner,
      eventBanner: started ? eventBannerText(event) : state.eventBanner,
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
    return type === "newGame" || next === state ? next : advanceTutorial(state, next, type);
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
      // A new game starts with an empty till: René's tutorial provides the money.
      return { ...initUiState(createGame(seed, 0)), notice: NEW_GAME_NOTICE };
    }
    case "purchaseFailed":
      return { ...state, notice: null, error: PURCHASE_FAILED_ERROR };
    case "returnAfter":
      return returnAfter(state, (action as { elapsedMs?: unknown }).elapsedMs);
    case "tutorialEvent": {
      const event: unknown = (action as { event?: unknown }).event;
      if (state.tutorial === "done" || !isUiTutorialEvent(event)) return state;
      return applyTutorialEvent(state, event);
    }
    case "skipTutorial":
      return state.tutorial !== "done" && state.tutorialReplay
        ? { ...state, tutorial: "done", tutorialReplay: false }
        : state;
    case "replayTutorial":
      return state.tutorial === "done"
        ? { ...state, tutorial: "welcome", tutorialReplay: true, tutorialGain: null, paused: true }
        : state;
    case "resume":
      return state.paused ? { ...state, paused: false, hasRun: true } : state;
    case "claimOffline":
      return state.offline === null ? state : { ...state, offline: null };
    case "dismissMessage":
      return { ...state, error: null, notice: null };
    case "dismissDayBanner":
      return state.dayBanner === null ? state : { ...state, dayBanner: null };
    case "dismissEventBanner":
      return state.eventBanner === null ? state : { ...state, eventBanner: null };
    case "eventInfo": {
      const event = activeEvent(state.game);
      if (event === null) return state;
      return {
        ...state,
        error: null,
        notice: `${EVENT_LABELS[event.kind]} : ${eventEffectText(event.kind)}.`,
      };
    }
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
    case "repairCar":
    case "serviceCar":
    case "sellCar":
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
