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
  it("defaults to createGame(DEFAULT_SEED) with no messages", () => {
    expect(DEFAULT_SEED).toBe(1);
    expect(initUiState()).toEqual({ game: createGame(DEFAULT_SEED), error: null, notice: null });
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
    s = gameReducer(s, { type: "nextDay" });
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

  it("nextDay: day+1, lastDay filled, notice 'Jour 1 terminé'", () => {
    const s = gameReducer(initUiState(createGame(1, 50_000_00, MIXED)), { type: "nextDay" });
    expect(s.game.day).toBe(1);
    expect(s.game.lastDay).toEqual({ revenue: 100_00, costs: 80_00 });
    expect(s.notice).toBe(`Jour 1 terminé : résultat ${formatCents(100_00 - 80_00)}.`);
    expect(s.error).toBeNull();
  });

  it("nextDay with a negative result shows it formatted", () => {
    const s = gameReducer(initUiState(createGame(1, 0, IDLE)), { type: "nextDay" });
    expect(s.notice).toBe(`Jour 1 terminé : résultat ${formatCents(-50_00)}.`);
  });

  it("nextDay at the overflow edge: SIM_OVERFLOW message, same game", () => {
    const g = createGame(1, Number.MAX_SAFE_INTEGER, [{ dailyPrice: 100_00, dailyCost: 1_00 }]);
    const start = initUiState(g);
    const s = gameReducer(start, { type: "nextDay" });
    expect(s.game).toBe(g);
    expect(s.error).toBe("La simulation a atteint une limite numérique : action annulée.");
    expect(s.notice).toBeNull();
  });

  it("dismissMessage clears both", () => {
    const s = gameReducer(
      { game: createGame(1), error: "e", notice: "n" },
      { type: "dismissMessage" },
    );
    expect(s.error).toBeNull();
    expect(s.notice).toBeNull();
  });

  it("dismissMessage keeps the game by reference", () => {
    const start = gameReducer(initUiState(), { type: "nextDay" });
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
      "nextDay",
      [],
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
      { type: "nextDay" },
      { type: "setCarPrice", carId: 1, dailyPrice: 1 },
      { type: "dismissMessage" },
    ];
    for (const a of actions) {
      expect(gameReducer(start, a)).toEqual(gameReducer(start, a));
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

  it("spam nextDay x1000: exactly 1000 days, no junk", () => {
    let s: UiState = initUiState(createGame(1, 0, IDLE));
    for (let i = 0; i < 1000; i++) s = gameReducer(s, { type: "nextDay" });
    expect(s.game.day).toBe(1000);
    expect(s.game.cash).toBe(-1000 * 50_00);
    expect(dirty(s.notice)).toBe(false);
  });

  it("bought then ticked state goes through the reducer consistently with the sim", () => {
    let s: UiState = initUiState();
    s = gameReducer(s, { type: "buyCar", model: "compact" as CarModelId });
    s = gameReducer(s, { type: "nextDay" });
    const expected: GameState = tick(buyCar(createGame(1), "compact"));
    expect(s.game).toEqual(expected);
  });
});
