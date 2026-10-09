import { describe, expect, it } from "vitest";
import {
  acceptanceChance,
  advance,
  boostedAcceptance,
  buyCar,
  buyUpgrade,
  createGame,
  FleetFullError,
  fleetCapacity,
  InsufficientCashError,
  NO_UPGRADES,
  parkingLevelFor,
  restoreGameState,
  UnknownUpgradeError,
  upgradeCost,
  UpgradeMaxedError,
  UPGRADE_IDS,
  UPGRADES,
  washedReference,
  type GameState,
  type UpgradeId,
} from "./index.js";

const rich = (): GameState => createGame(1, 10 ** 12);

describe("costs", () => {
  it("start at the base and grow exponentially, rounded to 100 €", () => {
    expect(upgradeCost("parking", 0)).toBe(2_000_00);
    expect(upgradeCost("parking", 1)).toBe(3_200_00);
    expect(upgradeCost("parking", 2)).toBe(5_100_00);
    for (const id of UPGRADE_IDS) {
      let prev = 0;
      for (let n = 0; n < UPGRADES[id].maxLevel; n++) {
        const c = upgradeCost(id, n);
        expect(Number.isSafeInteger(c)).toBe(true);
        expect(c % 100_00).toBe(0);
        expect(c).toBeGreaterThan(prev);
        prev = c;
      }
    }
  });
});

describe("buyUpgrade", () => {
  it("pays the cost and raises the level", () => {
    const g = rich();
    const u = buyUpgrade(g, "ads");
    expect(u.upgrades.ads).toBe(1);
    expect(u.cash).toBe(g.cash - upgradeCost("ads", 0));
    expect(g.upgrades.ads).toBe(0);
  });

  it("refuses when broke, maxed or unknown", () => {
    expect(() => buyUpgrade(createGame(1, 0), "wash")).toThrow(InsufficientCashError);
    let g = rich();
    for (let i = 0; i < UPGRADES.counter.maxLevel; i++) g = buyUpgrade(g, "counter");
    expect(() => buyUpgrade(g, "counter")).toThrow(UpgradeMaxedError);
    expect(() => buyUpgrade(g, "rocket" as UpgradeId)).toThrow(UnknownUpgradeError);
    expect(() => buyUpgrade(g, "__proto__" as UpgradeId)).toThrow(UnknownUpgradeError);
  });
});

describe("parking", () => {
  it("holds 5 cars, +5 per level, up to 50", () => {
    expect(fleetCapacity(NO_UPGRADES)).toBe(5);
    expect(fleetCapacity({ ...NO_UPGRADES, parking: 3 })).toBe(20);
    expect(fleetCapacity({ ...NO_UPGRADES, parking: 9 })).toBe(50);
    expect(parkingLevelFor(0)).toBe(0);
    expect(parkingLevelFor(6)).toBe(1);
    expect(parkingLevelFor(50)).toBe(9);
  });

  it("buyCar stops at the capacity, an upgrade makes room", () => {
    let g = rich();
    for (let i = 0; i < 5; i++) g = buyCar(g, "used");
    expect(() => buyCar(g, "used")).toThrow(FleetFullError);
    g = buyUpgrade(g, "parking");
    expect(buyCar(g, "used").fleet).toHaveLength(6);
  });

  it("createGame sizes the parking to the starting fleet", () => {
    const fleet = Array.from({ length: 12 }, () => ({ dailyPrice: 1, dailyCost: 0 }));
    expect(fleetCapacity(createGame(1, 0, fleet).upgrades)).toBe(15);
  });
});

describe("effects", () => {
  it("counter raises acceptance, capped at 99 %, never above 0 when refused", () => {
    const c = { ...NO_UPGRADES, counter: 5 };
    expect(boostedAcceptance(0.4, c)).toBeCloseTo(0.5);
    expect(boostedAcceptance(0.85, c)).toBe(0.99);
    expect(boostedAcceptance(0, c)).toBe(0);
    expect(boostedAcceptance(0.98, NO_UPGRADES)).toBe(0.98);
  });

  it("wash raises the reference price (integer cents)", () => {
    expect(washedReference(90_00, { ...NO_UPGRADES, wash: 2 })).toBe(108_00);
    expect(washedReference(60_00, NO_UPGRADES)).toBe(60_00);
    // 120 € on a 60 € car: impossible without wash, possible with 5 levels.
    expect(acceptanceChance(120_00, washedReference(60_00, NO_UPGRADES))).toBe(0);
    // 120 / 90 = 1.33x the washed reference: between 85 % (1x) and 40 % (1.5x).
    expect(
      acceptanceChance(120_00, washedReference(60_00, { ...NO_UPGRADES, wash: 5 })),
    ).toBeCloseTo(0.55);
  });

  it("ads bring more revenue over time at the same prices", () => {
    const fleet = Array.from({ length: 20 }, () => ({ dailyPrice: 90_00, dailyCost: 0 }));
    const base = createGame(7, 0, fleet);
    const boosted: GameState = { ...base, upgrades: { ...base.upgrades, ads: 5 } };
    expect(advance(boosted, 100).cash).toBeGreaterThan(advance(base, 100).cash);
  });
});

describe("save v3", () => {
  it("migrates a v2 save with a parking that fits the fleet", () => {
    const fleet = Array.from({ length: 12 }, () => ({ dailyPrice: 1, dailyCost: 0 }));
    const g = createGame(1, 0, fleet);
    const v2 = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
    delete v2["upgrades"];
    const restored = restoreGameState(v2, 2);
    expect(restored.upgrades).toEqual({ ...NO_UPGRADES, parking: 2 });
  });
});
