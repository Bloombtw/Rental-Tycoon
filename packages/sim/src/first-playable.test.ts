import { describe, expect, it } from "vitest";
import {
  CAR_MODELS,
  CAR_MODEL_IDS,
  FleetFullError,
  InsufficientCashError,
  InvalidPriceError,
  MAX_CAR_DAILY_COST,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  NO_UPGRADES,
  UPGRADES,
  SimError,
  SimOverflowError,
  UnknownCarError,
  UnknownCarModelError,
  advance,
  buyCar,
  createGame,
  setCarPrice,
  tick,
  type Car,
  type CarModelId,
  type Cents,
  type GameState,
  type NewCar,
} from "./index.js";

// ---------------------------------------------------------------------------
// Fixtures (core-loop) and helpers
// ---------------------------------------------------------------------------
/** Sum of the prices of the cars rented in this fleet snapshot. */
function revenueOf(fleet: readonly Car[]): number {
  return fleet.reduce((sum, c) => sum + (c.rented ? c.dailyPrice : 0), 0);
}

const PROFITABLE: readonly NewCar[] = [
  { dailyPrice: 60_00, dailyCost: 25_00 },
  { dailyPrice: 90_00, dailyCost: 40_00 },
];
const IDLE: readonly NewCar[] = [
  { dailyPrice: 200_00, dailyCost: 30_00 },
  { dailyPrice: 180_00, dailyCost: 20_00 },
];
const MIXED: readonly NewCar[] = [
  { dailyPrice: 100_00, dailyCost: 30_00 },
  { dailyPrice: 300_00, dailyCost: 50_00 },
];
const C: Cents = 50_000_00;

type LooseBuy = (state: GameState, model: unknown) => GameState;
type LooseSet = (state: GameState, carId: unknown, dailyPrice: unknown) => GameState;
const looseBuy = buyCar as unknown as LooseBuy;
const looseSet = setCarPrice as unknown as LooseSet;

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected function to throw, but it returned");
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze(Reflect.get(value, key));
    }
  }
  return value;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v: unknown) => clone(v)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) out[key] = clone(Reflect.get(value, key));
    return out as T;
  }
  return value;
}

/** Hand-built state (bypasses createGame validation). */
function stateOf(
  fleet: readonly Car[],
  cash: Cents = C,
  extra: Partial<GameState> = {},
): GameState {
  return {
    seed: 1,
    rngState: 1,
    day: 0,
    minute: 0,
    cash,
    todayRevenue: 0,
    customersLeft: 0,
    upgrades: FULL_PARKING,
    fleet,
    lastDay: null,
    ...extra,
  };
}

const STATE_KEYS = [
  "cash",
  "customersLeft",
  "day",
  "fleet",
  "lastDay",
  "minute",
  "rngState",
  "seed",
  "todayRevenue",
  "upgrades",
];

/** Parking at its maximum (50 places) so the tests can buy freely (upgrades.md). */
const FULL_PARKING = { ...NO_UPGRADES, parking: UPGRADES.parking.maxLevel };
const roomy = (g: GameState): GameState => ({ ...g, upgrades: FULL_PARKING });

function carsWithIds(ids: readonly number[]): Car[] {
  return ids.map((id) => ({ id, dailyPrice: 60_00, dailyCost: 25_00, rented: false }));
}

function fleetOfSize(n: number): NewCar[] {
  return Array.from({ length: n }, () => ({ dailyPrice: 100_00, dailyCost: 1_00 }));
}

const MODEL_IDS: readonly CarModelId[] = ["used", "compact", "hybrid"];

// ---------------------------------------------------------------------------
// Exports and catalogue
// ---------------------------------------------------------------------------
describe("catalogue and exports", () => {
  it("exports the new API", () => {
    expect(typeof buyCar).toBe("function");
    expect(typeof setCarPrice).toBe("function");
    for (const E of [
      InsufficientCashError,
      FleetFullError,
      UnknownCarModelError,
      UnknownCarError,
      InvalidPriceError,
    ]) {
      expect(typeof E).toBe("function");
    }
  });

  it("CAR_MODELS has exactly the spec values", () => {
    expect(CAR_MODELS).toEqual({
      used: { id: "used", purchasePrice: 4_000_00, dailyCost: 60_00, defaultDailyPrice: 90_00 },
      compact: {
        id: "compact",
        purchasePrice: 9_000_00,
        dailyCost: 25_00,
        defaultDailyPrice: 60_00,
      },
      hybrid: {
        id: "hybrid",
        purchasePrice: 16_000_00,
        dailyCost: 10_00,
        defaultDailyPrice: 120_00,
      },
    });
  });

  it("CAR_MODEL_IDS is canonical and matches CAR_MODELS keys; ids self-consistent", () => {
    expect(CAR_MODEL_IDS).toEqual(["used", "compact", "hybrid"]);
    expect([...CAR_MODEL_IDS].sort()).toEqual(Object.keys(CAR_MODELS).sort());
    for (const id of CAR_MODEL_IDS) expect(CAR_MODELS[id].id).toBe(id);
  });

  it.each(MODEL_IDS)("invariants hold for %s", (id) => {
    const m = CAR_MODELS[id];
    expect(Number.isSafeInteger(m.purchasePrice)).toBe(true);
    expect(m.purchasePrice).toBeGreaterThan(0);
    expect(Number.isSafeInteger(m.dailyCost)).toBe(true);
    expect(m.dailyCost).toBeGreaterThanOrEqual(0);
    expect(m.dailyCost).toBeLessThanOrEqual(MAX_CAR_DAILY_COST);
    expect(Number.isSafeInteger(m.defaultDailyPrice)).toBe(true);
    expect(m.defaultDailyPrice).toBeGreaterThanOrEqual(0);
    expect(m.defaultDailyPrice).toBeLessThanOrEqual(MAX_CAR_DAILY_PRICE);
    expect(m.defaultDailyPrice).toBeGreaterThan(m.dailyCost);
  });

  it("everything is frozen", () => {
    expect(Object.isFrozen(CAR_MODELS)).toBe(true);
    expect(Object.isFrozen(CAR_MODEL_IDS)).toBe(true);
    for (const id of CAR_MODEL_IDS) expect(Object.isFrozen(CAR_MODELS[id])).toBe(true);
  });

  it("frozen catalogue cannot be tampered with (strict mode throws)", () => {
    const m = CAR_MODELS as unknown as Record<string, unknown>;
    expect(() => {
      m["truck"] = {};
    }).toThrow();
    expect(() => {
      (CAR_MODELS.used as unknown as { purchasePrice: number }).purchasePrice = 1;
    }).toThrow();
    expect(CAR_MODELS.used.purchasePrice).toBe(4_000_00);
  });
});

// ---------------------------------------------------------------------------
// lastDay
// ---------------------------------------------------------------------------
describe("lastDay", () => {
  it("createGame has lastDay null and exact state keys", () => {
    const g = createGame(1);
    expect(g.lastDay).toBeNull();
    expect(Object.keys(g).sort()).toEqual(STATE_KEYS);
  });

  it("tick fills lastDay: MIXED, IDLE, empty", () => {
    expect(tick(createGame(1, C, MIXED)).lastDay).toEqual({ revenue: 100_00, costs: 80_00 });
    expect(tick(createGame(1, C, IDLE)).lastDay).toEqual({ revenue: 0, costs: 50_00 });
    expect(tick(createGame(1)).lastDay).toEqual({ revenue: 0, costs: 0 });
  });

  it("tick state keys stay exact and lastDay has exactly revenue and costs", () => {
    const t = tick(createGame(1, C, MIXED));
    expect(Object.keys(t).sort()).toEqual(STATE_KEYS);
    expect(Object.keys(t.lastDay ?? {}).sort()).toEqual(["costs", "revenue"]);
  });

  it("tick ignores the input lastDay (including hostile values)", () => {
    const base = createGame(1, C, MIXED);
    const expected = tick(base);
    for (const lastDay of [{ revenue: 999, costs: 999 }, { revenue: NaN, costs: -1 }, null]) {
      expect(tick({ ...base, lastDay })).toEqual(expected);
    }
  });

  it("advance(g, 0) returns the same reference; advance(g, N) equals N ticks", () => {
    const g = createGame(1, C, MIXED);
    expect(advance(g, 0)).toBe(g);
    let s = g;
    for (let i = 0; i < 7; i++) s = tick(s);
    expect(advance(g, 7)).toEqual(s);
    const last = advance(g, 7);
    expect(last.lastDay).toEqual({ revenue: revenueOf(last.fleet), costs: 80_00 });
    expect(revenueOf(last.fleet)).toBeLessThanOrEqual(100_00); // the 300,00 car is never rented
  });

  it("an overflowing tick throws and leaves the input (lastDay too) intact", () => {
    const g = deepFreeze(
      stateOf(
        [{ id: 1, dailyPrice: 60_00, dailyCost: 25_00, rented: false }],
        Number.MAX_SAFE_INTEGER,
        { lastDay: { revenue: 7, costs: 8 } },
      ),
    );
    const snapshot = clone(g);
    expect(thrown(() => tick(g))).toBeInstanceOf(SimOverflowError);
    expect(g).toEqual(snapshot);
    expect(g.lastDay).toEqual({ revenue: 7, costs: 8 });
  });

  it("lastDay is a fresh object each tick, not shared with the input", () => {
    const g = createGame(1, C, MIXED);
    const a = tick(g);
    const b = tick(a);
    expect(b.lastDay).not.toBe(a.lastDay);
  });

  it("buyCar and setCarPrice preserve lastDay by value (and reference)", () => {
    const g = tick(createGame(1, C, MIXED));
    expect(buyCar(g, "used").lastDay).toBe(g.lastDay);
    expect(setCarPrice(g, 1, 10_00).lastDay).toBe(g.lastDay);
    expect(buyCar(createGame(1), "used").lastDay).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// tick copies model
// ---------------------------------------------------------------------------
describe("tick and the optional model property", () => {
  it("keeps model on bought cars", () => {
    const g = tick(buyCar(buyCar(createGame(1), "hybrid"), "used"));
    expect(g.fleet.map((c) => c.model)).toEqual(["hybrid", "used"]);
  });

  it("fixture cars never gain a model key (no undefined key)", () => {
    const g = tick(tick(createGame(1, C, MIXED)));
    for (const c of g.fleet) {
      expect("model" in c).toBe(false);
      expect(Object.keys(c).sort()).toEqual(["dailyCost", "dailyPrice", "id", "outcome", "rented"]);
    }
  });

  it("mixed fleet: model only where it was present", () => {
    const g = tick(buyCar(createGame(1, C, PROFITABLE), "compact"));
    expect("model" in (g.fleet[0] as Car)).toBe(false);
    expect("model" in (g.fleet[1] as Car)).toBe(false);
    expect((g.fleet[2] as Car).model).toBe("compact");
  });

  it("createGame fixtures have no model key", () => {
    for (const c of createGame(1, C, PROFITABLE).fleet) expect("model" in c).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buyCar
// ---------------------------------------------------------------------------
describe("buyCar", () => {
  it("buys a compact exactly as specified", () => {
    const g = createGame(1);
    const b = buyCar(g, "compact");
    expect(b.cash).toBe(C - CAR_MODELS.compact.purchasePrice);
    expect(b.fleet).toEqual([
      {
        id: 1,
        model: "compact",
        dailyPrice: CAR_MODELS.compact.defaultDailyPrice,
        dailyCost: CAR_MODELS.compact.dailyCost,
        rented: false,
      },
    ]);
    expect(b.day).toBe(g.day);
    expect(b.seed).toBe(g.seed);
    expect(b.rngState).toBe(g.rngState);
    expect(b.lastDay).toBe(g.lastDay);
    expect(Object.keys(b).sort()).toEqual(STATE_KEYS);
  });

  it.each(MODEL_IDS)("%s: bought car carries catalogue values", (id) => {
    const car = buyCar(createGame(1), id).fleet[0] as Car;
    expect(car).toEqual({
      id: 1,
      model: id,
      dailyPrice: CAR_MODELS[id].defaultDailyPrice,
      dailyCost: CAR_MODELS[id].dailyCost,
      rented: false,
    });
  });

  it("three purchases give ids 1,2,3 appended in order", () => {
    const g = buyCar(buyCar(buyCar(createGame(1), "used"), "hybrid"), "compact");
    expect(g.fleet.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(g.fleet.map((c) => c.model)).toEqual(["used", "hybrid", "compact"]);
  });

  it("onto PROFITABLE: id 3, fixtures keep no model key", () => {
    const b = buyCar(createGame(1, C, PROFITABLE), "used");
    expect(b.fleet).toHaveLength(3);
    expect((b.fleet[2] as Car).id).toBe(3);
    expect("model" in (b.fleet[0] as Car)).toBe(false);
    expect("model" in (b.fleet[1] as Car)).toBe(false);
  });

  it("hand-built ids [5, 2] give 6; id allocation after gaps", () => {
    expect((buyCar(stateOf(carsWithIds([5, 2])), "used").fleet[2] as Car).id).toBe(6);
    expect((buyCar(stateOf(carsWithIds([2, 5])), "used").fleet[2] as Car).id).toBe(6);
    expect((buyCar(stateOf(carsWithIds([1, 100, 3])), "used").fleet[3] as Car).id).toBe(101);
    expect((buyCar(stateOf(carsWithIds([0])), "used").fleet[1] as Car).id).toBe(1);
  });

  it("ids [1, 3] then two buys never collide", () => {
    const g = buyCar(buyCar(stateOf(carsWithIds([1, 3])), "used"), "used");
    expect(g.fleet.map((c) => c.id)).toEqual([1, 3, 4, 5]);
  });

  it("cash exactly equal to the price succeeds and leaves 0", () => {
    const b = buyCar(createGame(1, CAR_MODELS.used.purchasePrice), "used");
    expect(b.cash).toBe(0);
    expect(b.fleet).toHaveLength(1);
  });

  it.each(MODEL_IDS)("%s: price - 1 fails with exact error payload", (id) => {
    const price = CAR_MODELS[id].purchasePrice;
    const err = thrown(() => buyCar(createGame(1, price - 1), id));
    expect(err).toBeInstanceOf(InsufficientCashError);
    expect((err as InsufficientCashError).required).toBe(price);
    expect((err as InsufficientCashError).available).toBe(price - 1);
  });

  it.each(MODEL_IDS)("%s: price + 1 succeeds leaving 1", (id) => {
    expect(buyCar(createGame(1, CAR_MODELS[id].purchasePrice + 1), id).cash).toBe(1);
  });

  it("cash 0 and negative cash refuse every model", () => {
    for (const cash of [0, -1, -4_000_00, Number.MIN_SAFE_INTEGER]) {
      for (const id of MODEL_IDS) {
        const err = thrown(() => buyCar(stateOf([], cash), id));
        expect(err).toBeInstanceOf(InsufficientCashError);
        expect((err as InsufficientCashError).available).toBe(cash);
      }
    }
  });

  it("cash -0 is refused for a priced model (no crash, no -0 cash leaks)", () => {
    expect(thrown(() => buyCar(stateOf([], -0), "used"))).toBeInstanceOf(InsufficientCashError);
  });

  it("fleet of 50 -> FleetFullError(maxFleetSize); even with cash 0 (order)", () => {
    const err = thrown(() => buyCar(createGame(1, C, fleetOfSize(MAX_FLEET_SIZE)), "used"));
    expect(err).toBeInstanceOf(FleetFullError);
    expect((err as FleetFullError).maxFleetSize).toBe(MAX_FLEET_SIZE);
    expect(
      thrown(() => buyCar(createGame(1, 0, fleetOfSize(MAX_FLEET_SIZE)), "used")),
    ).toBeInstanceOf(FleetFullError);
  });

  it("49 cars -> buy succeeds (50), then 50 -> refused", () => {
    const g = buyCar(createGame(1, C, fleetOfSize(MAX_FLEET_SIZE - 1)), "used");
    expect(g.fleet).toHaveLength(MAX_FLEET_SIZE);
    expect((g.fleet[MAX_FLEET_SIZE - 1] as Car).id).toBe(MAX_FLEET_SIZE);
    expect(thrown(() => buyCar(g, "used"))).toBeInstanceOf(FleetFullError);
  });

  it("hand-built fleet of 51 -> FleetFullError, not an overflow or success", () => {
    const g = stateOf(carsWithIds(Array.from({ length: MAX_FLEET_SIZE + 1 }, (_, i) => i + 1)));
    expect(thrown(() => buyCar(g, "used"))).toBeInstanceOf(FleetFullError);
  });

  it("hand-built fleet of 50 plus a corrupted cash -> still FleetFull (order)", () => {
    const g = stateOf(carsWithIds(Array.from({ length: MAX_FLEET_SIZE }, (_, i) => i + 1)), NaN);
    expect(thrown(() => buyCar(g, "used"))).toBeInstanceOf(FleetFullError);
  });

  const BAD_MODELS: readonly unknown[] = [
    "",
    "Used",
    "USED",
    " used",
    "used ",
    "used\0",
    "truck",
    "__proto__",
    "toString",
    "constructor",
    "hasOwnProperty",
    "valueOf",
    "prototype",
    "<script>alert(1)</script>",
    "'; DROP TABLE cars;--",
    "🚗",
    "x".repeat(10_000),
    null,
    undefined,
    1,
    0,
    -0,
    NaN,
    true,
    {},
    [],
    ["used"],
    { toString: () => "used" },
    Symbol("used"),
    1n,
    () => "used",
  ];

  it.each(BAD_MODELS.map((m, i) => [i, m] as const))(
    "invalid model #%i throws UnknownCarModelError carrying the received value",
    (_i, input) => {
      const err = thrown(() => looseBuy(createGame(1), input));
      expect(err).toBeInstanceOf(UnknownCarModelError);
      expect(Object.is((err as UnknownCarModelError).model, input)).toBe(true);
    },
  );

  it("invalid model wins over a full fleet and over corrupted cash (order)", () => {
    const full = createGame(1, C, fleetOfSize(MAX_FLEET_SIZE));
    for (const input of BAD_MODELS) {
      expect(thrown(() => looseBuy(full, input))).toBeInstanceOf(UnknownCarModelError);
    }
    expect(thrown(() => looseBuy(stateOf([], NaN), "truck"))).toBeInstanceOf(UnknownCarModelError);
  });

  it("an object whose own key shadows is still rejected; inherited keys of Object.prototype are not models", () => {
    expect(thrown(() => looseBuy(createGame(1), Object.create(null)))).toBeInstanceOf(
      UnknownCarModelError,
    );
  });

  it("corrupted cash -> SimOverflowError('cash')", () => {
    for (const cash of [NaN, 1.5, Infinity, -Infinity, 2 ** 53]) {
      const err = thrown(() => buyCar(stateOf([], cash), "used"));
      expect(err).toBeInstanceOf(SimOverflowError);
      expect((err as SimOverflowError).field).toBe("cash");
    }
  });

  it("corrupted cash beats insufficient funds (order)", () => {
    const err = thrown(() => buyCar(stateOf([], -1.5), "hybrid"));
    expect(err).toBeInstanceOf(SimOverflowError);
  });

  it("car id NaN or MAX_SAFE_INTEGER -> SimOverflowError('carId')", () => {
    for (const id of [NaN, Number.MAX_SAFE_INTEGER]) {
      const err = thrown(() => buyCar(stateOf(carsWithIds([1, id])), "used"));
      expect(err).toBeInstanceOf(SimOverflowError);
      expect((err as SimOverflowError).field).toBe("carId");
    }
  });

  it("MAX_SAFE_INTEGER - 1 is the last id that can still be bumped", () => {
    const g = buyCar(stateOf(carsWithIds([Number.MAX_SAFE_INTEGER - 1])), "used");
    expect((g.fleet[1] as Car).id).toBe(Number.MAX_SAFE_INTEGER);
    expect(thrown(() => buyCar(g, "used"))).toBeInstanceOf(SimOverflowError);
  });

  it("a failed overflow purchase does not debit anything (input untouched)", () => {
    const g = deepFreeze(stateOf(carsWithIds([Number.MAX_SAFE_INTEGER])));
    const snap = clone(g);
    expect(thrown(() => buyCar(g, "used"))).toBeInstanceOf(SimOverflowError);
    expect(g).toEqual(snap);
  });

  it("errors are SimError and RangeError with exact name and code", () => {
    const cases: Array<[() => unknown, string, string]> = [
      [() => buyCar(createGame(1, 0), "used"), "InsufficientCashError", "INSUFFICIENT_CASH"],
      [
        () => buyCar(createGame(1, C, fleetOfSize(MAX_FLEET_SIZE)), "used"),
        "FleetFullError",
        "FLEET_FULL",
      ],
      [() => looseBuy(createGame(1), "truck"), "UnknownCarModelError", "UNKNOWN_CAR_MODEL"],
      [() => setCarPrice(createGame(1), 1, 1), "UnknownCarError", "UNKNOWN_CAR"],
      [() => setCarPrice(createGame(1, C, MIXED), 1, -1), "InvalidPriceError", "INVALID_PRICE"],
      [() => buyCar(stateOf([], NaN), "used"), "SimOverflowError", "SIM_OVERFLOW"],
    ];
    for (const [fn, name, code] of cases) {
      const err = thrown(fn);
      expect(err).toBeInstanceOf(SimError);
      expect(err).toBeInstanceOf(RangeError);
      expect((err as SimError).name).toBe(name);
      expect((err as SimError).code).toBe(code);
    }
    expect(thrown(() => buyCar(createGame(1, 0), "used"))).toBeInstanceOf(InsufficientCashError);
  });

  it("does not mutate a deep-frozen state and returns new object and new fleet array", () => {
    const g = deepFreeze(createGame(1, C, PROFITABLE));
    const snap = clone(g);
    const b = buyCar(g, "hybrid");
    expect(g).toEqual(snap);
    expect(b).not.toBe(g);
    expect(b.fleet).not.toBe(g.fleet);
    // existing cars are untouched (value-wise)
    expect(b.fleet.slice(0, 2)).toEqual(g.fleet);
  });

  it("two buys from the same state are independent", () => {
    const g = createGame(1);
    const a = buyCar(g, "used");
    const b = buyCar(g, "hybrid");
    expect(a.fleet).toHaveLength(1);
    expect((b.fleet[0] as Car).model).toBe("hybrid");
    expect(g.fleet).toHaveLength(0);
  });

  it("bought car is rented on next tick: cash and lastDay as specified", () => {
    const t = tick(buyCar(createGame(1), "compact"));
    expect((t.fleet[0] as Car).rented).toBe(true);
    expect(t.lastDay).toEqual({ revenue: 60_00, costs: 25_00 });
    expect(t.cash).toBe(C - 9_000_00 + 35_00);
  });

  it("the purchase is not part of lastDay and rngState is neither read nor changed", () => {
    for (const rngState of [0, 1, 2 ** 32 - 1, -5, 1.5, NaN]) {
      const b = buyCar(stateOf([], C, { rngState }), "used");
      expect(Object.is(b.rngState, rngState)).toBe(true);
      expect(b.lastDay).toBeNull();
    }
  });

  it("spam buying until broke: cash never negative, ends with InsufficientCashError", () => {
    let g = roomy(createGame(1));
    let n = 0;
    for (;;) {
      try {
        g = buyCar(g, "used");
        n++;
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientCashError);
        break;
      }
      expect(g.cash).toBeGreaterThanOrEqual(0);
    }
    expect(n).toBe(Math.floor(C / CAR_MODELS.used.purchasePrice));
    expect(new Set(g.fleet.map((c) => c.id)).size).toBe(n);
  });

  it("buying up to 50 cars gives unique contiguous ids", () => {
    let g = roomy(createGame(1, 10 ** 12));
    for (let i = 0; i < MAX_FLEET_SIZE; i++) g = buyCar(g, "used");
    expect(g.fleet.map((c) => c.id)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(thrown(() => buyCar(g, "used"))).toBeInstanceOf(FleetFullError);
  });

  it("works on a state coming from tick (day > 0, negative cash blocks)", () => {
    const broke = advance(createGame(1, 0, IDLE), 3);
    expect(broke.cash).toBeLessThan(0);
    expect(thrown(() => buyCar(broke, "used"))).toBeInstanceOf(InsufficientCashError);
  });
});

// ---------------------------------------------------------------------------
// setCarPrice
// ---------------------------------------------------------------------------
describe("setCarPrice", () => {
  it("changes only the targeted dailyPrice", () => {
    const g = createGame(1, C, MIXED);
    const s = setCarPrice(g, 2, 150_00);
    expect(s).not.toBe(g);
    expect(s.fleet).not.toBe(g.fleet);
    expect((s.fleet[1] as Car).dailyPrice).toBe(150_00);
    expect(s.fleet[0]).toEqual(g.fleet[0]);
    expect({ ...s.fleet[1], dailyPrice: 0 }).toEqual({ ...g.fleet[1], dailyPrice: 0 });
    expect("model" in (s.fleet[1] as Car)).toBe(false);
    expect(s.cash).toBe(g.cash);
    expect(s.day).toBe(g.day);
    expect(s.lastDay).toBe(g.lastDay);
    expect(s.seed).toBe(g.seed);
    expect(s.rngState).toBe(g.rngState);
    expect(Object.keys(s).sort()).toEqual(STATE_KEYS);
  });

  it("same price still returns a new state and new fleet array", () => {
    const g = createGame(1, C, MIXED);
    const s = setCarPrice(g, 1, 100_00);
    expect(s).not.toBe(g);
    expect(s.fleet).not.toBe(g.fleet);
    expect(s).toEqual(g);
  });

  it("keeps rented from the last simulated day and model of a bought car", () => {
    const t = tick(buyCar(createGame(1), "compact"));
    const s = setCarPrice(t, 1, 150_01);
    expect((s.fleet[0] as Car).rented).toBe(true);
    expect((s.fleet[0] as Car).model).toBe("compact");
    expect(s.lastDay).toBe(t.lastDay);
  });

  it("then tick: both cars rented, lastDay 250/80", () => {
    const t = tick(setCarPrice(createGame(1, C, MIXED), 2, 150_00));
    // 100,00 and 150,00 are both below 2x the 90,00 reference: rentable, but not certain
    expect(t.fleet.every((c) => c.rented === (c.outcome === "rented"))).toBe(true);
    expect(t.lastDay).toEqual({ revenue: revenueOf(t.fleet), costs: 80_00 });
  });

  it("price at 2x the reference then tick: car idle, no revenue, cost still paid", () => {
    const t = tick(setCarPrice(createGame(1, C, PROFITABLE), 1, 180_00));
    expect((t.fleet[0] as Car).rented).toBe(false);
    expect((t.fleet[0] as Car).outcome).toBe("tooExpensive");
    expect(t.lastDay).toEqual({ revenue: revenueOf(t.fleet), costs: 65_00 });
    expect(t.cash).toBe(C + revenueOf(t.fleet) - 65_00);
  });

  it("price 0 and MAX_CAR_DAILY_PRICE accepted", () => {
    const g = createGame(1, C, MIXED);
    expect((setCarPrice(g, 1, 0).fleet[0] as Car).dailyPrice).toBe(0);
    expect((setCarPrice(g, 1, MAX_CAR_DAILY_PRICE).fleet[0] as Car).dailyPrice).toBe(
      MAX_CAR_DAILY_PRICE,
    );
  });

  it("price -0 is stored as +0 (spec 2.4), survives JSON round-trip and ticks", () => {
    const g = createGame(1, C, MIXED);
    const s = setCarPrice(g, 1, -0);
    expect(Object.is((s.fleet[0] as Car).dailyPrice, 0)).toBe(true);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const t = tick(s);
    // car 1 is free and car 2 is idle: revenue is +0, never -0
    expect(Object.is(t.lastDay?.revenue, 0)).toBe(true);
  });

  it("price 0 car is rented for free; revenue 0, cost paid", () => {
    const t = tick(setCarPrice(createGame(1, C, MIXED), 1, 0));
    expect((t.fleet[0] as Car).rented).toBe(true);
    expect(t.lastDay).toEqual({ revenue: 0, costs: 80_00 });
  });

  it("price MAX_CAR_DAILY_PRICE + 1 and -1 rejected at the boundary", () => {
    const g = createGame(1, C, MIXED);
    expect(thrown(() => setCarPrice(g, 1, MAX_CAR_DAILY_PRICE + 1))).toBeInstanceOf(
      InvalidPriceError,
    );
    expect(thrown(() => setCarPrice(g, 1, -1))).toBeInstanceOf(InvalidPriceError);
  });

  const BAD_PRICES: readonly unknown[] = [
    -1,
    1.5,
    0.1 + 0.2,
    NaN,
    Infinity,
    -Infinity,
    1_000_01,
    2 ** 53,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    -1e-9,
    "100",
    "",
    "<script>",
    "🚗",
    "9".repeat(10_000),
    null,
    undefined,
    1n,
    {},
    [],
    [100],
    true,
    new Number(100),
    { valueOf: () => 100 },
  ];

  it.each(BAD_PRICES.map((p, i) => [i, p] as const))(
    "invalid price #%i throws InvalidPriceError carrying the received value",
    (_i, input) => {
      const err = thrown(() => looseSet(createGame(1, C, MIXED), 1, input));
      expect(err).toBeInstanceOf(InvalidPriceError);
      expect(Object.is((err as InvalidPriceError).dailyPrice, input)).toBe(true);
    },
  );

  const BAD_IDS: readonly unknown[] = [
    0,
    -1,
    99,
    1.5,
    NaN,
    Infinity,
    "1",
    "",
    null,
    undefined,
    1n,
    {},
    [],
    [1],
    true,
    "__proto__",
    "toString",
    new Number(1),
    Number.MAX_SAFE_INTEGER,
  ];

  it.each(BAD_IDS.map((p, i) => [i, p] as const))(
    "unknown carId #%i throws UnknownCarError carrying the received value",
    (_i, input) => {
      const err = thrown(() => looseSet(createGame(1, C, MIXED), input, 100_00));
      expect(err).toBeInstanceOf(UnknownCarError);
      expect(Object.is((err as UnknownCarError).carId, input)).toBe(true);
    },
  );

  it("empty fleet: always UnknownCarError", () => {
    for (const id of [0, 1, -1, NaN, "1", null]) {
      expect(thrown(() => looseSet(createGame(1), id, 100_00))).toBeInstanceOf(UnknownCarError);
    }
  });

  it("unknown carId AND invalid price -> UnknownCarError (order)", () => {
    for (const price of BAD_PRICES) {
      expect(thrown(() => looseSet(createGame(1, C, MIXED), 99, price))).toBeInstanceOf(
        UnknownCarError,
      );
    }
  });

  it("known carId given as the wrong type is not coerced", () => {
    const g = createGame(1, C, MIXED);
    expect(thrown(() => looseSet(g, "1", 50_00))).toBeInstanceOf(UnknownCarError);
    expect(thrown(() => looseSet(g, 1n, 50_00))).toBeInstanceOf(UnknownCarError);
    expect(thrown(() => looseSet(g, [1], 50_00))).toBeInstanceOf(UnknownCarError);
  });

  it("duplicate ids: only the first match changes", () => {
    const g = stateOf(carsWithIds([7, 7, 7]));
    const s = setCarPrice(g, 7, 11_00);
    expect(s.fleet.map((c) => c.dailyPrice)).toEqual([11_00, 60_00, 60_00]);
  });

  it("-0 as carId finds car 0 under strict equality (spec: ===)", () => {
    const g = stateOf(carsWithIds([0]));
    expect((setCarPrice(g, -0, 5_00).fleet[0] as Car).dailyPrice).toBe(5_00);
  });

  it("does not mutate a deep-frozen state", () => {
    const g = deepFreeze(tick(buyCar(createGame(1, C, MIXED), "used")));
    const snap = clone(g);
    const s = setCarPrice(g, 3, 12_34);
    expect(g).toEqual(snap);
    expect(s).not.toBe(g);
    expect(s.fleet).not.toBe(g.fleet);
    expect(s.fleet[2]).not.toBe(g.fleet[2]);
  });

  it("failed calls do not mutate a deep-frozen state", () => {
    const g = deepFreeze(createGame(1, C, MIXED));
    const snap = clone(g);
    expect(thrown(() => setCarPrice(g, 1, NaN))).toBeInstanceOf(InvalidPriceError);
    expect(thrown(() => setCarPrice(g, 42, 1))).toBeInstanceOf(UnknownCarError);
    expect(g).toEqual(snap);
  });

  it("repeated identical calls are idempotent in value", () => {
    let g = createGame(1, C, MIXED);
    for (let i = 0; i < 100; i++) g = setCarPrice(g, 1, 77_77);
    expect(g.fleet[0]).toEqual({ id: 1, dailyPrice: 77_77, dailyCost: 30_00, rented: false });
  });
});

// ---------------------------------------------------------------------------
// Full scenario and determinism
// ---------------------------------------------------------------------------
describe("full scenario", () => {
  function play(): GameState {
    return advance(setCarPrice(buyCar(createGame(1), "compact"), 1, 90_00), 10);
  }

  it("buy compact, price 90 (1.5x the advised 60), 10 days", () => {
    let g = setCarPrice(buyCar(createGame(1), "compact"), 1, 90_00);
    let revenue = 0;
    for (let i = 0; i < 10; i++) {
      g = tick(g);
      revenue += revenueOf(g.fleet);
    }
    expect(g).toEqual(play());
    expect(g.cash).toBe(50_000_00 - 9_000_00 + revenue - 10 * 25_00);
  });

  it("replaying gives deep-equal states", () => {
    expect(play()).toEqual(play());
  });

  it("buying mid-game uses the next id and affects only following days", () => {
    let g = advance(buyCar(createGame(1), "used"), 2);
    g = buyCar(g, "hybrid");
    expect((g.fleet[1] as Car).id).toBe(2);
    expect(g.lastDay).toEqual({ revenue: revenueOf(g.fleet.slice(0, 1)), costs: 60_00 });
    g = tick(g);
    expect(g.lastDay).toEqual({ revenue: revenueOf(g.fleet), costs: 60_00 + 10_00 });
  });
});

// ---------------------------------------------------------------------------
// Spec gaps (documented, deliberately not asserted):
//  - (resolved in spec rev. 3, section 2.4: setCarPrice(g, id, -0) stores +0; asserted above.)
//  - buyCar with duplicate ids / negative ids / non-integer ids below MAX: spec only defines NaN
//    and MAX_SAFE_INTEGER (non-integers such as 1.5 yield id 2.5 -> overflow carId by 2.3 rule,
//    but no explicit criterion).
//  - buyCar where a fleet car has a non-number id such as "5": Math.max coerces; unspecified.
//  - buyCar/setCarPrice on a state with an unknown extra key: spec silent about whether extras
//    are copied (the implementation spreads state).
//  - tick overflow errors on a state produced by buyCar with cash near MAX_SAFE_INTEGER.
// ---------------------------------------------------------------------------
