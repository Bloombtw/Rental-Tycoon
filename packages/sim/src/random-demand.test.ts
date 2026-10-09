import { describe, expect, it } from "vitest";
import {
  CAR_MODELS,
  DEMAND_BASE,
  DEMAND_MAX_PCT,
  DEMAND_MIN_PCT,
  FIXTURE_REFERENCE_PRICE,
  GAME_STATE_VERSION,
  InvalidGameStateError,
  RENTAL_OUTCOMES,
  acceptanceChance,
  advance,
  advanceMinutes,
  createGame,
  referencePrice,
  restoreGameState,
  setCarPrice,
  tick,
  validateGameState,
  type Car,
  type GameState,
  type NewCar,
} from "./index.js";

// Spec: docs/specs/random-demand.md

const CASH = 100_000_00;

function fleetOf(n: number, dailyPrice: number, dailyCost = 10_00): NewCar[] {
  return Array.from({ length: n }, () => ({ dailyPrice, dailyCost }));
}

function json(s: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
}

function expectInvalid(raw: unknown, path: string, issue?: string): void {
  try {
    validateGameState(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(InvalidGameStateError);
    expect((e as InvalidGameStateError).path).toBe(path);
    if (issue !== undefined) expect((e as InvalidGameStateError).issue).toBe(issue);
    return;
  }
  throw new Error("expected InvalidGameStateError");
}

describe("constants", () => {
  it("has the specified values", () => {
    expect(DEMAND_BASE).toBe(1);
    expect(DEMAND_MIN_PCT).toBe(70);
    expect(DEMAND_MAX_PCT).toBe(115);
    expect(FIXTURE_REFERENCE_PRICE).toBe(90_00);
    expect(GAME_STATE_VERSION).toBe(9); // v3 upgrades … v7 shop, v8 missions, v9 events
    expect([...RENTAL_OUTCOMES]).toEqual(["rented", "tooExpensive", "noCustomer"]);
  });
});

describe("referencePrice", () => {
  it("is the model's advised price, or 90,00 for a fixture car", () => {
    const base = { id: 1, dailyPrice: 1, dailyCost: 1, rented: false };
    expect(referencePrice({ ...base, model: "compact" })).toBe(
      CAR_MODELS.compact.defaultDailyPrice,
    );
    expect(referencePrice({ ...base, model: "hybrid" })).toBe(CAR_MODELS.hybrid.defaultDailyPrice);
    expect(referencePrice({ ...base, model: undefined })).toBe(90_00);
  });

  it("falls back to the fixture price for an unknown model (hostile data)", () => {
    const hostile = { model: "__proto__" } as unknown as Car;
    expect(referencePrice(hostile)).toBe(90_00);
  });
});

describe("acceptanceChance", () => {
  const REF = 100_00;
  it.each([
    [0, 0.98],
    [25_00, 0.98],
    [50_00, 0.98],
    [75_00, 0.915],
    [100_00, 0.85],
    [125_00, 0.625],
    [150_00, 0.4],
    [175_00, 0.2],
    [200_00, 0],
    [500_00, 0],
  ])("price %i against a reference of 100,00 => %f", (price, expected) => {
    expect(acceptanceChance(price, REF)).toBeCloseTo(expected, 10);
  });

  it("is non-increasing in the price and always within [0, 1]", () => {
    let prev = 1;
    for (let price = 0; price <= 250_00; price += 1_00) {
      const p = acceptanceChance(price, REF);
      expect(p).toBeLessThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      prev = p;
    }
  });

  it("returns 0 for hostile inputs instead of NaN", () => {
    expect(acceptanceChance(NaN, REF)).toBe(0);
    expect(acceptanceChance(Infinity, REF)).toBe(0);
    expect(acceptanceChance(10_00, 0)).toBe(0);
    expect(acceptanceChance(10_00, -5)).toBe(0);
    expect(acceptanceChance(10_00, NaN)).toBe(0);
  });
});

describe("daily customers", () => {
  it("are drawn at opening in DEMAND_BASE + round(fleet x [70 %, 115 %])", () => {
    const n = 20;
    const lo = DEMAND_BASE + Math.round((n * DEMAND_MIN_PCT) / 100);
    const hi = DEMAND_BASE + Math.round((n * DEMAND_MAX_PCT) / 100);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const g = createGame(seed, CASH, fleetOf(n, 60_00));
      expect(g.customersLeft).toBe(0); // nothing drawn before minute 0 is processed
      const first = advanceMinutes(g, 1); // car 0 took one customer
      const drawn = first.customersLeft + 1;
      expect(drawn).toBeGreaterThanOrEqual(lo);
      expect(drawn).toBeLessThanOrEqual(hi);
      seen.add(drawn);
    }
    expect(seen.size).toBeGreaterThan(5); // really random
  });

  it("are redrawn every morning", () => {
    let g = createGame(5, CASH, fleetOf(20, 60_00));
    const seen = new Set<number>();
    for (let d = 0; d < 30; d++) {
      g = advanceMinutes(tick(g), 1);
      seen.add(g.customersLeft);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("a refusing customer is consumed too (lost for the day)", () => {
    const g = createGame(3, CASH, fleetOf(3, 2 * 90_00)); // never accepted
    const after1 = advanceMinutes(g, 1);
    const after7 = advanceMinutes(g, 7); // slots 0, 2, 4 done
    expect(after1.customersLeft - after7.customersLeft).toBe(2);
    expect(after7.fleet.map((c) => c.outcome)).toEqual([
      "tooExpensive",
      "tooExpensive",
      "tooExpensive",
    ]);
  });

  it("an empty fleet draws DEMAND_BASE customers and nobody rents", () => {
    const t = advanceMinutes(createGame(1, CASH), 1);
    expect(t.customersLeft).toBe(DEMAND_BASE);
  });

  it("a full fleet sometimes runs out of customers: noCustomer, car stays parked", () => {
    let g = createGame(11, CASH, fleetOf(50, 60_00));
    let noCustomer = 0;
    for (let d = 0; d < 20; d++) {
      g = tick(g);
      for (const c of g.fleet) {
        if (c.outcome === "noCustomer") {
          noCustomer++;
          expect(c.rented).toBe(false);
        }
      }
    }
    expect(noCustomer).toBeGreaterThan(0);
  });

  it("customersLeft stays an integer >= 0 along a long run", () => {
    let g = createGame(2, CASH, fleetOf(50, 40_00));
    for (let i = 0; i < 500; i++) {
      g = advanceMinutes(g, 97);
      expect(Number.isSafeInteger(g.customersLeft)).toBe(true);
      expect(g.customersLeft).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("rental rate (acceptance criteria 2 and 3)", () => {
  function rentalRate(fleet: NewCar[], days: number, seed = 1, quiet = false): number {
    let g = createGame(seed, CASH, fleet);
    // Events off: a car show raises the reference price (events.md).
    if (quiet) g = { ...g, nextEventDay: Number.MAX_SAFE_INTEGER };
    let rented = 0;
    for (let d = 0; d < days; d++) {
      g = tick(g);
      rented += g.fleet.filter((c) => c.rented).length;
    }
    return rented / (days * fleet.length);
  }

  it("at the advised price, 200 days x 20 cars: between 70 % and 90 %", () => {
    // fixture cars: reference 90,00
    const rate = rentalRate(fleetOf(20, 90_00), 200);
    expect(rate).toBeGreaterThanOrEqual(0.7);
    expect(rate).toBeLessThanOrEqual(0.9);
  });

  it("same with real models at their advised price", () => {
    for (const model of ["used", "compact", "hybrid"] as const) {
      const price = CAR_MODELS[model].defaultDailyPrice;
      let g = createGame(4, CASH, fleetOf(20, price));
      g = {
        ...g,
        fleet: g.fleet.map((c) => ({ ...c, model })),
      };
      let rented = 0;
      for (let d = 0; d < 200; d++) {
        g = tick(g);
        rented += g.fleet.filter((c) => c.rented).length;
      }
      const rate = rented / (200 * 20);
      expect(rate).toBeGreaterThanOrEqual(0.7);
      expect(rate).toBeLessThanOrEqual(0.9);
    }
  });

  it("at twice the advised price, nothing is ever rented", () => {
    expect(rentalRate(fleetOf(20, 2 * 90_00), 200, 1, true)).toBe(0);
    expect(rentalRate(fleetOf(20, 3 * 90_00), 50, 1, true)).toBe(0);
    let g = createGame(8, CASH, fleetOf(20, 60_00));
    g = { ...g, nextEventDay: Number.MAX_SAFE_INTEGER };
    g = { ...g, fleet: g.fleet.map((c) => ({ ...c, model: "compact" as const })) };
    for (const c of g.fleet) g = setCarPrice(g, c.id, 2 * CAR_MODELS.compact.defaultDailyPrice);
    for (let d = 0; d < 100; d++) {
      g = tick(g);
      expect(g.fleet.some((c) => c.rented)).toBe(false);
    }
  });

  it("a higher price rents less: the price is a real decision", () => {
    const cheap = rentalRate(fleetOf(20, 45_00), 100);
    const advised = rentalRate(fleetOf(20, 90_00), 100);
    const dear = rentalRate(fleetOf(20, 135_00), 100);
    expect(cheap).toBeGreaterThan(advised);
    expect(advised).toBeGreaterThan(dear);
    expect(dear).toBeGreaterThan(0);
  });
});

describe("determinism (acceptance criterion 4)", () => {
  const start = (seed: number): GameState => createGame(seed, CASH, fleetOf(20, 90_00));

  it("same seed => same state; another seed => another state", () => {
    expect(advance(start(42), 30)).toEqual(advance(start(42), 30));
    expect(advance(start(42), 30)).not.toEqual(advance(start(43), 30));
  });

  it("720 x 1 minute = one 720-minute call, over several days", () => {
    for (const seed of [1, 2, 3]) {
      let stepped = start(seed);
      let whole = start(seed);
      for (let day = 0; day < 3; day++) {
        for (let m = 0; m < 720; m++) stepped = advanceMinutes(stepped, 1);
        whole = advanceMinutes(whole, 720);
        expect(stepped).toEqual(whole);
      }
    }
  });

  it("arbitrary chunking gives the same result", () => {
    const whole = advance(start(9), 4);
    let stepped = start(9);
    let left = 4 * 720;
    let i = 0;
    while (left > 0) {
      const n = Math.min(left, [1, 7, 85, 333, 720, 2][i++ % 6] ?? 1);
      stepped = advanceMinutes(stepped, n);
      left -= n;
    }
    expect(stepped).toEqual(whole);
  });

  it("the state survives a JSON round-trip and continues identically", () => {
    const mid = advanceMinutes(start(7), 500);
    const copy = validateGameState(JSON.parse(JSON.stringify(mid)));
    expect(copy).toEqual(mid);
    expect(advance(copy, 5)).toEqual(advance(mid, 5));
  });
});

describe("outcome consistency", () => {
  it("rented === (outcome === 'rented') and a car without a slot yet has no outcome", () => {
    let g = createGame(6, CASH, fleetOf(30, 100_00));
    expect(g.fleet.every((c) => c.outcome === undefined && !c.rented)).toBe(true);
    for (let i = 0; i < 400; i++) {
      g = advanceMinutes(g, 1 + ((i * 37) % 200));
      for (const c of g.fleet) {
        expect(c.rented).toBe(c.outcome === "rented");
        if (c.outcome !== undefined) expect(RENTAL_OUTCOMES).toContain(c.outcome);
      }
      if (g.minute > 0 && g.minute < 59) {
        // slots at 2 x index: the cars past minute `g.minute` have not left today (yet)
        const todayFresh = g.fleet.filter((_, idx) => idx * 2 >= g.minute);
        expect(todayFresh.length).toBeGreaterThan(0);
      }
    }
  });

  it("revenue comes only from rented cars", () => {
    let g = createGame(6, CASH, fleetOf(30, 100_00));
    g = advanceMinutes(g, 300);
    expect(g.todayRevenue).toBe(g.fleet.reduce((s, c) => s + (c.rented ? c.dailyPrice : 0), 0));
    expect(g.cash).toBe(CASH + g.todayRevenue);
  });
});

describe("save: version 2 (acceptance criterion 5)", () => {
  function played(): GameState {
    let g = createGame(77, CASH, fleetOf(12, 80_00));
    g = advance(g, 3);
    return advanceMinutes(g, 200);
  }

  it("round-trips customersLeft and outcome", () => {
    const g = played();
    expect(g.fleet.some((c) => c.outcome !== undefined)).toBe(true);
    expect(validateGameState(json(g))).toEqual(g);
    expect(restoreGameState(json(g), GAME_STATE_VERSION)).toEqual(g);
  });

  it("migrates a v1 save: customersLeft = fleet size, outcome absent", () => {
    const g = createGame(5, CASH, fleetOf(9, 70_00));
    const v1 = json(g);
    delete v1["customersLeft"];
    const restored = restoreGameState(v1, 1);
    expect(restored.customersLeft).toBe(9);
    expect(restored).toEqual({ ...g, customersLeft: 9 });
    expect(restored.fleet.every((c) => c.outcome === undefined)).toBe(true);
    // the migrated game keeps playing
    expect(() => advance(restored, 3)).not.toThrow();
  });

  it("migrates a v1 save played mid-day", () => {
    const v1 = json(played());
    delete v1["customersLeft"];
    for (const car of v1["fleet"] as Record<string, unknown>[]) delete car["outcome"];
    const restored = restoreGameState(v1, 1);
    expect(restored.customersLeft).toBe(12);
    expect(restored.minute).toBe(played().minute);
  });

  it("migrates a v1 save with an empty fleet (customersLeft 0)", () => {
    const v1 = json(createGame(1, CASH));
    delete v1["customersLeft"];
    expect(restoreGameState(v1, 1).customersLeft).toBe(0);
  });

  it("migration of garbage still ends in InvalidGameStateError", () => {
    for (const raw of [null, 5, "x", [], undefined]) {
      expect(() => restoreGameState(raw, 1)).toThrow(InvalidGameStateError);
    }
  });

  it("a v2 save without customersLeft is rejected", () => {
    const s = json(played());
    delete s["customersLeft"];
    expectInvalid(s, "customersLeft", "type");
    expect(() => restoreGameState(s, 2)).toThrow(InvalidGameStateError);
  });

  // 183 = one above the most a day can draw (full fleet, max advertising, sales manager, holidays).
  it.each([-1, 1.5, 183, 1e9, NaN, Infinity, null, "3", true, {}, [], 2 ** 53])(
    "rejects customersLeft = %s",
    (bad) => {
      const s = json(played());
      s["customersLeft"] = bad;
      expect(() => validateGameState(s)).toThrow(InvalidGameStateError);
      // also with a real (non-JSON) NaN / Infinity
      const raw = { ...played(), customersLeft: bad };
      expect(() => validateGameState(raw)).toThrow(InvalidGameStateError);
    },
  );

  it("accepts customersLeft at both bounds", () => {
    const s = json(createGame(1, CASH));
    s["customersLeft"] = 0;
    expect(validateGameState(s).customersLeft).toBe(0);
    s["customersLeft"] = DEMAND_BASE + Math.round((50 * DEMAND_MAX_PCT) / 100);
    expect(validateGameState(s).customersLeft).toBe(59);
  });

  function withCar(patch: Record<string, unknown>): Record<string, unknown> {
    const s = json(played());
    const fleet = s["fleet"] as Record<string, unknown>[];
    fleet[0] = { ...fleet[0], ...patch };
    return s;
  }

  it.each(["bogus", "", "RENTED", "__proto__", 3, null, true, {}, []])(
    "rejects outcome = %s",
    (bad) => {
      expect(() => validateGameState(withCar({ outcome: bad }))).toThrow(InvalidGameStateError);
    },
  );

  it("rejects an outcome that contradicts rented", () => {
    expectInvalid(
      withCar({ rented: true, outcome: "tooExpensive" }),
      "fleet[0].outcome",
      "inconsistent",
    );
    expectInvalid(
      withCar({ rented: true, outcome: "noCustomer" }),
      "fleet[0].outcome",
      "inconsistent",
    );
    expectInvalid(
      withCar({ rented: false, outcome: "rented" }),
      "fleet[0].outcome",
      "inconsistent",
    );
  });

  it("accepts every consistent outcome and a missing outcome", () => {
    for (const [rented, outcome] of [
      [true, "rented"],
      [false, "tooExpensive"],
      [false, "noCustomer"],
    ] as const) {
      const ok = validateGameState(withCar({ rented, outcome }));
      expect(ok.fleet[0]?.outcome).toBe(outcome);
    }
    const s = json(played());
    delete (s["fleet"] as Record<string, unknown>[])[0]?.["outcome"];
    expect(validateGameState(s).fleet[0]?.outcome).toBeUndefined();
  });
});
