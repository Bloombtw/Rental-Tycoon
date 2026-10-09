import { describe, expect, it } from "vitest";
import {
  INITIAL_MISSIONS,
  INITIAL_SHOP,
  NO_DAILY_REWARD,
  NO_MANAGERS,
  NO_UPGRADES,
  type Car,
  type GameState,
} from "@rt/sim";
import { departuresBetween } from "./gains.js";

const car = (over: Partial<Car>): Car => ({
  id: 1,
  dailyPrice: 90_00,
  dailyCost: 10_00,
  rented: true,
  outcome: "rented",
  ...over,
});

const state = (day: number, minute: number, fleet: readonly Car[]): GameState => ({
  seed: 1,
  rngState: 1,
  day,
  minute,
  cash: 0,
  todayRevenue: 0,
  customersLeft: 0,
  upgrades: NO_UPGRADES,
  xp: 0,
  managers: NO_MANAGERS,
  dailyReward: NO_DAILY_REWARD,
  shop: INITIAL_SHOP,
  missions: INITIAL_MISSIONS,
  event: null,
  nextEventDay: 3,
  nextCarId: fleet.length + 1,
  fleet,
  lastDay: day === 0 ? null : { revenue: 0, costs: 0 },
});

// Slots: index i departs at minute 2i.
const fleet = [
  car({ id: 1 }),
  car({ id: 2, rented: false, outcome: "tooExpensive" }),
  car({ id: 3, dailyPrice: 60_00 }),
];

describe("departuresBetween", () => {
  it("lists the rented cars whose slot was crossed, with their price", () => {
    expect(departuresBetween({ day: 0, minute: 0 }, state(0, 5, fleet))).toEqual([
      { index: 0, amount: 90_00 },
      { index: 2, amount: 60_00 },
    ]);
    expect(departuresBetween({ day: 0, minute: 1 }, state(0, 5, fleet))).toEqual([
      { index: 2, amount: 60_00 },
    ]);
  });

  it("across one closing: end of yesterday and start of today", () => {
    expect(departuresBetween({ day: 0, minute: 700 }, state(1, 3, fleet))).toEqual([
      { index: 0, amount: 90_00 },
    ]);
    expect(departuresBetween({ day: 0, minute: 700 }, state(1, 5, fleet))).toEqual([
      { index: 0, amount: 90_00 },
      { index: 2, amount: 60_00 },
    ]);
  });

  it("nothing for a jump of several days, a reset, or no time passed", () => {
    expect(departuresBetween({ day: 0, minute: 0 }, state(2, 5, fleet))).toEqual([]);
    expect(departuresBetween({ day: 5, minute: 0 }, state(0, 5, fleet))).toEqual([]);
    expect(departuresBetween({ day: 0, minute: 5 }, state(0, 5, fleet))).toEqual([]);
  });

  it("ignores free or corrupt prices", () => {
    const odd = [car({ dailyPrice: 0 }), car({ id: 2, dailyPrice: Number.NaN })];
    expect(departuresBetween({ day: 0, minute: 0 }, state(0, 5, odd))).toEqual([]);
  });
});
