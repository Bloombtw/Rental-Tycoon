import { describe, expect, it } from "vitest";
import * as sim from "./index.js";
import {
  InvalidDaysError,
  InvalidFleetError,
  InvalidSeedError,
  InvalidStartingCashError,
  MAX_ACCEPTED_DAILY_PRICE,
  MAX_ADVANCE_DAYS,
  MAX_CAR_DAILY_COST,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  SimError,
  SimOverflowError,
  advance,
  createGame,
  tick,
  type Car,
  type CarId,
  type Cents,
  type GameState,
  type NewCar,
} from "./index.js";

// ---------------------------------------------------------------------------
// Reference fleets (spec section 7)
// ---------------------------------------------------------------------------
const PROFITABLE: readonly NewCar[] = [
  { dailyPrice: 60_00, dailyCost: 25_00 },
  { dailyPrice: 90_00, dailyCost: 40_00 },
];
const IDLE: readonly NewCar[] = [
  { dailyPrice: 200_00, dailyCost: 30_00 },
  { dailyPrice: 160_00, dailyCost: 20_00 },
];
const MIXED: readonly NewCar[] = [
  { dailyPrice: 100_00, dailyCost: 30_00 },
  { dailyPrice: 300_00, dailyCost: 50_00 },
];
const C: Cents = 10_000_00;

// ---------------------------------------------------------------------------
// Helpers for untyped / hostile input (no `any`, no ts-ignore)
// ---------------------------------------------------------------------------
type LooseCreate = (...args: unknown[]) => GameState;
type LooseAdvance = (state: unknown, days: unknown) => GameState;
const looseCreate = createGame as unknown as LooseCreate;
const looseAdvance = advance as unknown as LooseAdvance;
const looseTick = tick as unknown as (state: unknown) => GameState;

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

function ticks(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s);
  return s;
}

function expectSimError(e: unknown, cls: new (...a: never[]) => SimError, code: string): void {
  expect(e).toBeInstanceOf(cls);
  expect(e).toBeInstanceOf(SimError);
  expect(e).toBeInstanceOf(RangeError);
  expect(e).toBeInstanceOf(Error);
  expect((e as SimError).code).toBe(code);
}

function expectFleetError(
  fn: () => unknown,
  index: number | null,
  field: "fleet" | "dailyPrice" | "dailyCost",
): void {
  const e = thrown(fn);
  expectSimError(e, InvalidFleetError, "INVALID_FLEET");
  expect((e as InvalidFleetError).name).toBe("InvalidFleetError");
  expect((e as InvalidFleetError).index).toBe(index);
  expect((e as InvalidFleetError).field).toBe(field);
}

function expectOverflow(fn: () => unknown, field: "cash" | "day"): void {
  const e = thrown(fn);
  expectSimError(e, SimOverflowError, "SIM_OVERFLOW");
  expect((e as SimOverflowError).name).toBe("SimOverflowError");
  expect((e as SimOverflowError).field).toBe(field);
}

function fleetOf(n: number, car: NewCar): NewCar[] {
  return Array.from({ length: n }, () => ({ ...car }));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
describe("exports", () => {
  it("constants have exactly the specified values", () => {
    expect(MAX_ACCEPTED_DAILY_PRICE).toBe(150_00);
    expect(MAX_CAR_DAILY_PRICE).toBe(1_000_00);
    expect(MAX_CAR_DAILY_COST).toBe(1_000_00);
    expect(MAX_FLEET_SIZE).toBe(50);
    expect(MAX_ADVANCE_DAYS).toBe(3_650);
  });

  it("does not export DAILY_INCOME", () => {
    expect("DAILY_INCOME" in sim).toBe(false);
  });

  it("exports functions and error classes from ./index.js", () => {
    for (const f of [createGame, tick, advance]) expect(typeof f).toBe("function");
    for (const c of [
      SimError,
      InvalidDaysError,
      SimOverflowError,
      InvalidFleetError,
      InvalidSeedError,
      InvalidStartingCashError,
    ]) {
      expect(typeof c).toBe("function");
    }
  });

  it("concrete errors extend SimError which extends RangeError", () => {
    expect(Object.getPrototypeOf(InvalidDaysError.prototype)).toBe(SimError.prototype);
    expect(Object.getPrototypeOf(SimOverflowError.prototype)).toBe(SimError.prototype);
    expect(Object.getPrototypeOf(InvalidFleetError.prototype)).toBe(SimError.prototype);
    expect(Object.getPrototypeOf(InvalidSeedError.prototype)).toBe(SimError.prototype);
    expect(Object.getPrototypeOf(InvalidStartingCashError.prototype)).toBe(SimError.prototype);
    expect(Object.getPrototypeOf(SimError.prototype)).toBe(RangeError.prototype);
  });
});

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------
describe("createGame: fleet", () => {
  it("createGame(1) has an empty fleet; tick leaves cash alone and advances day", () => {
    const g = createGame(1);
    expect(g.fleet).toEqual([]);
    const t = tick(g);
    expect(t.cash).toBe(g.cash);
    expect(t.day).toBe(g.day + 1);
    expect(t.fleet).toEqual([]);
  });

  it("createGame(1, 1000) has an empty fleet", () => {
    expect(createGame(1, 1000).fleet).toEqual([]);
  });

  it("assigns ids index + 1 and rented=false", () => {
    const g = createGame(1, C, PROFITABLE);
    expect(g.fleet).toEqual([
      { id: 1, dailyPrice: 60_00, dailyCost: 25_00, rented: false },
      { id: 2, dailyPrice: 90_00, dailyCost: 40_00, rented: false },
    ]);
    const id: CarId | undefined = g.fleet[0]?.id;
    expect(id).toBe(1);
  });

  it("starts at day 0 with the given cash", () => {
    const g = createGame(5, C, PROFITABLE);
    expect(g.day).toBe(0);
    expect(g.cash).toBe(C);
  });

  it("copies input: mutating the array or the objects afterwards does not change the state", () => {
    const input: { dailyPrice: number; dailyCost: number }[] = [
      { dailyPrice: 60_00, dailyCost: 25_00 },
      { dailyPrice: 90_00, dailyCost: 40_00 },
    ];
    const g = createGame(1, C, input);
    const snapshot = clone(g);
    const first = input[0];
    if (first) {
      first.dailyPrice = 1;
      first.dailyCost = 2;
    }
    input.push({ dailyPrice: 3, dailyCost: 4 });
    input.reverse();
    expect(g).toEqual(snapshot);
    expect(g.fleet).toHaveLength(2);
  });

  it("does not keep a reference to the input array or its cars", () => {
    const input = [{ dailyPrice: 60_00, dailyCost: 25_00 }];
    const g = createGame(1, C, input);
    expect(g.fleet).not.toBe(input);
    expect(g.fleet[0]).not.toBe(input[0]);
  });

  it("accepts a deep-frozen input fleet", () => {
    const frozen = deepFreeze(clone([...PROFITABLE]));
    expect(() => createGame(1, C, frozen)).not.toThrow();
  });

  it("accepts boundary values 0 and MAX for price and cost", () => {
    const g = createGame(1, C, [
      { dailyPrice: 0, dailyCost: 0 },
      { dailyPrice: MAX_CAR_DAILY_PRICE, dailyCost: MAX_CAR_DAILY_COST },
      { dailyPrice: MAX_CAR_DAILY_PRICE, dailyCost: 0 },
      { dailyPrice: 0, dailyCost: MAX_CAR_DAILY_COST },
    ]);
    expect(g.fleet).toHaveLength(4);
  });

  it("accepts a fleet of exactly MAX_FLEET_SIZE cars with ids 1..N", () => {
    const g = createGame(1, C, fleetOf(MAX_FLEET_SIZE, { dailyPrice: 60_00, dailyCost: 25_00 }));
    expect(g.fleet).toHaveLength(MAX_FLEET_SIZE);
    expect(g.fleet.map((c) => c.id)).toEqual(
      Array.from({ length: MAX_FLEET_SIZE }, (_, i) => i + 1),
    );
  });

  it("accepts an explicitly empty fleet", () => {
    expect(createGame(1, C, []).fleet).toEqual([]);
  });

  it("rejects MAX_FLEET_SIZE + 1 cars (index null, field fleet)", () => {
    expectFleetError(
      () => createGame(1, C, fleetOf(MAX_FLEET_SIZE + 1, { dailyPrice: 1, dailyCost: 1 })),
      null,
      "fleet",
    );
  });

  it("rejects a huge fleet (100000 cars) without hanging", () => {
    expectFleetError(
      () => createGame(1, C, fleetOf(100_000, { dailyPrice: 1, dailyCost: 1 })),
      null,
      "fleet",
    );
  });

  it.each([
    ["null", null],
    ["{}", {}],
    ["string", "x"],
    ["number", 3],
    ["boolean", true],
  ])("rejects non-array fleet: %s", (_label, value) => {
    expectFleetError(() => looseCreate(1, C, value), null, "fleet");
  });

  it("rejects an array-like object as fleet", () => {
    const arrayLike = { length: 1, 0: { dailyPrice: 1, dailyCost: 1 } };
    expectFleetError(() => looseCreate(1, C, arrayLike), null, "fleet");
  });

  it("rejects a Set / iterable as fleet", () => {
    expectFleetError(
      () => looseCreate(1, C, new Set([{ dailyPrice: 1, dailyCost: 1 }])),
      null,
      "fleet",
    );
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["number", 5],
    ["string", "car"],
    ["boolean", true],
  ])("rejects non-object / null car element: %s (index i, field dailyPrice)", (_l, bad) => {
    expectFleetError(
      () => looseCreate(1, C, [{ dailyPrice: 1, dailyCost: 1 }, bad]),
      1,
      "dailyPrice",
    );
  });

  it("rejects a hole in a sparse fleet (reads as undefined)", () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [{ dailyPrice: 1, dailyCost: 1 }, , { dailyPrice: 1, dailyCost: 1 }];
    expectFleetError(() => looseCreate(1, C, sparse), 1, "dailyPrice");
  });

  it("rejects a sparse fleet made with only length set", () => {
    const sparse = new Array<unknown>(3);
    expectFleetError(() => looseCreate(1, C, sparse), 0, "dailyPrice");
  });

  const badMoney: [string, unknown][] = [
    ["-1", -1],
    ["1.5", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["MAX+1", MAX_CAR_DAILY_PRICE + 1],
    ["string '100'", "100"],
    ["undefined", undefined],
    ["null", null],
    ["2**53", 2 ** 53],
    ["Number.MAX_VALUE", Number.MAX_VALUE],
    ["bigint", 5n],
    ["boxed Number", new Number(5)],
    ["array [5]", [5]],
    ["-Number.MIN_VALUE (tiny float)", Number.MIN_VALUE],
  ];

  it.each(badMoney)("rejects dailyPrice = %s", (_l, bad) => {
    expectFleetError(() => looseCreate(1, C, [{ dailyPrice: bad, dailyCost: 1 }]), 0, "dailyPrice");
  });

  it.each(
    badMoney.map(
      ([l, v]) =>
        [l, v === MAX_CAR_DAILY_PRICE + 1 ? MAX_CAR_DAILY_COST + 1 : v] as [string, unknown],
    ),
  )("rejects dailyCost = %s", (_l, bad) => {
    expectFleetError(() => looseCreate(1, C, [{ dailyPrice: 1, dailyCost: bad }]), 0, "dailyCost");
  });

  it("rejects an absent dailyPrice / dailyCost key", () => {
    expectFleetError(() => looseCreate(1, C, [{ dailyCost: 1 }]), 0, "dailyPrice");
    expectFleetError(() => looseCreate(1, C, [{ dailyPrice: 1 }]), 0, "dailyCost");
    expectFleetError(() => looseCreate(1, C, [{}]), 0, "dailyPrice");
  });

  it("reports the first defect in fleet order, dailyPrice before dailyCost", () => {
    expectFleetError(
      () =>
        looseCreate(1, C, [
          { dailyPrice: 1, dailyCost: 1 },
          { dailyPrice: -1, dailyCost: -1 },
          null,
        ]),
      1,
      "dailyPrice",
    );
    expectFleetError(
      () =>
        looseCreate(1, C, [
          { dailyPrice: 1, dailyCost: 1 },
          { dailyPrice: 1, dailyCost: -1 },
          null,
        ]),
      1,
      "dailyCost",
    );
    expectFleetError(
      () =>
        looseCreate(1, C, [{ dailyPrice: 1, dailyCost: 1 }, { dailyPrice: 1, dailyCost: 1 }, null]),
      2,
      "dailyPrice",
    );
  });

  it("flags the offending car even at the last index of a full fleet", () => {
    const f: unknown[] = fleetOf(MAX_FLEET_SIZE, { dailyPrice: 1, dailyCost: 1 });
    f[MAX_FLEET_SIZE - 1] = { dailyPrice: 1, dailyCost: NaN };
    expectFleetError(() => looseCreate(1, C, f), MAX_FLEET_SIZE - 1, "dailyCost");
  });

  it("treats -0 price/cost as valid zero (0 <= -0)", () => {
    const g = createGame(1, C, [{ dailyPrice: -0, dailyCost: -0 }]);
    const t = tick(g);
    expect(t.cash).toBe(C);
    expect(t.fleet[0]?.rented).toBe(true);
  });

  it("treats -0 startingCash and -0 seed as valid; seed -0 is normalised to +0 (spec rev 5)", () => {
    expect(createGame(1, -0).cash === 0).toBe(true);
    expect(() => createGame(-0)).not.toThrow();
    const g = createGame(-0);
    expect(Object.is(g.seed, 0)).toBe(true);
    expect(g.rngState).toBe(0);
  });

  it("a 51-car fleet that also contains an invalid car reports the fleet size (spec rev 5)", () => {
    const f: unknown[] = fleetOf(MAX_FLEET_SIZE + 1, { dailyPrice: 1, dailyCost: 1 });
    f[3] = { dailyPrice: NaN, dailyCost: 1 };
    f[MAX_FLEET_SIZE] = null;
    expectFleetError(() => looseCreate(1, C, f), null, "fleet");
  });

  it("drops extra properties of a NewCar: car keys are exactly id, dailyPrice, dailyCost, rented (spec rev 5)", () => {
    const g = createGame(1, C, [{ dailyPrice: 1, dailyCost: 2, colour: "red", id: 9 } as NewCar]);
    expect(Object.keys(g.fleet[0] ?? {}).sort()).toEqual([
      "dailyCost",
      "dailyPrice",
      "id",
      "rented",
    ]);
  });

  it("ignores extra properties on cars without crashing the simulation (shape not asserted)", () => {
    const withExtras = [
      { dailyPrice: 60_00, dailyCost: 25_00, colour: "red", id: 99, rented: true },
    ];
    const g = createGame(1, C, withExtras);
    // Spec: ids are assigned by createGame, never taken from the input.
    expect(g.fleet[0]?.id).toBe(1);
    // Spec: rented is false at creation.
    expect(g.fleet[0]?.rented).toBe(false);
    expect(tick(g).cash).toBe(C + 35_00);
  });

  it("does not leak prototype-polluted fields (inherited price is not trusted as own)", () => {
    const proto = { dailyPrice: 1, dailyCost: 1 };
    const car = Object.create(proto) as Record<string, unknown>;
    // Whether inherited props count is unspecified; only require no NaN/undefined state if accepted.
    try {
      const g = looseCreate(1, C, [car]);
      for (const c of g.fleet) {
        expect(Number.isSafeInteger(c.dailyPrice)).toBe(true);
        expect(Number.isSafeInteger(c.dailyCost)).toBe(true);
      }
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidFleetError);
    }
  });

  it("a getter that returns a different value on each read never yields an invalid accepted car", () => {
    let reads = 0;
    const car = {
      get dailyPrice(): number {
        reads++;
        return reads === 1 ? 100 : Number.NaN;
      },
      dailyCost: 1,
    };
    try {
      const g = looseCreate(1, C, [car]);
      for (const c of g.fleet) {
        expect(Number.isSafeInteger(c.dailyPrice)).toBe(true);
        expect(c.dailyPrice).toBeGreaterThanOrEqual(0);
        expect(c.dailyPrice).toBeLessThanOrEqual(MAX_CAR_DAILY_PRICE);
      }
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidFleetError);
    }
  });

  it("a getter that changes to an out-of-range value never yields an invalid accepted car", () => {
    let reads = 0;
    const car = {
      dailyPrice: 1,
      get dailyCost(): number {
        reads++;
        return reads === 1 ? 5 : MAX_CAR_DAILY_COST * 1000;
      },
    };
    try {
      const g = looseCreate(1, C, [car]);
      for (const c of g.fleet) {
        expect(c.dailyCost).toBeLessThanOrEqual(MAX_CAR_DAILY_COST);
        expect(Number.isSafeInteger(c.dailyCost)).toBe(true);
      }
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidFleetError);
    }
  });

  it("a Proxy fleet that is not a real array is rejected as non-array or handled without garbage", () => {
    const proxy = new Proxy([{ dailyPrice: 1, dailyCost: 1 }], {});
    // Array.isArray(proxy of array) is true, so either outcome is a valid state; just no garbage.
    const g = looseCreate(1, C, proxy);
    expect(g.fleet).toEqual([{ id: 1, dailyPrice: 1, dailyCost: 1, rented: false }]);
  });
});

describe("createGame: seed", () => {
  const badSeeds: [string, unknown][] = [
    ["NaN", NaN],
    ["1.5", 1.5],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["2**53", 2 ** 53],
    ["string '1'", "1"],
    ["null", null],
    ["undefined", undefined],
    ["bigint", 1n],
    ["object", {}],
    ["boxed Number", new Number(1)],
    ["-(2**53)", -(2 ** 53)],
    ["MIN_VALUE", Number.MIN_VALUE],
  ];

  it.each(badSeeds)("rejects seed = %s", (_l, bad) => {
    const e = thrown(() => looseCreate(bad));
    expectSimError(e, InvalidSeedError, "INVALID_SEED");
    expect((e as InvalidSeedError).name).toBe("InvalidSeedError");
    expect(Object.is((e as InvalidSeedError).seed, bad)).toBe(true);
  });

  it("rejects a missing seed (no args)", () => {
    const e = thrown(() => looseCreate());
    expectSimError(e, InvalidSeedError, "INVALID_SEED");
    expect((e as InvalidSeedError).seed).toBeUndefined();
  });

  it.each([-1, 0, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 42])("accepts seed %s", (s) => {
    const g = createGame(s);
    expect(g.seed).toBe(s);
    expect(g.day).toBe(0);
  });

  it("keeps rngState as an unsigned 32-bit value derived from seed", () => {
    const g = createGame(-1);
    expect(g.rngState).toBe(-1 >>> 0);
  });
});

describe("createGame: startingCash", () => {
  const badCash: [string, unknown][] = [
    ["-1", -1],
    ["10.5", 10.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["2**53", 2 ** 53],
    ["string '100'", "100"],
    ["null", null],
    ["bigint", 100n],
    ["object", {}],
    ["MIN_SAFE_INTEGER", Number.MIN_SAFE_INTEGER],
    ["-1e-9", -1e-9],
  ];

  it.each(badCash)("rejects startingCash = %s", (_l, bad) => {
    const e = thrown(() => looseCreate(1, bad));
    expectSimError(e, InvalidStartingCashError, "INVALID_STARTING_CASH");
    expect((e as InvalidStartingCashError).name).toBe("InvalidStartingCashError");
    expect(Object.is((e as InvalidStartingCashError).startingCash, bad)).toBe(true);
  });

  it("accepts 0 and MAX_SAFE_INTEGER", () => {
    expect(createGame(1, 0).cash).toBe(0);
    expect(createGame(1, Number.MAX_SAFE_INTEGER).cash).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("explicit undefined takes the default 50_000_00", () => {
    expect(createGame(1, undefined).cash).toBe(50_000_00);
    expect(createGame(1).cash).toBe(50_000_00);
  });

  it("explicit undefined fleet takes the default []", () => {
    expect(looseCreate(1, C, undefined).fleet).toEqual([]);
  });
});

describe("createGame: validation order", () => {
  it("seed is checked before startingCash and fleet", () => {
    expect(thrown(() => looseCreate(NaN, -1, null))).toBeInstanceOf(InvalidSeedError);
  });
  it("startingCash is checked before fleet", () => {
    expect(thrown(() => looseCreate(1, -1, null))).toBeInstanceOf(InvalidStartingCashError);
  });
  it("only the first error is thrown (not an aggregate)", () => {
    const e = thrown(() => looseCreate("x", "y", "z"));
    expect(e).toBeInstanceOf(InvalidSeedError);
    expect(e).not.toBeInstanceOf(InvalidStartingCashError);
    expect(e).not.toBeInstanceOf(InvalidFleetError);
  });
  it("fleet error is reached once seed and cash are valid", () => {
    expect(thrown(() => looseCreate(1, 0, null))).toBeInstanceOf(InvalidFleetError);
  });
});

describe("createGame: existing sim.test.ts behaviours stay RangeErrors", () => {
  it("seed NaN, startingCash -1 / 10.5 still satisfy toThrow(RangeError)", () => {
    expect(() => createGame(NaN)).toThrow(RangeError);
    expect(() => createGame(1, -1)).toThrow(RangeError);
    expect(() => createGame(1, 10.5)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// tick and revenue
// ---------------------------------------------------------------------------
describe("tick: revenue", () => {
  it("PROFITABLE: cash strictly increases every day", () => {
    let s = createGame(7, C, PROFITABLE);
    for (let i = 0; i < 100; i++) {
      const next = tick(s);
      expect(next.cash).toBeGreaterThan(s.cash);
      s = next;
    }
  });

  it.each([1, 30, 365, 3650])("PROFITABLE: advance %i days => C + N * 85_00", (n) => {
    expect(advance(createGame(3, C, PROFITABLE), n).cash).toBe(C + n * 85_00);
  });

  it.each([1, 30, 365, 3650])("IDLE: advance %i days => C - N * 50_00", (n) => {
    expect(advance(createGame(3, C * 1000, IDLE), n).cash).toBe(C * 1000 - n * 50_00);
  });

  it("IDLE: no car is ever rented and cash goes negative without error", () => {
    const g = createGame(1, 0, IDLE);
    const t = advance(g, 10);
    expect(t.cash).toBe(-500_00);
    expect(t.fleet.every((c) => !c.rented)).toBe(true);
  });

  it("negative cash keeps simulating normally (no bankruptcy / blocking)", () => {
    const g = advance(createGame(1, 0, IDLE), 1000);
    expect(g.cash).toBe(-1000 * 50_00);
    expect(g.day).toBe(1000);
    expect(tick(g).day).toBe(1001);
  });

  it("MIXED: after 1 tick car 0 rented, car 1 not, cash + 20_00", () => {
    const t = tick(createGame(1, C, MIXED));
    expect(t.fleet[0]?.rented).toBe(true);
    expect(t.fleet[1]?.rented).toBe(false);
    expect(t.cash).toBe(C + 20_00);
    expect(t.day).toBe(1);
  });

  it("MIXED: advance N => C + N * 20_00", () => {
    expect(advance(createGame(1, C, MIXED), 365).cash).toBe(C + 365 * 20_00);
  });

  it("threshold: price == MAX_ACCEPTED_DAILY_PRICE is rented, +1 is not", () => {
    const g = createGame(1, C, [
      { dailyPrice: MAX_ACCEPTED_DAILY_PRICE - 1, dailyCost: 0 },
      { dailyPrice: MAX_ACCEPTED_DAILY_PRICE, dailyCost: 0 },
      { dailyPrice: MAX_ACCEPTED_DAILY_PRICE + 1, dailyCost: 0 },
    ]);
    const t = tick(g);
    expect(t.fleet.map((c) => c.rented)).toEqual([true, true, false]);
    expect(t.cash).toBe(C + MAX_ACCEPTED_DAILY_PRICE - 1 + MAX_ACCEPTED_DAILY_PRICE);
  });

  it("price 0 / cost 10_00 is rented and loses 10_00 per day", () => {
    const g = createGame(1, C, [{ dailyPrice: 0, dailyCost: 10_00 }]);
    const t = tick(g);
    expect(t.fleet[0]?.rented).toBe(true);
    expect(t.cash).toBe(C - 10_00);
    expect(advance(g, 7).cash).toBe(C - 70_00);
  });

  it("a car at MAX_CAR_DAILY_PRICE is never rented and costs its full dailyCost", () => {
    const g = createGame(1, C, [
      { dailyPrice: MAX_CAR_DAILY_PRICE, dailyCost: MAX_CAR_DAILY_COST },
    ]);
    const t = tick(g);
    expect(t.fleet[0]?.rented).toBe(false);
    expect(t.cash).toBe(C - MAX_CAR_DAILY_COST);
  });

  it("rented is recomputed every day, not sticky (hand-built stale rented flag)", () => {
    const g = createGame(1, C, IDLE);
    const stale: GameState = { ...g, fleet: g.fleet.map((c) => ({ ...c, rented: true })) };
    const t = tick(stale);
    expect(t.fleet.every((c) => !c.rented)).toBe(true);
    expect(t.cash).toBe(C - 50_00);

    const g2 = createGame(1, C, PROFITABLE);
    const stale2: GameState = { ...g2, fleet: g2.fleet.map((c) => ({ ...c, rented: false })) };
    expect(tick(stale2).fleet.every((c) => c.rented)).toBe(true);
  });

  it("formula holds for a full fleet: cash' = cash + sum(rented prices) - sum(all costs)", () => {
    const fleet: NewCar[] = Array.from({ length: MAX_FLEET_SIZE }, (_, i) => ({
      dailyPrice: (i * 7_00) % (MAX_CAR_DAILY_PRICE + 1),
      dailyCost: (i * 3_33) % (MAX_CAR_DAILY_COST + 1),
    }));
    let expected = 0;
    for (const car of fleet) {
      if (car.dailyPrice <= MAX_ACCEPTED_DAILY_PRICE) expected += car.dailyPrice;
      expected -= car.dailyCost;
    }
    const t = tick(createGame(9, C, fleet));
    expect(t.cash).toBe(C + expected);
    expect(t.fleet.map((c) => c.rented)).toEqual(
      fleet.map((c) => c.dailyPrice <= MAX_ACCEPTED_DAILY_PRICE),
    );
  });

  it("only the specified fields change: seed, rngState, ids, prices, costs, order", () => {
    const g = createGame(123, C, MIXED);
    const t = advance(g, 5);
    expect(t.seed).toBe(g.seed);
    expect(t.rngState).toBe(g.rngState);
    expect(t.fleet.map((c) => c.id)).toEqual(g.fleet.map((c) => c.id));
    expect(t.fleet.map((c) => c.dailyPrice)).toEqual(g.fleet.map((c) => c.dailyPrice));
    expect(t.fleet.map((c) => c.dailyCost)).toEqual(g.fleet.map((c) => c.dailyCost));
    expect(Object.keys(t).sort()).toEqual([
      "cash",
      "day",
      "fleet",
      "lastDay",
      "minute",
      "rngState",
      "seed",
      "todayRevenue",
    ]);
    for (const c of t.fleet) {
      expect(Object.keys(c).sort()).toEqual(["dailyCost", "dailyPrice", "id", "rented"]);
    }
  });

  it("rngState is neither read nor modified (any value survives, even invalid ones)", () => {
    const base = createGame(1, C, MIXED);
    for (const rngState of [0, 1, 2 ** 32 - 1, -5, 1.5, NaN]) {
      const t = tick({ ...base, rngState });
      expect(Object.is(t.rngState, rngState)).toBe(true);
    }
  });

  it("seed is copied verbatim", () => {
    const base = createGame(1, C, MIXED);
    const t = tick({ ...base, seed: Number.MAX_SAFE_INTEGER });
    expect(t.seed).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("ids are copied from state, not recomputed (hand-built non-sequential ids)", () => {
    const base = createGame(1, C, PROFITABLE);
    const odd: GameState = {
      ...base,
      fleet: [
        { id: 7, dailyPrice: 60_00, dailyCost: 25_00, rented: false },
        { id: 3, dailyPrice: 90_00, dailyCost: 40_00, rented: false },
      ],
    };
    expect(tick(odd).fleet.map((c) => c.id)).toEqual([7, 3]);
  });
});

describe("tick: immutability", () => {
  it("returns a new state object and a new fleet array and new car objects", () => {
    const g = createGame(1, C, PROFITABLE);
    const t = tick(g);
    expect(t).not.toBe(g);
    expect(t.fleet).not.toBe(g.fleet);
    t.fleet.forEach((c, i) => expect(c).not.toBe(g.fleet[i]));
  });

  it("empty fleet: no slot is crossed, so the fleet reference is reused but the state is new", () => {
    const g = createGame(1);
    expect(tick(g)).not.toBe(g);
    expect(tick(g).fleet).toBe(g.fleet);
  });

  it("does not mutate the input", () => {
    const g = createGame(1, C, MIXED);
    const copy = clone(g);
    tick(g);
    advance(g, 10);
    expect(g).toEqual(copy);
  });

  it("deep-frozen state: tick and advance neither throw nor change the input", () => {
    const g = deepFreeze(createGame(1, C, MIXED));
    const copy = clone(g);
    expect(() => tick(g)).not.toThrow();
    expect(() => advance(g, 50)).not.toThrow();
    expect(g).toEqual(copy);
    expect(tick(g).fleet).not.toBe(g.fleet);
  });

  it("a deep-frozen state produces a result that is itself usable (not frozen-shared)", () => {
    const g = deepFreeze(createGame(1, C, MIXED));
    const t = tick(g);
    expect(t.cash).toBe(C + 20_00);
    expect(() => tick(t)).not.toThrow();
  });

  it("tick on a state whose fleet array is frozen but cars are not", () => {
    const base = createGame(1, C, MIXED);
    const g: GameState = { ...base, fleet: Object.freeze([...base.fleet]) };
    expect(() => tick(g)).not.toThrow();
  });

  it("mutating the result never affects the input state", () => {
    const g = createGame(1, C, MIXED);
    const copy = clone(g);
    const t = tick(g);
    const mutable = t.fleet as Car[];
    mutable.pop();
    const first = mutable[0] as { rented: boolean } | undefined;
    if (first) first.rented = !first.rented;
    expect(g).toEqual(copy);
  });

  it("two ticks of the same input are independent objects but deep-equal", () => {
    const g = createGame(1, C, MIXED);
    const a = tick(g);
    const b = tick(g);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.fleet).not.toBe(b.fleet);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
describe("determinism", () => {
  it("advance(createGame(42, C, MIXED), 100) twice gives deep-equal states", () => {
    expect(advance(createGame(42, C, MIXED), 100)).toEqual(advance(createGame(42, C, MIXED), 100));
  });

  it("different seeds with the same fleet give the same cash and fleet", () => {
    const a = advance(createGame(1, C, MIXED), 100);
    const b = advance(createGame(999, C, MIXED), 100);
    const c = advance(createGame(-7, C, MIXED), 100);
    expect(a.cash).toBe(b.cash);
    expect(a.cash).toBe(c.cash);
    expect(a.fleet).toEqual(b.fleet);
    expect(a.fleet).toEqual(c.fleet);
  });

  it("tick does not depend on Date/global state (same result 1000 times)", () => {
    const g = createGame(5, C, MIXED);
    const first = tick(g);
    for (let i = 0; i < 1000; i++) expect(tick(g)).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// advance
// ---------------------------------------------------------------------------
describe("advance", () => {
  const fleets: [string, readonly NewCar[]][] = [
    ["empty", []],
    ["PROFITABLE", PROFITABLE],
    ["IDLE", IDLE],
    ["MIXED", MIXED],
  ];

  describe.each(fleets)("fleet %s", (_name, fleet) => {
    it.each([0, 1, 2, 7, 30, 100, 365])("advance(g, %i) deep-equals N ticks", (n) => {
      for (const seed of [1, 42, -3]) {
        const g = createGame(seed, C, fleet);
        expect(advance(g, n)).toEqual(ticks(g, n));
      }
    });
  });

  it("advance(g, MAX_ADVANCE_DAYS) deep-equals that many ticks", () => {
    const g = createGame(1, C, MIXED);
    expect(advance(g, MAX_ADVANCE_DAYS)).toEqual(ticks(g, MAX_ADVANCE_DAYS));
  });

  it.each([
    [0, 0],
    [1, 1],
    [5, 0],
    [0, 9],
    [100, 250],
    [1825, 1825],
    [MAX_ADVANCE_DAYS, 0],
    [0, MAX_ADVANCE_DAYS],
  ])("composition: advance(advance(g, %i), %i) == advance(g, a + b)", (a, b) => {
    const g = createGame(8, C, MIXED);
    expect(advance(advance(g, a), b)).toEqual(advance(g, a + b));
  });

  it("advance(g, 0) and advance(g, -0) deep-equal g", () => {
    const g = createGame(1, C, MIXED);
    expect(advance(g, 0)).toEqual(g);
    expect(advance(g, -0)).toEqual(g);
  });

  it("advance(g, 0) and advance(g, -0) return the same reference (spec rev 5)", () => {
    const g = createGame(1, C, MIXED);
    expect(advance(g, 0)).toBe(g);
    expect(advance(g, -0)).toBe(g);
  });

  it("day increases by exactly N", () => {
    expect(advance(createGame(1, C, MIXED), 77).day).toBe(77);
  });

  it("works on a deep-frozen state with days = 0", () => {
    const g = deepFreeze(createGame(1, C, MIXED));
    expect(advance(g, 0)).toEqual(g);
  });

  it("advance on an empty fleet only moves the day", () => {
    const g = createGame(1, 123);
    const t = advance(g, 3650);
    expect(t.cash).toBe(123);
    expect(t.day).toBe(3650);
  });

  const badDays: [string, unknown][] = [
    ["-1", -1],
    ["1.5", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["MAX_ADVANCE_DAYS + 1", MAX_ADVANCE_DAYS + 1],
    ["2**53", 2 ** 53],
    ["Number.MAX_VALUE", Number.MAX_VALUE],
    ["string '3'", "3"],
    ["string '0'", "0"],
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["bigint 3n", 3n],
    ["bigint 0n", 0n],
    ["{}", {}],
    ["[]", []],
    ["[3]", [3]],
    ["boxed Number(3)", new Number(3)],
    ["object with valueOf 3", { valueOf: () => 3 }],
    ["true", true],
    ["false", false],
    ["Symbol-free function", () => 3],
    ["-1e-9", -1e-9],
    ["Number.MIN_VALUE", Number.MIN_VALUE],
    ["MIN_SAFE_INTEGER", Number.MIN_SAFE_INTEGER],
    ["MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
  ];

  it.each(badDays)("rejects days = %s", (_l, bad) => {
    const g = createGame(1, C, MIXED);
    const e = thrown(() => looseAdvance(g, bad));
    expectSimError(e, InvalidDaysError, "INVALID_DAYS");
    expect((e as InvalidDaysError).name).toBe("InvalidDaysError");
    expect(Object.is((e as InvalidDaysError).days, bad)).toBe(true);
  });

  it("rejects a missing days argument", () => {
    const e = thrown(() => (advance as unknown as (s: GameState) => GameState)(createGame(1)));
    expect(e).toBeInstanceOf(InvalidDaysError);
    expect((e as InvalidDaysError).days).toBeUndefined();
  });

  it("rejects a days object whose valueOf/toString would throw without calling them", () => {
    let called = 0;
    const hostile = {
      valueOf(): number {
        called++;
        throw new Error("valueOf called");
      },
      toString(): string {
        called++;
        throw new Error("toString called");
      },
    };
    const e = thrown(() => looseAdvance(createGame(1), hostile));
    expect(e).toBeInstanceOf(InvalidDaysError);
    expect(called).toBe(0);
  });

  it("invalid days on a state that would overflow throws InvalidDaysError first", () => {
    const g = createGame(1, Number.MAX_SAFE_INTEGER - 85_00, PROFITABLE);
    // A valid days value would overflow...
    expectOverflow(() => advance(g, 2), "cash");
    // ...but an invalid one is reported as such.
    for (const bad of [-1, 1.5, NaN, MAX_ADVANCE_DAYS + 1, "3", null]) {
      expect(thrown(() => looseAdvance(g, bad))).toBeInstanceOf(InvalidDaysError);
    }
  });

  it("invalid days on a corrupted state still reports InvalidDaysError first", () => {
    const g: GameState = { ...createGame(1, 0, IDLE), cash: NaN };
    expect(thrown(() => looseAdvance(g, -1))).toBeInstanceOf(InvalidDaysError);
  });

  it("advance(g, 0) on an already corrupted state does not tick (no overflow raised)", () => {
    // 0 ticks are performed, so no overflow check can fire; state must come back equal.
    const g: GameState = { ...createGame(1, 0, IDLE), day: Number.MAX_SAFE_INTEGER };
    expect(advance(g, 0)).toEqual(g);
  });

  it("invalid days leave the input intact", () => {
    const g = createGame(1, C, MIXED);
    const copy = clone(g);
    thrown(() => looseAdvance(g, -1));
    expect(g).toEqual(copy);
  });

  it("advance(g, 3650) with MAX_FLEET_SIZE cars finishes and is exact", () => {
    const fleet = fleetOf(MAX_FLEET_SIZE, { dailyPrice: 60_00, dailyCost: 25_00 });
    const t = advance(createGame(1, C, fleet), MAX_ADVANCE_DAYS);
    expect(t.cash).toBe(C + MAX_ADVANCE_DAYS * MAX_FLEET_SIZE * 35_00);
    expect(t.day).toBe(MAX_ADVANCE_DAYS);
    expect(t.fleet).toHaveLength(MAX_FLEET_SIZE);
  });

  it("advance(g, MAX_ADVANCE_DAYS) with a full fleet of unrentable cars (max loss)", () => {
    const fleet = fleetOf(MAX_FLEET_SIZE, {
      dailyPrice: MAX_CAR_DAILY_PRICE,
      dailyCost: MAX_CAR_DAILY_COST,
    });
    const t = advance(createGame(1, 0, fleet), MAX_ADVANCE_DAYS);
    expect(t.cash).toBe(-MAX_ADVANCE_DAYS * MAX_FLEET_SIZE * MAX_CAR_DAILY_COST);
  });

  it("advance(g, N>0) returns a fresh state whose mutation never affects the input", () => {
    const g = createGame(1, C, MIXED);
    const copy = clone(g);
    const t = advance(g, 1);
    expect(t).not.toBe(g);
    (t.fleet as Car[]).pop();
    expect(g).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// Overflow
// ---------------------------------------------------------------------------
describe("overflow", () => {
  it("positive overflow at the edge (live cash): day 1 succeeds, day 2 overflows at car 2's slot", () => {
    const g = createGame(1, Number.MAX_SAFE_INTEGER - 150_00, PROFITABLE);
    const copy = clone(g);
    expect(advance(g, 1).cash).toBe(Number.MAX_SAFE_INTEGER - 65_00);
    expectOverflow(() => advance(g, 2), "cash");
    expect(g).toEqual(copy);
  });

  it("tick throws exactly when cash + revenue (before costs) exceeds MAX_SAFE_INTEGER", () => {
    const ok = createGame(1, Number.MAX_SAFE_INTEGER - 150_00, PROFITABLE);
    expect(tick(ok).cash).toBe(Number.MAX_SAFE_INTEGER - 65_00);
    const bad = createGame(1, Number.MAX_SAFE_INTEGER - 150_00 + 1, PROFITABLE);
    expectOverflow(() => tick(bad), "cash");
  });

  it("overflow inside advance exposes no partial state and leaves a frozen input intact", () => {
    const g = deepFreeze(createGame(1, Number.MAX_SAFE_INTEGER - 150_00, PROFITABLE));
    const copy = clone(g);
    expectOverflow(() => advance(g, 10), "cash");
    expect(g).toEqual(copy);
  });

  it("negative overflow: one tick reaches MIN_SAFE_INTEGER, the next throws", () => {
    const g: GameState = { ...createGame(1, 0, IDLE), cash: Number.MIN_SAFE_INTEGER + 50_00 };
    const t = tick(g);
    expect(t.cash).toBe(Number.MIN_SAFE_INTEGER);
    expectOverflow(() => tick(t), "cash");
  });

  it("negative overflow through advance leaves the input intact", () => {
    const g: GameState = { ...createGame(1, 0, IDLE), cash: Number.MIN_SAFE_INTEGER + 50_00 };
    const copy = clone(g);
    expectOverflow(() => advance(g, 2), "cash");
    expect(g).toEqual(copy);
  });

  it.each([
    ["NaN", NaN],
    ["0.5", 0.5],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["2**53", 2 ** 53],
    ["-(2**60)", -(2 ** 60)],
  ])("hand-built state with cash = %s: tick throws SimOverflowError(cash)", (_l, cash) => {
    const g: GameState = { ...createGame(1, 0, PROFITABLE), cash };
    expectOverflow(() => tick(g), "cash");
    expectOverflow(() => advance(g, 1), "cash");
  });

  it("a corrupted cash is also caught on an empty fleet", () => {
    const g: GameState = { ...createGame(1), cash: NaN };
    expectOverflow(() => tick(g), "cash");
  });

  it("hand-built car with dailyCost NaN: tick throws SimOverflowError(cash)", () => {
    const base = createGame(1, C, PROFITABLE);
    const g: GameState = {
      ...base,
      fleet: [{ id: 1, dailyPrice: 60_00, dailyCost: NaN, rented: false }, ...base.fleet.slice(1)],
    };
    expectOverflow(() => tick(g), "cash");
  });

  it.each([
    ["dailyCost Infinity", { dailyPrice: 1, dailyCost: Infinity }],
    ["dailyCost 0.5", { dailyPrice: 1, dailyCost: 0.5 }],
    ["dailyCost 2**60", { dailyPrice: 1, dailyCost: 2 ** 60 }],
    ["dailyPrice 0.5 (rented, fractional revenue)", { dailyPrice: 0.5, dailyCost: 0 }],
    [
      "dailyPrice -Infinity (rented, infinite negative revenue)",
      { dailyPrice: -Infinity, dailyCost: 0 },
    ],
  ])("hand-built corrupted car (%s): tick throws SimOverflowError(cash)", (_l, car) => {
    const g: GameState = {
      ...createGame(1, C),
      fleet: [{ id: 1, rented: false, ...car }],
    };
    expectOverflow(() => tick(g), "cash");
  });

  it("revenue/costs individually unsafe but net+cash looks fine still throws (cash field)", () => {
    // Two huge costs and two huge prices cancel in cash arithmetic only if the sums were unchecked.
    const huge = 2 ** 52;
    const g: GameState = {
      ...createGame(1, C),
      fleet: [
        { id: 1, dailyPrice: 0, dailyCost: huge, rented: false },
        { id: 2, dailyPrice: 0, dailyCost: huge, rented: false },
        { id: 3, dailyPrice: 0, dailyCost: huge, rented: false },
      ],
    };
    // costs = 3 * 2**52 > MAX_SAFE_INTEGER, so costs is not a safe integer.
    expectOverflow(() => tick(g), "cash");
  });

  it("day overflow: day = MAX_SAFE_INTEGER throws SimOverflowError(day)", () => {
    const g: GameState = { ...createGame(1, C, PROFITABLE), day: Number.MAX_SAFE_INTEGER };
    expectOverflow(() => tick(g), "day");
  });

  it("day overflow is reached via advance, with intact input", () => {
    const g: GameState = { ...createGame(1, C, PROFITABLE), day: Number.MAX_SAFE_INTEGER - 2 };
    const copy = clone(g);
    expect(advance(g, 2).day).toBe(Number.MAX_SAFE_INTEGER);
    expectOverflow(() => advance(g, 3), "day");
    expect(g).toEqual(copy);
  });

  it("cash overflow wins over day overflow when both happen", () => {
    const g: GameState = {
      ...createGame(1, 0, PROFITABLE),
      cash: Number.MAX_SAFE_INTEGER,
      day: Number.MAX_SAFE_INTEGER,
    };
    expectOverflow(() => tick(g), "cash");
  });

  it("day = NaN or fractional is detected as a day overflow", () => {
    for (const day of [NaN, 0.5, Infinity]) {
      const g: GameState = { ...createGame(1, C, PROFITABLE), day };
      expectOverflow(() => tick(g), "day");
    }
  });

  it("overflow errors carry a non-empty message and a stack", () => {
    const g: GameState = { ...createGame(1, C), day: Number.MAX_SAFE_INTEGER };
    const e = thrown(() => tick(g)) as Error;
    expect(typeof e.message).toBe("string");
    expect(e.message.length).toBeGreaterThan(0);
    expect(typeof e.stack).toBe("string");
  });

  it("a failed tick does not poison later calls on other states", () => {
    const bad: GameState = { ...createGame(1, C), day: Number.MAX_SAFE_INTEGER };
    thrown(() => tick(bad));
    expect(tick(createGame(1, C, PROFITABLE)).cash).toBe(C + 85_00);
  });
});

// ---------------------------------------------------------------------------
// Hostile tick input (Never trust input)
// ---------------------------------------------------------------------------
describe("tick: hostile hand-built states", () => {
  const base = createGame(1, C, PROFITABLE);
  const cases: [string, unknown, "cash" | "day" | "returns"][] = [
    ["cash NaN", { ...base, cash: NaN }, "cash"],
    ["day NaN", { ...base, day: NaN }, "day"],
    [
      "car price NaN and cost NaN",
      { ...base, fleet: [{ id: 1, dailyPrice: NaN, dailyCost: NaN, rented: false }] },
      "cash",
    ],
    [
      "car price undefined, cost 5 (not rented, sums stay safe)",
      { ...base, fleet: [{ id: 1, dailyPrice: undefined, dailyCost: 5, rented: false }] },
      "returns",
    ],
  ];

  it.each(cases)(
    "%s: SimOverflowError or safe cash/day; car fields of corrupt states are NOT validated by tick (known gap, deferred to save/load spec)",
    (_label, state, expected) => {
      if (expected === "returns") {
        const t = looseTick(state);
        expect(Number.isSafeInteger(t.cash)).toBe(true);
        expect(Number.isSafeInteger(t.day)).toBe(true);
      } else {
        expectOverflow(() => looseTick(state), expected);
      }
    },
  );
});
