import { describe, expect, it } from "vitest";
import {
  CAR_MODELS,
  MAX_FLEET_SIZE,
  buyCar,
  createGame,
  tick,
  type Car,
  type CarModelId,
  type GameState,
  type NewCar,
} from "@rt/sim";
import { formatCents } from "../format.js";
import {
  DEFAULT_SEED,
  gameReducer,
  initUiState,
  type GameAction,
  type UiState,
} from "./gameReducer.js";
import { PRICE_RANGE_ERROR, errorMessage } from "./messages.js";
import { FleetFullError, InsufficientCashError } from "@rt/sim";

const IDLE: readonly NewCar[] = [
  { dailyPrice: 200_00, dailyCost: 30_00 },
  { dailyPrice: 160_00, dailyCost: 20_00 },
];
const MIXED: readonly NewCar[] = [
  { dailyPrice: 100_00, dailyCost: 30_00 },
  { dailyPrice: 300_00, dailyCost: 50_00 },
];

const forge = (a: unknown): GameAction => a as GameAction;
const DAY: GameAction = { type: "advanceTime", minutes: 720 };
/** A state with the clock running at x1 (time only advances when not paused). */
const running = (game?: GameState): UiState => ({ ...initUiState(game), paused: false });
const dirty = (s: string | null): boolean =>
  s !== null && /NaN|undefined|Infinity|\[object/.test(s);

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

describe("initUiState", () => {
  it("defaults to createGame(DEFAULT_SEED), paused at x1, no messages", () => {
    expect(DEFAULT_SEED).toBe(1);
    expect(initUiState()).toEqual({
      game: createGame(DEFAULT_SEED),
      error: null,
      notice: null,
      speed: 1,
      paused: true,
      hasRun: false,
      dayBanner: null,
    });
  });

  it("uses a provided game by reference", () => {
    const g = createGame(1, 0, IDLE);
    expect(initUiState(g).game).toBe(g);
  });
});

describe("gameReducer", () => {
  it("buyCar success: fleet +1, notice, no error", () => {
    const s = gameReducer(initUiState(), { type: "buyCar", model: "compact" });
    expect(s.game.fleet).toHaveLength(1);
    expect(s.error).toBeNull();
    expect(s.notice).toBe(
      `Citadine neuve achetée pour ${formatCents(CAR_MODELS.compact.purchasePrice)}.`,
    );
  });

  it.each(["used", "compact", "hybrid"] as const)("buyCar %s notice has no junk", (model) => {
    const s = gameReducer(initUiState(), { type: "buyCar", model });
    expect(dirty(s.notice)).toBe(false);
    expect(s.notice).toContain(formatCents(CAR_MODELS[model].purchasePrice));
  });

  it("buyCar with insufficient funds: same game reference, error, no notice", () => {
    const start = initUiState(createGame(1, 0));
    const s = gameReducer(start, { type: "buyCar", model: "used" });
    expect(s.game).toBe(start.game);
    expect(s.error).toBe(errorMessage(new InsufficientCashError(CAR_MODELS.used.purchasePrice, 0)));
    expect((s.error ?? "").replace(/\s/g, " ")).toBe(
      "Fonds insuffisants : il faut 4 000,00 €, vous avez 0,00 €.",
    );
    expect(s.notice).toBeNull();
  });

  it("a refusal replaces a previous notice", () => {
    let s = gameReducer(initUiState(createGame(1, CAR_MODELS.used.purchasePrice)), {
      type: "buyCar",
      model: "used",
    });
    expect(s.notice).not.toBeNull();
    s = gameReducer(s, { type: "buyCar", model: "used" });
    expect(s.notice).toBeNull();
    expect(s.error).not.toBeNull();
  });

  it("a success replaces a previous error", () => {
    let s = gameReducer(initUiState(), { type: "setCarPrice", carId: 99, dailyPrice: 1 });
    expect(s.error).not.toBeNull();
    s = gameReducer(s, { type: "buyCar", model: "used" });
    expect(s.error).toBeNull();
    expect(s.notice).not.toBeNull();
  });

  it("forged model: UNKNOWN_CAR_MODEL message, no exception, same game", () => {
    const start = initUiState();
    for (const model of ["truck", "__proto__", "toString", "constructor", null, undefined, 1, {}]) {
      const s = gameReducer(start, forge({ type: "buyCar", model }));
      expect(s.game).toBe(start.game);
      expect(s.error).toBe("Modèle de voiture inconnu.");
      expect(s.notice).toBeNull();
    }
  });

  it("forged setCarPrice: unknown car and NaN price (also hostile types)", () => {
    const g = tick(createGame(1, 50_000_00, MIXED));
    const start = initUiState(g);
    const a = gameReducer(start, { type: "setCarPrice", carId: 99, dailyPrice: 100 });
    expect(a.error).toBe("Cette voiture n'existe pas.");
    expect(a.game).toBe(g);
    const b = gameReducer(start, { type: "setCarPrice", carId: 1, dailyPrice: NaN });
    expect(b.error).toBe(PRICE_RANGE_ERROR);
    expect(b.game).toBe(g);
    for (const dailyPrice of [-1, 1.5, Infinity, "100", null, undefined, 2 ** 53, 1_000_01, {}]) {
      const s = gameReducer(start, forge({ type: "setCarPrice", carId: 1, dailyPrice }));
      expect(s.error).toBe(PRICE_RANGE_ERROR);
      expect(s.game).toBe(g);
    }
    for (const carId of ["1", null, undefined, NaN, 1n, "__proto__", {}, [1]]) {
      const s = gameReducer(start, forge({ type: "setCarPrice", carId, dailyPrice: 100 }));
      expect(s.error).toBe("Cette voiture n'existe pas.");
      expect(s.game).toBe(g);
    }
  });

  it("setCarPrice success notice", () => {
    const start = initUiState(createGame(1, 50_000_00, MIXED));
    const s = gameReducer(start, { type: "setCarPrice", carId: 2, dailyPrice: 150_00 });
    expect(s.error).toBeNull();
    expect((s.game.fleet[1] as Car).dailyPrice).toBe(150_00);
    expect(s.notice).toBe(`Prix de la voiture n°2 fixé à ${formatCents(150_00)}/jour.`);
  });

  it("setCarPrice with -0 yields +0 in the game and a clean notice", () => {
    const s = gameReducer(initUiState(createGame(1, 50_000_00, MIXED)), {
      type: "setCarPrice",
      carId: 1,
      dailyPrice: -0,
    });
    expect(Object.is((s.game.fleet[0] as Car).dailyPrice, 0)).toBe(true);
    expect(s.notice).not.toContain("-0");
    expect(s.notice).toBe(`Prix de la voiture n°1 fixé à ${formatCents(0)}/jour.`);
  });

  it("advanceTime 720: day+1, lastDay filled, dayBanner with the net result, no notice", () => {
    const s = gameReducer(running(createGame(1, 50_000_00, MIXED)), DAY);
    expect(s.game.day).toBe(1);
    expect(s.game.minute).toBe(0);
    expect(s.game.lastDay).toEqual({ revenue: 100_00, costs: 80_00 });
    expect(s.dayBanner).toBe(`Jour 2 : l'agence ouvre ! Hier : +${formatCents(100_00 - 80_00)}`);
    expect(s.notice).toBeNull();
    expect(s.error).toBeNull();
  });

  it("advanceTime with a negative result shows it formatted, without a plus sign", () => {
    const s = gameReducer(running(createGame(1, 0, IDLE)), DAY);
    expect(s.dayBanner).toBe(`Jour 2 : l'agence ouvre ! Hier : ${formatCents(-50_00)}`);
    expect(s.dayBanner).not.toContain("+");
  });

  it("advanceTime at the overflow edge: SIM_OVERFLOW message, same game, paused", () => {
    const g = createGame(1, Number.MAX_SAFE_INTEGER, [{ dailyPrice: 100_00, dailyCost: 1_00 }]);
    const start = running(g);
    const s = gameReducer(start, DAY);
    expect(s.game).toBe(g);
    expect(s.paused).toBe(true);
    expect(s.error).toBe("La simulation a atteint une limite numérique : action annulée.");
    expect(s.notice).toBeNull();
    // a second commit while paused must not stack another error or change anything
    expect(gameReducer(s, DAY)).toBe(s);
  });

  it("dismissMessage clears both", () => {
    const s = gameReducer(
      { ...initUiState(), error: "e", notice: "n" },
      { type: "dismissMessage" },
    );
    expect(s.error).toBeNull();
    expect(s.notice).toBeNull();
  });

  it("dismissMessage keeps the game by reference", () => {
    const start = gameReducer(running(createGame(1, 0, IDLE)), DAY);
    expect(gameReducer(start, { type: "dismissMessage" }).game).toBe(start.game);
  });

  it("unknown / malformed actions return the exact same state object", () => {
    const start = initUiState();
    for (const a of [
      { type: "teleport" },
      { type: "" },
      { type: "__proto__" },
      { type: "toString" },
      { type: "constructor" },
      { type: null },
      { type: 1 },
      {},
      null,
      undefined,
      42,
      "advanceTime",
      [],
      { type: "nextDay" },
    ]) {
      expect(gameReducer(start, forge(a))).toBe(start);
    }
  });

  it("never throws on an action whose model getter throws", () => {
    const start = initUiState();
    expect(() =>
      gameReducer(
        start,
        forge({
          type: "buyCar",
          get model(): string {
            throw new Error("x");
          },
        }),
      ),
    ).not.toThrow();
  });

  it("never throws on an action whose type getter throws (spec 3.2: catches everything)", () => {
    const start = initUiState();
    const weird = new Proxy(
      {},
      {
        get() {
          throw new Error("trap");
        },
      },
    );
    expect(() => gameReducer(start, forge(weird))).not.toThrow();
  });

  it("is pure: same input twice gives deep-equal outputs, and inputs are not mutated", () => {
    const start = deepFreeze(initUiState());
    const actions: GameAction[] = [
      { type: "buyCar", model: "hybrid" },
      { type: "advanceTime", minutes: 10 },
      { type: "setCarPrice", carId: 1, dailyPrice: 1 },
      { type: "dismissMessage" },
      { type: "setSpeed", speed: 4 },
      { type: "togglePause" },
      { type: "pause" },
      { type: "dismissDayBanner" },
    ];
    for (const a of actions) {
      expect(gameReducer(start, a)).toEqual(gameReducer(start, a));
      expect(gameReducer(deepFreeze(running()), a)).toEqual(gameReducer(running(), a));
    }
  });

  it("spam buying: ends with an error, cash never negative, ids unique", () => {
    let s: UiState = initUiState();
    for (let i = 0; i < 100; i++) s = gameReducer(s, { type: "buyCar", model: "used" });
    expect(s.game.cash).toBeGreaterThanOrEqual(0);
    expect(s.game.fleet.length).toBe(Math.floor(50_000_00 / CAR_MODELS.used.purchasePrice));
    expect(s.error).toBe(
      errorMessage(new InsufficientCashError(CAR_MODELS.used.purchasePrice, s.game.cash)),
    );
    expect(new Set(s.game.fleet.map((c) => c.id)).size).toBe(s.game.fleet.length);
  });

  it("buying the 51st car: FLEET_FULL message, fleet stays at 50", () => {
    let s: UiState = initUiState(createGame(1, 10 ** 12));
    for (let i = 0; i < MAX_FLEET_SIZE; i++) s = gameReducer(s, { type: "buyCar", model: "used" });
    expect(s.game.fleet).toHaveLength(MAX_FLEET_SIZE);
    const before = s.game;
    s = gameReducer(s, { type: "buyCar", model: "hybrid" });
    expect(s.game).toBe(before);
    expect(s.error).toBe(errorMessage(new FleetFullError(MAX_FLEET_SIZE)));
  });

  it("spam advanceTime 720 x1000: exactly 1000 days, no junk", () => {
    let s: UiState = running(createGame(1, 0, IDLE));
    for (let i = 0; i < 1000; i++) s = gameReducer(s, DAY);
    expect(s.game.day).toBe(1000);
    expect(s.game.cash).toBe(-1000 * 50_00);
    expect(dirty(s.notice)).toBe(false);
    expect(dirty(s.dayBanner)).toBe(false);
    expect(s.dayBanner).toBe(`Jour 1001 : l'agence ouvre ! Hier : ${formatCents(-50_00)}`);
  });

  it("bought then advanced state goes through the reducer consistently with the sim", () => {
    let s: UiState = running();
    s = gameReducer(s, { type: "buyCar", model: "compact" as CarModelId });
    s = gameReducer(s, DAY);
    const expected: GameState = tick(buyCar(createGame(1), "compact"));
    expect(s.game).toEqual(expected);
  });
});

describe("advanceTime", () => {
  it("while paused returns the very same state, whatever the minutes", () => {
    const start = initUiState();
    for (const minutes of [0, 10, 720, -1, NaN, "x", undefined]) {
      expect(gameReducer(start, forge({ type: "advanceTime", minutes }))).toBe(start);
    }
  });

  it("0 minutes returns the same state", () => {
    const start = running();
    expect(gameReducer(start, { type: "advanceTime", minutes: 0 })).toBe(start);
    expect(gameReducer(start, { type: "advanceTime", minutes: -0 })).toBe(start);
  });

  it("advances the clock without touching error or notice or the banner", () => {
    const start: UiState = {
      ...running(createGame(1, 50_000_00, MIXED)),
      error: "e",
      notice: "n",
      dayBanner: "b",
    };
    const s = gameReducer(start, { type: "advanceTime", minutes: 30 });
    expect(s.game.minute).toBe(30);
    expect(s.error).toBe("e");
    expect(s.notice).toBe("n");
    expect(s.dayBanner).toBe("b");
    expect(s.paused).toBe(false);
  });

  it("live cash: the first departure pays at once", () => {
    const s = gameReducer(running(createGame(1, 1000, MIXED)), { type: "advanceTime", minutes: 1 });
    expect(s.game.cash).toBe(1000 + 100_00);
    expect(s.game.todayRevenue).toBe(100_00);
  });

  it("a day closing replaces the previous banner; a mid-day commit keeps it", () => {
    const g = createGame(1, 0, IDLE);
    let s = gameReducer(running(g), DAY);
    const first = s.dayBanner;
    expect(first).not.toBeNull();
    s = gameReducer(s, { type: "advanceTime", minutes: 5 });
    expect(s.dayBanner).toBe(first);
    s = gameReducer(s, { type: "advanceTime", minutes: 715 });
    expect(s.dayBanner).toBe(`Jour 3 : l'agence ouvre ! Hier : ${formatCents(-50_00)}`);
  });

  it.each([-1, 0.5, NaN, Infinity, 721, 1e9, "5", null, undefined, {}, [], 10n, true])(
    "hostile minutes %s: game unchanged, paused, a French error, no exception",
    (minutes) => {
      const start = running(createGame(1, 5000, MIXED));
      const s = gameReducer(start, forge({ type: "advanceTime", minutes }));
      if (s === start) throw new Error("hostile minutes must not be silently accepted");
      expect(s.game).toBe(start.game);
      expect(s.paused).toBe(true);
      expect(s.error).toBe("Une erreur inattendue est survenue : action annulée.");
      expect(s.notice).toBeNull();
    },
  );

  it("an advanceTime action with a throwing minutes getter does not throw", () => {
    const bad = {
      type: "advanceTime",
      get minutes(): number {
        throw new Error("x");
      },
    };
    expect(() => gameReducer(running(), forge(bad))).not.toThrow();
  });

  it("a corrupt game minute pauses with the overflow message", () => {
    const g: GameState = { ...createGame(1, 0, IDLE), minute: 5000 };
    const s = gameReducer(running(g), { type: "advanceTime", minutes: 1 });
    expect(s.paused).toBe(true);
    expect(s.error).toBe("La simulation a atteint une limite numérique : action annulée.");
    expect(s.game).toBe(g);
  });

  it("a refused advance clears a pending notice", () => {
    const s = gameReducer(
      { ...running(), notice: "n" },
      forge({ type: "advanceTime", minutes: -3 }),
    );
    expect(s.notice).toBeNull();
  });

  it("buying while paused is allowed and does not resume", () => {
    const s = gameReducer(initUiState(), { type: "buyCar", model: "used" });
    expect(s.paused).toBe(true);
    expect(s.game.fleet).toHaveLength(1);
    expect(s.hasRun).toBe(false);
  });
});

describe("setSpeed / togglePause / pause / hasRun / dismissDayBanner", () => {
  it.each([1, 2, 4, 10] as const)(
    "setSpeed %s resumes, remembers the speed, sets hasRun",
    (speed) => {
      const s = gameReducer(initUiState(), { type: "setSpeed", speed });
      expect(s).toMatchObject({ speed, paused: false, hasRun: true });
    },
  );

  it.each([0, 3, 5, 100, -1, 1.5, NaN, Infinity, "1", "x1", null, undefined, {}, [1], true])(
    "setSpeed %s is ignored: exact same state",
    (speed) => {
      const start = initUiState();
      expect(gameReducer(start, forge({ type: "setSpeed", speed }))).toBe(start);
      const r = running();
      expect(gameReducer(r, forge({ type: "setSpeed", speed }))).toBe(r);
    },
  );

  it("setSpeed on the active speed while paused resumes (tap on the active speed)", () => {
    const s = gameReducer(initUiState(), { type: "setSpeed", speed: 1 });
    expect(s.paused).toBe(false);
  });

  it("setSpeed while running changes only the speed", () => {
    const start = running();
    const s = gameReducer(start, { type: "setSpeed", speed: 10 });
    expect(s.speed).toBe(10);
    expect(s.paused).toBe(false);
    expect(s.game).toBe(start.game);
  });

  it("togglePause: resume sets hasRun, pause keeps the speed and hasRun", () => {
    let s = gameReducer(initUiState(), { type: "setSpeed", speed: 4 });
    s = gameReducer(s, { type: "togglePause" });
    expect(s).toMatchObject({ paused: true, speed: 4, hasRun: true });
    s = gameReducer(s, { type: "togglePause" });
    expect(s).toMatchObject({ paused: false, speed: 4, hasRun: true });
  });

  it("togglePause from the initial state resumes at x1 and sets hasRun", () => {
    expect(gameReducer(initUiState(), { type: "togglePause" })).toMatchObject({
      paused: false,
      speed: 1,
      hasRun: true,
    });
  });

  it("togglePause x1001 from paused ends running; the game never changes", () => {
    let s = initUiState();
    for (let i = 0; i < 1001; i++) s = gameReducer(s, { type: "togglePause" });
    expect(s.paused).toBe(false);
    expect(s.game).toEqual(createGame(DEFAULT_SEED));
  });

  it("pause is idempotent: already paused returns the same reference", () => {
    const start = initUiState();
    expect(gameReducer(start, { type: "pause" })).toBe(start);
    const r = running();
    const p = gameReducer(r, { type: "pause" });
    expect(p.paused).toBe(true);
    expect(p.speed).toBe(r.speed);
    expect(p.hasRun).toBe(r.hasRun);
    expect(gameReducer(p, { type: "pause" })).toBe(p);
  });

  it("pause never sets hasRun", () => {
    expect(gameReducer(initUiState(), { type: "pause" }).hasRun).toBe(false);
  });

  it("dismissDayBanner clears only the banner; no banner returns the same state", () => {
    const start = initUiState();
    expect(gameReducer(start, { type: "dismissDayBanner" })).toBe(start);
    const withBanner: UiState = { ...running(), dayBanner: "x", error: "e", notice: "n" };
    const s = gameReducer(withBanner, { type: "dismissDayBanner" });
    expect(s).toEqual({ ...withBanner, dayBanner: null });
  });

  it("dismissMessage does not clear the day banner", () => {
    const s = gameReducer({ ...running(), dayBanner: "x" }, { type: "dismissMessage" });
    expect(s.dayBanner).toBe("x");
  });

  it("a forged nextDay action is ignored", () => {
    const start = running();
    expect(gameReducer(start, forge({ type: "nextDay" }))).toBe(start);
  });
});
