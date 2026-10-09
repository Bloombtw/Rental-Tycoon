import { describe, expect, it } from "vitest";
import {
  CAR_MODELS,
  CarBrokenError,
  CarInServiceError,
  CarNotBrokenError,
  CarRentedOutError,
  DAY_MINUTES,
  FIXTURE_PURCHASE_PRICE,
  GAME_STATE_VERSION,
  InsufficientCashError,
  InvalidGameStateError,
  LEVEL_XP,
  MANAGERS,
  MANAGER_IDS,
  MAX_CAR_DAILY_PRICE,
  ModelLockedError,
  NO_MANAGERS,
  RENTAL_OUTCOMES,
  SimOverflowError,
  UnknownCarError,
  advance,
  advanceMinutes,
  breakdownChance,
  buyCar,
  canSellNow,
  carAge,
  carCondition,
  createGame,
  hireManager,
  isBroken,
  managersSalary,
  mechanicRepairCost,
  mechanicServiceCost,
  repairCar,
  repairCost,
  resaleValue,
  restoreGameState,
  returnMinute,
  sellCar,
  serviceCar,
  serviceCost,
  setCarPrice,
  tick,
  validateGameState,
  type Car,
  type CarModelId,
  type GameState,
} from "./index.js";

// Spec: docs/specs/resale-wear.md

const CASH = 1_000_000_00;
const NEVER = Number.MAX_SAFE_INTEGER;

const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

/** Fixture cars with chosen wear fields, no random event, a parking that holds 50 cars. */
function game(cars: readonly Partial<Car>[], seed = 1, cash = CASH): GameState {
  const g = createGame(
    seed,
    cash,
    cars.map((c) => ({ dailyPrice: c.dailyPrice ?? 90_00, dailyCost: c.dailyCost ?? 10_00 })),
  );
  return {
    ...g,
    nextEventDay: NEVER,
    upgrades: { ...g.upgrades, parking: 9 },
    fleet: g.fleet.map((car, i) => ({ ...car, ...cars[i], id: car.id })),
  };
}

const car = (over: Partial<Car> = {}): Car => ({
  id: 1,
  dailyPrice: 90_00,
  dailyCost: 10_00,
  rented: false,
  ...over,
});

const TOO_DEAR = MAX_CAR_DAILY_PRICE; // never rented: stays in the parking

describe("accessors", () => {
  it("defaults when the fields are absent", () => {
    const c = car();
    expect(carAge(c)).toBe(0);
    expect(carCondition(c)).toBe(100);
    expect(isBroken(c)).toBe(false);
  });

  it("reads the fields and survives corrupt values", () => {
    expect(carAge(car({ age: 12 }))).toBe(12);
    expect(carCondition(car({ condition: 37 }))).toBe(37);
    expect(isBroken(car({ broken: true }))).toBe(true);
    expect(isBroken(car({ broken: false }))).toBe(false);
    expect(carAge(car({ age: Number.NaN }))).toBe(0);
    expect(carAge(car({ age: -3 }))).toBe(0);
    expect(carCondition(car({ condition: Number.NaN }))).toBe(100);
    expect(carCondition(car({ condition: 250 }))).toBe(100);
    expect(carCondition(car({ condition: -9 }))).toBe(0);
  });

  it("breakdown chance is (100 - condition) / 400", () => {
    expect(breakdownChance(car())).toBe(0);
    expect(breakdownChance(car({ condition: 100 }))).toBe(0);
    expect(breakdownChance(car({ condition: 60 }))).toBeCloseTo(0.1, 12);
    expect(breakdownChance(car({ condition: 0 }))).toBe(0.25);
  });
});

describe("costs", () => {
  it("FIXTURE_PURCHASE_PRICE is 4 000 euros", () => {
    expect(FIXTURE_PURCHASE_PRICE).toBe(4_000_00);
  });

  it("repair is 6 % of the purchase price, to the euro", () => {
    expect(repairCost(car())).toBe(240_00); // fixture: 6 % of 4 000
    expect(repairCost(car({ model: "used" }))).toBe(240_00);
    expect(repairCost(car({ model: "compact" }))).toBe(540_00);
    expect(repairCost(car({ model: "hybrid" }))).toBe(960_00);
    expect(repairCost(car({ model: "luxury" }))).toBe(4_200_00);
    for (const id of Object.keys(CAR_MODELS) as CarModelId[]) {
      const cost = repairCost(car({ model: id }));
      expect(cost % 100).toBe(0);
      expect(Math.abs(cost - CAR_MODELS[id].purchasePrice * 0.06)).toBeLessThanOrEqual(50);
    }
  });

  it("service is 0.3 % of the purchase price per missing point, to the euro, 0 at 100 %", () => {
    expect(serviceCost(car())).toBe(0);
    expect(serviceCost(car({ condition: 100 }))).toBe(0);
    expect(serviceCost(car({ condition: 99 }))).toBe(12_00); // 0.3 % of 4 000
    expect(serviceCost(car({ condition: 50 }))).toBe(600_00);
    expect(serviceCost(car({ condition: 0 }))).toBe(1_200_00);
    expect(serviceCost(car({ model: "luxury", condition: 90 }))).toBe(2_100_00);
    // Always a whole number of euros
    for (let c = 0; c <= 100; c++) {
      const cost = serviceCost(car({ model: "suv", condition: c }));
      expect(Number.isSafeInteger(cost) && cost >= 0 && cost % 100 === 0).toBe(true);
    }
  });

  it("the mechanic pays half, in whole cents", () => {
    expect(mechanicRepairCost(car())).toBe(120_00);
    expect(mechanicServiceCost(car({ condition: 50 }))).toBe(300_00);
    expect(mechanicServiceCost(car({ condition: 100 }))).toBe(0);
    expect(Number.isSafeInteger(mechanicServiceCost(car({ condition: 99 })))).toBe(true);
  });
});

describe("resale value", () => {
  it("a new car is worth 85 % of its price", () => {
    expect(resaleValue(car())).toBe(3_400_00);
    expect(resaleValue(car({ model: "used" }))).toBe(3_400_00);
    expect(resaleValue(car({ model: "luxury" }))).toBe(59_500_00);
  });

  it("loses 0.4 % per day of age", () => {
    // 85 % - 0.4 % x 100 = 45 % of 4 000 = 1 800
    expect(resaleValue(car({ age: 100 }))).toBe(1_800_00);
    // 85 % - 0.4 % x 50 = 65 % -> 2 600
    expect(resaleValue(car({ age: 50 }))).toBe(2_600_00);
  });

  it("floors at 20 % of the price (age >= 163 days)", () => {
    expect(resaleValue(car({ age: 162 }))).toBe(800_00); // 20.2 % = 808 -> 800
    expect(resaleValue(car({ age: 163 }))).toBe(800_00);
    expect(resaleValue(car({ age: 5_000 }))).toBe(800_00);
    expect(resaleValue(car({ age: 5_000, model: "luxury" }))).toBe(14_000_00);
  });

  it("scales with 50 % + 50 % x condition", () => {
    expect(resaleValue(car({ condition: 100 }))).toBe(3_400_00);
    expect(resaleValue(car({ condition: 0 }))).toBe(1_700_00);
    expect(resaleValue(car({ condition: 50 }))).toBe(2_600_00); // 3 400 x 75 % = 2 550 -> 2 600
    // floor and condition together: 800 x 50 %
    expect(resaleValue(car({ age: 999, condition: 0 }))).toBe(400_00);
  });

  it("a broken car is worth 60 % of that, still rounded to 100 euros", () => {
    expect(resaleValue(car({ broken: true }))).toBe(2_000_00); // 3 400 x 60 % = 2 040
    expect(resaleValue(car({ broken: true, age: 100 }))).toBe(1_100_00); // 1 800 x 60 % = 1 080
    expect(resaleValue(car({ broken: true, condition: 0, age: 999 }))).toBe(200_00);
    expect(resaleValue(car({ broken: false }))).toBe(3_400_00);
  });

  it("is monotonic: older or more worn is never worth more, always a multiple of 100 euros", () => {
    let last = Number.POSITIVE_INFINITY;
    for (let age = 0; age < 400; age++) {
      const v = resaleValue(car({ age, model: "hybrid" }));
      expect(v).toBeLessThanOrEqual(last);
      expect(v % 100_00).toBe(0);
      last = v;
    }
    last = -1;
    for (let c = 0; c <= 100; c++) {
      const v = resaleValue(car({ condition: c, model: "hybrid" }));
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});

describe("repairCar", () => {
  it("pays the repair, removes the breakdown and restores at least 50 %", () => {
    const g = game([{ broken: true, condition: 10, model: "used" }]);
    const r = repairCar(g, 1);
    expect(r.cash).toBe(g.cash - 240_00);
    const c = r.fleet[0] as Car;
    expect(c.broken).toBe(false);
    expect(c.condition).toBe(50);
    expect(g.fleet[0]?.broken).toBe(true); // input untouched
  });

  it("keeps a condition already above 50 %", () => {
    const g = game([{ broken: true, condition: 83 }]);
    expect(repairCar(g, 1).fleet[0]?.condition).toBe(83);
  });

  it("clears the stale broken outcome but keeps the other fields", () => {
    const g = game([
      { broken: true, condition: 20, outcome: "broken", age: 7, dailyPrice: 77_00 },
      { broken: true, condition: 20, outcome: "tooExpensive", rented: false },
    ]);
    const a = repairCar(g, 1).fleet[0] as Car;
    expect("outcome" in a).toBe(false);
    expect(a.age).toBe(7);
    expect(a.dailyPrice).toBe(77_00);
    expect(repairCar(g, 2).fleet[1]?.outcome).toBe("tooExpensive");
  });

  it("only touches the targeted car", () => {
    const g = game([
      { broken: true, condition: 10 },
      { broken: true, condition: 10 },
    ]);
    const r = repairCar(g, 2);
    expect(r.fleet[0]).toEqual(g.fleet[0]);
    expect(r.fleet[1]?.broken).toBe(false);
  });

  it("typed errors: not broken, unknown, no cash", () => {
    const g = game([{ condition: 10 }]);
    expect(() => repairCar(g, 1)).toThrow(CarNotBrokenError);
    expect(() => repairCar(game([{}]), 1)).toThrow(CarNotBrokenError);
    expect(() => repairCar(g, 99)).toThrow(UnknownCarError);
    expect(() => repairCar(g, Number.NaN)).toThrow(UnknownCarError);
    const poor = game([{ broken: true, condition: 10 }], 1, 239_99);
    expect(() => repairCar(poor, 1)).toThrow(InsufficientCashError);
    expect(repairCar({ ...poor, cash: 240_00 }, 1).cash).toBe(0);
    expect(() => repairCar({ ...poor, cash: 0.5 }, 1)).toThrow(SimOverflowError);
  });
});

describe("serviceCar", () => {
  it("pays the service and puts the condition back to 100 %", () => {
    const g = game([{ condition: 50 }]);
    const s = serviceCar(g, 1);
    expect(s.cash).toBe(g.cash - 600_00);
    expect(s.fleet[0]?.condition).toBe(100);
    expect(s.fleet[0]?.broken).toBeUndefined();
  });

  it("refuses a car at 100 % (even without the field) and a broken car", () => {
    expect(() => serviceCar(game([{ condition: 100 }]), 1)).toThrow(CarInServiceError);
    expect(() => serviceCar(game([{}]), 1)).toThrow(CarInServiceError);
    expect(() => serviceCar(game([{ broken: true, condition: 10 }]), 1)).toThrow(CarBrokenError);
    // a broken car at 100 % is "broken" first
    expect(() => serviceCar(game([{ broken: true }]), 1)).toThrow(CarBrokenError);
  });

  it("refuses unknown cars and missing cash", () => {
    expect(() => serviceCar(game([{ condition: 50 }]), 5)).toThrow(UnknownCarError);
    expect(() => serviceCar(game([{ condition: 50 }], 1, 599_99), 1)).toThrow(
      InsufficientCashError,
    );
    expect(serviceCar(game([{ condition: 50 }], 1, 600_00), 1).cash).toBe(0);
  });

  it("repair then service: the full maintenance path", () => {
    const g = game([{ broken: true, condition: 5 }]);
    const done = serviceCar(repairCar(g, 1), 1);
    expect(done.fleet[0]?.broken).toBe(false);
    expect(done.fleet[0]?.condition).toBe(100);
    expect(done.cash).toBe(g.cash - 240_00 - 600_00);
  });
});

describe("sellCar", () => {
  it("credits the resale value and the car leaves the fleet", () => {
    const g = game([{}, { age: 100 }, {}]);
    const s = sellCar(g, 2);
    expect(s.cash).toBe(g.cash + 1_800_00);
    expect(s.fleet.map((c) => c.id)).toEqual([1, 3]);
    expect(g.fleet).toHaveLength(3); // input untouched
  });

  it("a broken car sells at 60 %", () => {
    const g = game([{ broken: true }]);
    expect(sellCar(g, 1).cash).toBe(g.cash + 2_000_00);
  });

  it("unknown car and corrupt cash are typed errors", () => {
    expect(() => sellCar(game([{}]), 9)).toThrow(UnknownCarError);
    expect(() => sellCar({ ...game([{}]), cash: 1.5 }, 1)).toThrow(SimOverflowError);
    expect(() => sellCar({ ...game([{}]), cash: Number.MAX_SAFE_INTEGER }, 1)).toThrow(
      SimOverflowError,
    );
  });

  it("can sell the last car: an empty fleet", () => {
    expect(sellCar(game([{}]), 1).fleet).toEqual([]);
  });

  describe("while rented", () => {
    // Car index 0 leaves at minute 0 and returns at minute 600; index 3 leaves at 6, returns at 606.
    const out = (index: number, minute: number): GameState => {
      const g = game([{}, {}, {}, {}]);
      return {
        ...g,
        minute,
        fleet: g.fleet.map((c, i) =>
          i === index ? { ...c, rented: true, outcome: "rented" as const } : c,
        ),
      };
    };

    it("refused between the departure and the return, with a typed error", () => {
      for (const minute of [1, 2, 300, 599]) {
        const g = out(0, minute);
        expect(canSellNow(g, 1)).toBe(false);
        expect(() => sellCar(g, 1)).toThrow(CarRentedOutError);
      }
      const g = out(3, 7);
      expect(canSellNow(g, 4)).toBe(false);
      expect(() => sellCar(g, 4)).toThrow(CarRentedOutError);
    });

    it("allowed once it is back, or before its slot, or when it did not leave", () => {
      expect(returnMinute(0)).toBe(600);
      expect(canSellNow(out(0, 600), 1)).toBe(true);
      expect(canSellNow(out(0, 719), 1)).toBe(true);
      expect(canSellNow(out(3, 6), 4)).toBe(true); // slot not processed yet: stale flag
      expect(canSellNow(out(0, 0), 1)).toBe(true);
      expect(sellCar(out(0, 600), 1).fleet).toHaveLength(3);
      // others are not affected by a rented neighbour
      expect(canSellNow(out(0, 300), 2)).toBe(true);
      expect(sellCar(out(0, 300), 2).fleet).toHaveLength(3);
    });

    it("a refused sale changes nothing", () => {
      const g = out(0, 300);
      const copy = json(g);
      expect(() => sellCar(g, 1)).toThrow(CarRentedOutError);
      expect(g).toEqual(copy);
    });

    it("follows the real simulation: a rented car cannot be sold until it returns", () => {
      let g = game([{ dailyPrice: 1_00 }, { dailyPrice: 1_00 }, { dailyPrice: 1_00 }], 5);
      g = advanceMinutes(g, 10);
      const rented = g.fleet.filter((c) => c.rented);
      expect(rented.length).toBeGreaterThan(0);
      for (const c of g.fleet) expect(canSellNow(g, c.id)).toBe(!c.rented);
      g = advanceMinutes(g, 600 - 10); // minute 600: car 0 is back
      expect(canSellNow(g, 1)).toBe(true);
    });

    it("canSellNow is false for an unknown car", () => {
      expect(canSellNow(game([{}]), 42)).toBe(false);
    });
  });
});

describe("ids are never reused", () => {
  it("createGame: nextCarId = fleet size + 1", () => {
    expect(createGame(1).nextCarId).toBe(1);
    expect(game([{}, {}, {}]).nextCarId).toBe(4);
  });

  it("sell the last car then buy: the new id is fresh", () => {
    let g = { ...createGame(1, CASH), xp: LEVEL_XP[2] ?? 0 };
    g = buyCar(g, "used");
    g = buyCar(g, "used");
    expect(g.fleet.map((c) => c.id)).toEqual([1, 2]);
    expect(g.nextCarId).toBe(3);
    g = sellCar(g, 2);
    g = buyCar(g, "used");
    expect(g.fleet.map((c) => c.id)).toEqual([1, 3]);
    expect(g.nextCarId).toBe(4);
  });

  it("sell everything then buy: ids keep growing", () => {
    let g = buyCar(createGame(1, CASH), "used");
    g = sellCar(g, 1);
    expect(g.fleet).toEqual([]);
    g = buyCar(g, "used");
    expect(g.fleet.map((c) => c.id)).toEqual([2]);
    expect(g.nextCarId).toBe(3);
  });

  it("buyCar yields new cars as new: no wear fields needed", () => {
    const c = buyCar(createGame(1, CASH), "compact").fleet[0] as Car;
    expect(carAge(c)).toBe(0);
    expect(carCondition(c)).toBe(100);
    expect(isBroken(c)).toBe(false);
  });

  it("many sell + buy cycles never repeat an id", () => {
    let g = game([]);
    g = { ...g, xp: LEVEL_XP[2] ?? 0 };
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      g = buyCar(g, "used");
      const id = g.fleet[g.fleet.length - 1]?.id as number;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      if (i % 2 === 1) g = sellCar(g, id);
    }
  });

  it("a higher legacy id still wins over nextCarId (hand-built states)", () => {
    const g = { ...game([{}]), nextCarId: 1 };
    expect(buyCar(g, "used").fleet[1]?.id).toBe(2);
    expect(buyCar(g, "used").nextCarId).toBe(3);
  });

  it("tick keeps nextCarId", () => {
    const g = sellCar(game([{}, {}]), 2);
    expect(advance(g, 3).nextCarId).toBe(3);
  });
});

describe("breakdowns", () => {
  /** Opens the day (minute 0 only) with 50 working cars at `condition`; counts the new breakdowns. */
  function breakdownRate(condition: number, days: number, seed: number): number {
    let broken = 0;
    for (let d = 0; d < days; d++) {
      const g = game(
        Array.from({ length: 50 }, () => ({ condition, dailyPrice: TOO_DEAR })),
        seed + d,
      );
      const opened = advanceMinutes(g, 1);
      broken += opened.fleet.filter((c) => c.broken === true).length;
    }
    return broken / (days * 50);
  }

  it("a car at 100 % never breaks down, whatever the seed", () => {
    expect(breakdownRate(100, 60, 1)).toBe(0);
    for (let seed = 0; seed < 200; seed++) {
      const g = advanceMinutes(game([{}, {}, {}, {}], seed), 1);
      expect(g.fleet.every((c) => c.broken !== true)).toBe(true);
    }
  });

  it("fixture cars without wear fields do not break on their first day", () => {
    const g = createGame(3, CASH, [{ dailyPrice: 90_00, dailyCost: 10_00 }]);
    const t = tick(g);
    expect(t.fleet[0]?.broken).toBeUndefined();
    expect(t.fleet[0]?.outcome).not.toBe("broken");
  });

  it("the rate follows (100 - condition) / 400", () => {
    // 10 000 draws each: standard deviation about 0.4 points, bounds are 5+ sigma.
    expect(breakdownRate(0, 200, 1000)).toBeGreaterThan(0.23);
    expect(breakdownRate(0, 200, 1000)).toBeLessThan(0.27);
    expect(breakdownRate(60, 200, 5000)).toBeGreaterThan(0.085);
    expect(breakdownRate(60, 200, 5000)).toBeLessThan(0.115);
    expect(breakdownRate(96, 200, 9000)).toBeGreaterThan(0.005);
    expect(breakdownRate(96, 200, 9000)).toBeLessThan(0.015);
  });

  it("a broken car stays broken and is not drawn again", () => {
    const g = game([{ broken: true, condition: 0 }]);
    const t = advance(g, 5);
    expect(t.fleet[0]?.broken).toBe(true);
  });

  it("a broken car gets outcome 'broken', is not rented and uses no customer", () => {
    const fleet = [{ dailyPrice: 1_00 }, { dailyPrice: 1_00 }, { dailyPrice: 1_00 }];
    const working = advanceMinutes(game(fleet, 11), 1);
    const g = game(
      fleet.map((c) => ({ ...c, broken: true })),
      11,
    );
    const stuck = advanceMinutes(g, 1);
    expect(stuck.fleet[0]?.outcome).toBe("broken");
    expect(stuck.fleet[0]?.rented).toBe(false);
    // the slot of car 0 consumed one customer when it worked, none when broken
    expect(stuck.customersLeft).toBe(working.customersLeft + 1);
    const day = tick(g);
    for (const c of day.fleet) {
      expect(c.outcome).toBe("broken");
      expect(c.rented).toBe(false);
    }
    expect(day.lastDay?.revenue).toBe(0);
  });

  it("a broken car does not take the customer of a working neighbour", () => {
    const g = game([{ broken: true, dailyPrice: 1_00 }, { dailyPrice: 1_00 }], 2);
    let opened = advanceMinutes(g, 3); // both slots (0 and 2) are processed
    const firstDraw = opened.customersLeft;
    // drawn customers = left + 1 (only car 2 consumed one)
    opened = advanceMinutes(game([{ dailyPrice: 1_00 }, { dailyPrice: 1_00 }], 2), 3);
    expect(firstDraw).toBe(opened.customersLeft + 1);
  });

  it("a broken car earns nothing and pays its daily cost; its neighbour is unaffected", () => {
    const g = game(
      [
        { broken: true, dailyPrice: 1_00, dailyCost: 30_00 },
        { dailyPrice: 1_00, dailyCost: 20_00 },
      ],
      4,
    );
    const t = tick(g);
    expect(t.lastDay?.costs).toBe(50_00);
    expect(t.fleet[0]?.outcome).toBe("broken");
  });

  it("the broken outcome is a RentalOutcome", () => {
    expect(RENTAL_OUTCOMES).toContain("broken");
  });

  it("repairing during the day makes the car work again from the next opening", () => {
    let g = game([{ broken: true, condition: 10, dailyPrice: 1_00 }], 6);
    g = repairCar(g, 1);
    const t = tick({ ...g, fleet: g.fleet.map((c) => ({ ...c, condition: 100 })) });
    expect(t.fleet[0]?.outcome).not.toBe("broken");
  });
});

describe("wear", () => {
  it("every car ages by one day at closing", () => {
    const g = game([{ age: 5, dailyPrice: TOO_DEAR }, {}]);
    const t = tick(g);
    expect(t.fleet.map((c) => c.age)).toEqual([6, 1]);
    expect(advance(t, 9).fleet.map((c) => c.age)).toEqual([15, 10]);
  });

  it("not before closing", () => {
    const g = game([{ age: 5 }]);
    expect(advanceMinutes(g, DAY_MINUTES - 1).fleet[0]?.age).toBe(5);
    expect(advanceMinutes(g, DAY_MINUTES).fleet[0]?.age).toBe(6);
  });

  it("a car that stayed in the parking loses exactly 1 point per day", () => {
    let g = game([{ dailyPrice: TOO_DEAR, condition: 100 }]);
    for (let d = 1; d <= 20; d++) {
      g = tick({ ...g, fleet: g.fleet.map((c) => ({ ...c, broken: false })) });
      expect(g.fleet[0]?.rented).toBe(false);
      expect(g.fleet[0]?.condition).toBe(100 - d);
    }
  });

  it("a car rented that day loses 2 to 5 points, and all four values occur", () => {
    const losses = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const g = game([{ dailyPrice: 1_00, condition: 90 }], seed);
      const t = tick(g);
      if (t.fleet[0]?.rented === true) {
        losses.add(90 - (t.fleet[0].condition as number));
      } else {
        expect(t.fleet[0]?.condition).toBe(89);
      }
    }
    expect([...losses].sort()).toEqual([2, 3, 4, 5]);
  });

  it("the condition never goes below 0", () => {
    let g = game([
      { dailyPrice: 1_00, condition: 3 },
      { condition: 0, dailyPrice: TOO_DEAR },
    ]);
    for (let d = 0; d < 10; d++) {
      g = tick({ ...g, fleet: g.fleet.map((c) => ({ ...c, broken: false })) });
      for (const c of g.fleet) {
        expect(c.condition).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(c.condition)).toBe(true);
      }
    }
    expect(g.fleet[1]?.condition).toBe(0);
  });

  it("a cheap car wears faster than an overpriced one", () => {
    const wear = (price: number): number => {
      let total = 0;
      for (let seed = 0; seed < 100; seed++) {
        const t = tick(game([{ dailyPrice: price, condition: 100 }], seed));
        total += 100 - (t.fleet[0]?.condition ?? 100);
      }
      return total;
    };
    expect(wear(1_00)).toBeGreaterThan(wear(TOO_DEAR));
  });

  it("wear is deterministic: same seed, same state", () => {
    const start = game(
      Array.from({ length: 12 }, (_, i) => ({ dailyPrice: 40_00 + i * 5_00 })),
      99,
    );
    expect(advance(start, 60)).toEqual(advance(start, 60));
    expect(advance(start, 60)).not.toEqual(advance({ ...start, seed: 100, rngState: 100 }, 60));
  });

  it("one minute at a time equals one call, across several days of wear and breakdowns", () => {
    const start = game(
      Array.from({ length: 8 }, (_, i) => ({
        dailyPrice: 30_00 + i * 10_00,
        condition: 40 + i * 5,
      })),
      7,
    );
    let slow = start;
    for (let i = 0; i < DAY_MINUTES * 3; i++) slow = advanceMinutes(slow, 1);
    expect(slow).toEqual(advance(start, 3));
    // and with the mechanic at work
    const staffed: GameState = {
      ...start,
      managers: { ...NO_MANAGERS, mechanic: true },
    };
    let slowStaffed = staffed;
    for (let i = 0; i < DAY_MINUTES * 3; i++) slowStaffed = advanceMinutes(slowStaffed, 1);
    expect(slowStaffed).toEqual(advance(staffed, 3));
    // odd chunk sizes too
    let chunks = start;
    for (let i = 0; i < 3 * DAY_MINUTES; i += 97) {
      chunks = advanceMinutes(chunks, Math.min(97, 3 * DAY_MINUTES - i));
    }
    expect(chunks).toEqual(advance(start, 3));
  });

  it("a worn fleet earns less than a fresh one (cars break down)", () => {
    const fresh = game(
      Array.from({ length: 20 }, () => ({ dailyPrice: 90_00, condition: 100 })),
      3,
    );
    const worn = game(
      Array.from({ length: 20 }, () => ({ dailyPrice: 90_00, condition: 0 })),
      3,
    );
    expect(tick(worn).lastDay?.revenue).toBeLessThan(tick(fresh).lastDay?.revenue ?? 0);
  });
});

describe("the mechanic", () => {
  const MECH = { ...NO_MANAGERS, mechanic: true };

  it("is a manager: 10 000 euros, 100 euros a day, level 4", () => {
    expect(MANAGER_IDS).toContain("mechanic");
    expect(MANAGERS.mechanic).toEqual({
      id: "mechanic",
      hireCost: 10_000_00,
      dailySalary: 100_00,
      unlockLevel: 4,
    });
    expect(NO_MANAGERS.mechanic).toBe(false);
    expect(managersSalary(MECH)).toBe(100_00);
    expect(managersSalary({ ...MECH, sales: true })).toBe(180_00);
  });

  it("is hired like the others: level 4 and cash needed", () => {
    const g = createGame(1, CASH);
    expect(() => hireManager({ ...g, xp: LEVEL_XP[2] ?? 0 }, "mechanic")).toThrow(ModelLockedError);
    const ok = hireManager({ ...g, xp: LEVEL_XP[3] ?? 0 }, "mechanic");
    expect(ok.managers.mechanic).toBe(true);
    expect(ok.cash).toBe(CASH - 10_000_00);
    expect(() => hireManager({ ...g, cash: 9_999_99, xp: LEVEL_XP[3] ?? 0 }, "mechanic")).toThrow(
      InsufficientCashError,
    );
  });

  it("repairs broken cars at half price before the first departure", () => {
    const g: GameState = {
      ...game([{ broken: true, condition: 10, dailyPrice: TOO_DEAR, outcome: "broken" }]),
      managers: MECH,
    };
    const opened = advanceMinutes(g, 1);
    expect(opened.cash).toBe(g.cash - 120_00);
    const c = opened.fleet[0] as Car;
    // repaired to 50 %, and not drawn for a breakdown the same morning
    expect(c.condition).toBe(50);
  });

  it("a car repaired this morning never breaks down again the same day", () => {
    for (let seed = 0; seed < 300; seed++) {
      const g: GameState = {
        ...game([{ broken: true, condition: 10, dailyPrice: TOO_DEAR }], seed),
        managers: MECH,
      };
      const opened = advanceMinutes(g, 1);
      expect(opened.fleet[0]?.broken).toBe(false);
      expect(opened.fleet[0]?.condition).toBe(50);
    }
  });

  it("repaired cars use no draw: the other cars' breakdowns are unchanged", () => {
    // Car 1 is broken and repaired, car 2 is a working car at 50 %. Its draw is the first one
    // taken, exactly as if car 1 were not in the fleet.
    for (let seed = 0; seed < 100; seed++) {
      const withRepair: GameState = {
        ...game(
          [
            { broken: true, condition: 10, dailyPrice: TOO_DEAR },
            { condition: 50, dailyPrice: TOO_DEAR },
          ],
          seed,
        ),
        managers: MECH,
      };
      const alone: GameState = {
        ...game([{ condition: 50, dailyPrice: TOO_DEAR }], seed),
        managers: MECH,
      };
      // the demand draw depends on the fleet size, so compare after one more customer draw is
      // identical: both fleets draw demand once, then car 2's breakdown from the same stream
      const a = advanceMinutes(withRepair, 1).fleet[1]?.broken === true;
      const b = advanceMinutes(alone, 1).fleet[0]?.broken === true;
      expect(a).toBe(b);
    }
  });

  it("a broken car repaired by the mechanic can rent that very day", () => {
    let rented = 0;
    for (let seed = 0; seed < 100; seed++) {
      const g: GameState = {
        ...game([{ broken: true, condition: 90, dailyPrice: 1_00 }], seed),
        managers: MECH,
      };
      if (tick(g).fleet[0]?.outcome === "rented") rented++;
    }
    expect(rented).toBeGreaterThan(50);
  });

  it("without the mechanic a broken car stays out of order", () => {
    const g = game([{ broken: true, condition: 90, dailyPrice: 1_00 }]);
    const t = advance(g, 4);
    expect(t.fleet[0]?.broken).toBe(true);
    expect(t.fleet[0]?.outcome).toBe("broken");
    expect(t.cash).toBe(g.cash - 4 * 10_00);
  });

  it("services cars under 40 % for half the price, to 100 %", () => {
    const g: GameState = {
      ...game([
        { condition: 39, dailyPrice: TOO_DEAR, model: "used", dailyCost: 60_00 },
        { condition: 40, dailyPrice: TOO_DEAR, model: "used", dailyCost: 60_00 },
        { condition: 10, dailyPrice: TOO_DEAR, model: "used", dailyCost: 60_00 },
      ]),
      managers: MECH,
    };
    const opened = advanceMinutes(g, 1);
    const half = (c: number): number => mechanicServiceCost(car({ model: "used", condition: c }));
    expect(opened.fleet[0]?.condition).toBe(100);
    expect(opened.fleet[1]?.condition).toBe(40); // 40 % is not "under 40 %"
    expect(opened.fleet[2]?.condition).toBe(100);
    expect(opened.cash).toBe(g.cash - half(39) - half(10));
    expect(half(39)).toBe(Math.round(serviceCost(car({ model: "used", condition: 39 })) / 2));
    // a serviced car cannot break down this morning
    expect(opened.fleet[0]?.broken).toBeUndefined();
    expect(opened.fleet[2]?.broken).toBeUndefined();
  });

  it("does not touch healthy cars: nothing is paid", () => {
    const g: GameState = {
      ...game([{ condition: 100, dailyPrice: TOO_DEAR }, { dailyPrice: TOO_DEAR }]),
      managers: MECH,
    };
    const opened = advanceMinutes(g, 1);
    expect(opened.cash).toBe(g.cash);
  });

  it("repairs first, then (condition >= 50) does not service the same car", () => {
    const g: GameState = {
      ...game([{ broken: true, condition: 0, dailyPrice: TOO_DEAR, model: "used" }]),
      managers: MECH,
    };
    // repair only: 120 euros, no service on top
    expect(advanceMinutes(g, 1).cash).toBe(g.cash - mechanicRepairCost(car({ model: "used" })));
  });

  it("pays from the till even when it is empty: cash goes negative like costs", () => {
    const g: GameState = {
      ...game([{ broken: true, condition: 10, dailyPrice: TOO_DEAR }], 1, 50_00),
      managers: MECH,
    };
    const opened = advanceMinutes(g, 1);
    expect(opened.cash).toBe(50_00 - 120_00);
    expect(opened.cash).toBeLessThan(0);
  });

  it("works at each opening, also when the day rolls over inside one call", () => {
    const g: GameState = {
      ...game([{ broken: true, condition: 10, dailyPrice: TOO_DEAR }]),
      managers: MECH,
      minute: 500,
    };
    const t = advanceMinutes(g, 300); // closing, then 80 minutes of day 1
    expect(t.day).toBe(1);
    expect(t.fleet[0]?.condition).toBeGreaterThan(0);
    // paid once at the day-1 opening, plus salary and daily cost at closing
    expect(t.cash).toBeLessThanOrEqual(g.cash - 120_00 - 100_00 - 10_00);
  });

  it("one minute at a time equals the batch, costs and cash included", () => {
    const g: GameState = {
      ...game(
        Array.from({ length: 6 }, (_, i) => ({
          broken: i % 2 === 0,
          condition: 5 + i * 10,
          dailyPrice: 50_00,
        })),
      ),
      managers: MECH,
    };
    let slow = g;
    for (let i = 0; i < DAY_MINUTES * 2; i++) slow = advanceMinutes(slow, 1);
    expect(slow).toEqual(advance(g, 2));
  });
});

describe("save v10", () => {
  const sample = (): GameState => {
    let g = { ...createGame(21, CASH), xp: LEVEL_XP[4] ?? 0 };
    g = buyCar(buyCar(buyCar(g, "used"), "compact"), "hybrid");
    return advance(g, 6);
  };

  it("is version 10", () => {
    expect(GAME_STATE_VERSION).toBe(10);
  });

  it("round-trips a worn fleet", () => {
    const g = sample();
    expect(g.fleet.every((c) => c.age === 6)).toBe(true);
    expect(restoreGameState(json(g), GAME_STATE_VERSION)).toEqual(g);
    expect(validateGameState(json(g))).toEqual(g);
  });

  it("round-trips broken cars, ids after a sale and nextCarId", () => {
    let g = game([{ broken: true, condition: 12, age: 3 }, { condition: 80 }, {}]);
    g = sellCar(g, 2);
    const restored = validateGameState(json(g));
    expect(restored).toEqual(g);
    expect(restored.nextCarId).toBe(4);
  });

  it("migrates a v9 save: nextCarId above every id, cars untouched, nobody is the mechanic", () => {
    const v9 = json(game([{}, {}, {}])) as Record<string, unknown>;
    delete v9["nextCarId"];
    v9["managers"] = { sales: true, pricing: false };
    v9["fleet"] = [{ id: 7, dailyPrice: 90_00, dailyCost: 10_00, rented: false }].concat([
      { id: 2, dailyPrice: 90_00, dailyCost: 10_00, rented: false },
    ]);
    const out = restoreGameState(v9, 9);
    expect(out.nextCarId).toBe(8);
    expect(out.managers).toEqual({ sales: true, pricing: false, mechanic: false });
    expect(out.fleet.map((c) => c.id)).toEqual([7, 2]);
    for (const c of out.fleet) {
      expect(carAge(c)).toBe(0);
      expect(carCondition(c)).toBe(100);
      expect(isBroken(c)).toBe(false);
    }
    // the migrated game plays on
    expect(() => advance(out, 3)).not.toThrow();
  });

  it("migrates an empty fleet to nextCarId 1", () => {
    const v9 = json(createGame(1, CASH)) as Record<string, unknown>;
    delete v9["nextCarId"];
    v9["managers"] = { sales: false, pricing: false };
    expect(restoreGameState(v9, 9).nextCarId).toBe(1);
  });

  it("migrates older saves all the way (v8 without events, cars, managers)", () => {
    const v8 = json(game([{}, {}])) as Record<string, unknown>;
    delete v8["nextCarId"];
    delete v8["event"];
    delete v8["nextEventDay"];
    v8["managers"] = { sales: false, pricing: false };
    const out = restoreGameState(v8, 8);
    expect(out.nextCarId).toBe(3);
    expect(out.event).toBeNull();
  });

  it("v10 data without nextCarId, or without managers.mechanic, is invalid", () => {
    const base = json(game([{}])) as Record<string, unknown>;
    const noNext = { ...base };
    delete noNext["nextCarId"];
    expect(() => validateGameState(noNext)).toThrow(InvalidGameStateError);
    expect(() =>
      validateGameState({ ...base, managers: { sales: false, pricing: false } }),
    ).toThrow(InvalidGameStateError);
  });

  describe("validation of the new fields", () => {
    const base = (): Record<string, unknown> => json(game([{ age: 4, condition: 70 }])) as never;
    const withCar = (patch: Record<string, unknown>): unknown => {
      const b = base();
      const fleet = b["fleet"] as Record<string, unknown>[];
      return { ...b, fleet: [{ ...fleet[0], ...patch }] };
    };
    const issue = (raw: unknown): string => {
      try {
        validateGameState(raw);
      } catch (e) {
        if (e instanceof InvalidGameStateError) return `${e.path}:${e.issue}`;
        throw e;
      }
      return "ok";
    };

    it("accepts the bounds", () => {
      expect(issue(withCar({ age: 0, condition: 0, broken: true }))).toBe("ok");
      expect(issue(withCar({ age: Number.MAX_SAFE_INTEGER, condition: 100, broken: false }))).toBe(
        "ok",
      );
      expect(issue(withCar({}))).toBe("ok");
    });

    it("rejects a bad age", () => {
      expect(issue(withCar({ age: -1 }))).toBe("fleet[0].age:range");
      expect(issue(withCar({ age: 1.5 }))).toBe("fleet[0].age:type");
      expect(issue(withCar({ age: "3" }))).toBe("fleet[0].age:type");
      expect(issue(withCar({ age: null }))).toBe("fleet[0].age:type");
      expect(issue(withCar({ age: Number.MAX_SAFE_INTEGER + 1 }))).toBe("fleet[0].age:type");
    });

    it("rejects a bad condition", () => {
      expect(issue(withCar({ condition: -1 }))).toBe("fleet[0].condition:range");
      expect(issue(withCar({ condition: 101 }))).toBe("fleet[0].condition:range");
      expect(issue(withCar({ condition: 50.5 }))).toBe("fleet[0].condition:type");
      expect(issue(withCar({ condition: "100" }))).toBe("fleet[0].condition:type");
      expect(issue(withCar({ condition: null }))).toBe("fleet[0].condition:type");
    });

    it("rejects a bad broken flag", () => {
      for (const v of [1, 0, "true", null, {}, []]) {
        expect(issue(withCar({ broken: v }))).toBe("fleet[0].broken:type");
      }
    });

    it("outcome 'broken' needs rented = false", () => {
      expect(issue(withCar({ outcome: "broken", rented: false }))).toBe("ok");
      expect(issue(withCar({ outcome: "broken", rented: true }))).toBe(
        "fleet[0].outcome:inconsistent",
      );
      expect(issue(withCar({ outcome: "rented", rented: false }))).toBe(
        "fleet[0].outcome:inconsistent",
      );
    });

    it("nextCarId must be a safe integer above every id", () => {
      const b = base(); // one car, id 1
      expect(issue({ ...b, nextCarId: 2 })).toBe("ok");
      expect(issue({ ...b, nextCarId: 1 })).toBe("nextCarId:inconsistent");
      expect(issue({ ...b, nextCarId: 0 })).toBe("nextCarId:range");
      expect(issue({ ...b, nextCarId: -4 })).toBe("nextCarId:range");
      expect(issue({ ...b, nextCarId: 2.5 })).toBe("nextCarId:type");
      expect(issue({ ...b, nextCarId: "2" })).toBe("nextCarId:type");
      expect(issue({ ...b, nextCarId: Number.NaN })).toBe("nextCarId:type");
      expect(issue({ ...b, nextCarId: null })).toBe("nextCarId:type");
      expect(issue({ ...b, nextCarId: Number.MAX_SAFE_INTEGER + 1 })).toBe("nextCarId:type");
    });

    it("the validated car only keeps known fields", () => {
      const out = validateGameState(withCar({ age: 4, condition: 70, evil: true }));
      expect(Object.keys(out.fleet[0] as object).sort()).toEqual(
        ["age", "condition", "dailyCost", "dailyPrice", "id", "rented"].sort(),
      );
    });
  });
});

describe("interplay with prices", () => {
  it("setCarPrice keeps the wear fields", () => {
    const g = game([{ age: 9, condition: 33, broken: true }]);
    const s = setCarPrice(g, 1, 77_00);
    expect(s.fleet[0]).toMatchObject({ age: 9, condition: 33, broken: true, dailyPrice: 77_00 });
  });

  it("the pricing manager keeps the wear fields", () => {
    const g: GameState = {
      ...game([{ age: 9, condition: 80 }]),
      managers: { ...NO_MANAGERS, pricing: true },
    };
    const t = advanceMinutes(g, 1);
    expect(t.fleet[0]?.condition).toBe(80);
    expect(t.fleet[0]?.age).toBe(9);
  });
});
