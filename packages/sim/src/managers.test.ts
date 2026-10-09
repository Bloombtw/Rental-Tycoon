import { describe, expect, it } from "vitest";
import {
  advance,
  acceptanceChance,
  bestPrice,
  boostedAcceptance,
  createGame,
  fireManager,
  hireManager,
  InsufficientCashError,
  LEVEL_XP,
  ManagerStateError,
  MANAGERS,
  ModelLockedError,
  NO_UPGRADES,
  restoreGameState,
  tick,
  UnknownManagerError,
  washedReference,
  referencePrice,
  type Car,
  type GameState,
  type ManagerId,
} from "./index.js";

const leveled = (level: number, cash = 10 ** 9): GameState => ({
  ...createGame(1, cash),
  xp: LEVEL_XP[level - 1] ?? 0,
});

describe("hire / fire", () => {
  it("hiring pays once and needs the level", () => {
    expect(() => hireManager(createGame(1, 10 ** 9), "sales")).toThrow(ModelLockedError);
    const g = leveled(3);
    const h = hireManager(g, "pricing");
    expect(h.managers.pricing).toBe(true);
    expect(h.cash).toBe(g.cash - MANAGERS.pricing.hireCost);
    expect(() => hireManager(h, "pricing")).toThrow(ManagerStateError);
    expect(() => hireManager(leveled(3, 0), "sales")).toThrow(InsufficientCashError);
    expect(() => hireManager(g, "boss" as ManagerId)).toThrow(UnknownManagerError);
  });

  it("firing stops the salary; firing nobody is refused", () => {
    const h = hireManager(leveled(2), "sales");
    expect(fireManager(h, "sales").managers.sales).toBe(false);
    expect(() => fireManager(leveled(2), "sales")).toThrow(ManagerStateError);
  });
});

describe("effects", () => {
  it("salaries are part of the day's costs", () => {
    const g = hireManager(leveled(3), "pricing");
    expect(tick(g).lastDay?.costs).toBe(MANAGERS.pricing.dailySalary);
  });

  it("the pricing manager sets every car to its best price each morning", () => {
    const fleet = Array.from({ length: 4 }, () => ({ dailyPrice: 500_00, dailyCost: 0 }));
    const base = { ...createGame(2, 10 ** 9, fleet), xp: LEVEL_XP[2] ?? 0 };
    const g = hireManager(base, "pricing");
    const t = advance(g, 1);
    for (const car of t.fleet) expect(car.dailyPrice).toBe(bestPrice(car, t.upgrades));
  });

  it("bestPrice beats or matches the reference price in expected revenue", () => {
    const car: Car = { id: 1, dailyPrice: 0, dailyCost: 0, rented: false };
    for (const upgrades of [NO_UPGRADES, { ...NO_UPGRADES, counter: 5, wash: 3 }]) {
      const ref = washedReference(referencePrice(car), upgrades);
      const best = bestPrice(car, upgrades);
      expect(best % 100).toBe(0);
      const value = (p: number) => p * boostedAcceptance(acceptanceChance(p, ref), upgrades);
      expect(value(best)).toBeGreaterThanOrEqual(value(ref) - 1);
    }
  });

  it("the sales manager brings more revenue over time", () => {
    const fleet = Array.from({ length: 20 }, () => ({ dailyPrice: 90_00, dailyCost: 0 }));
    const base = { ...createGame(7, 0, fleet), xp: LEVEL_XP[1] ?? 0 };
    const staffed: GameState = {
      ...base,
      managers: { sales: true, pricing: false, mechanic: false },
    };
    const salary = MANAGERS.sales.dailySalary * 100;
    // A diligent owner keeps the cars healthy: wear is not what this test is about.
    const run = (start: GameState): GameState => {
      let g = start;
      for (let d = 0; d < 100; d++) {
        g = tick({ ...g, fleet: g.fleet.map((c) => ({ ...c, condition: 100, broken: false })) });
      }
      return g;
    };
    expect(run(staffed).cash + salary).toBeGreaterThan(run(base).cash);
  });
});

describe("save v5", () => {
  it("migrates a v4 save with nobody hired", () => {
    const v4 = JSON.parse(JSON.stringify(createGame(1))) as Record<string, unknown>;
    delete v4["managers"];
    expect(restoreGameState(v4, 4).managers).toEqual({
      sales: false,
      pricing: false,
      mechanic: false,
    });
  });
});
