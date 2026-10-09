import { describe, expect, it } from "vitest";
import {
  advance,
  advanceMinutes,
  buyCar,
  createGame,
  DAY_MINUTES,
  DEPARTURE_STAGGER_MINUTES,
  departureMinute,
  InvalidMinutesError,
  MAX_ADVANCE_MINUTES,
  MAX_FLEET_SIZE,
  RENTAL_MINUTES,
  returnMinute,
  setCarPrice,
  SimOverflowError,
  tick,
  UPGRADES,
  type Car,
  type GameState,
  type NewCar,
} from "./index.js";

// Spec: docs/specs/agency-view.md section 2.1 and 7 (sim criteria 1 to 5).

const CASH = 100_000_00;
const P60: NewCar = { dailyPrice: 60_00, dailyCost: 25_00 };
const P90: NewCar = { dailyPrice: 90_00, dailyCost: 40_00 };
const P200: NewCar = { dailyPrice: 200_00, dailyCost: 30_00 };

function fleetOf(n: number, car: NewCar = P60): NewCar[] {
  return Array.from({ length: n }, () => car);
}

/** Sum of the prices of the cars rented in this fleet snapshot. */
function revenueOf(fleet: readonly Car[]): number {
  return fleet.reduce((s, c) => s + (c.rented ? c.dailyPrice : 0), 0);
}

/** First seed whose run of `minutes` from a fresh game satisfies `pred`. */
function findSeed(fleet: NewCar[], minutes: number, pred: (s: GameState) => boolean): number {
  for (let seed = 1; seed < 500; seed++) {
    if (pred(advanceMinutes(createGame(seed, CASH, fleet), minutes))) return seed;
  }
  throw new Error("no seed found");
}

/** Cars cycle through 60, 90, 200 (never rented: >= 2x the 90 reference), 150, 150.01. */
function mixed(n: number): NewCar[] {
  const prices = [60_00, 90_00, 200_00, 150_00, 150_01];
  return Array.from({ length: n }, (_, i) => ({
    dailyPrice: prices[i % prices.length] ?? 0,
    dailyCost: 10_00 + (i % 7) * 1_00,
  }));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

function clone<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map((v: unknown) => clone(v)) as T;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) out[key] = clone(Reflect.get(value, key));
  return out as T;
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

function expectOverflow(fn: () => unknown, field: string): void {
  const e = thrown(fn);
  expect(e).toBeInstanceOf(SimOverflowError);
  expect((e as SimOverflowError).field).toBe(field);
}

type LooseAdvance = (state: unknown, minutes: unknown) => GameState;
const looseAdvance = advanceMinutes as unknown as LooseAdvance;

function at(g: GameState, minute: number): GameState {
  return minute === 0 ? g : advanceMinutes(g, minute);
}

function price(c: Car | undefined): number {
  return c?.dailyPrice ?? NaN;
}

describe("time constants and schedule", () => {
  it("exposes the contract constants", () => {
    expect(DAY_MINUTES).toBe(720);
    expect(MAX_ADVANCE_MINUTES).toBe(720);
    expect(DEPARTURE_STAGGER_MINUTES).toBe(2);
    expect(RENTAL_MINUTES).toBe(600);
  });

  it("createGame starts at day 0, minute 0, todayRevenue 0", () => {
    const g = createGame(1, CASH, fleetOf(3));
    expect(g.minute).toBe(0);
    expect(g.todayRevenue).toBe(0);
    expect(g.day).toBe(0);
  });

  it("departureMinute(i) = 2i for 0..49", () => {
    for (let i = 0; i < MAX_FLEET_SIZE; i++) expect(departureMinute(i)).toBe(2 * i);
    expect(departureMinute(49)).toBe(98);
  });

  it("returnMinute(i) = departure + 600 and every return is before closing", () => {
    for (let i = 0; i < MAX_FLEET_SIZE; i++) {
      const r = returnMinute(i);
      expect(r).toBe(2 * i + RENTAL_MINUTES);
      expect(r).not.toBeNull();
      expect(r ?? Infinity).toBeLessThan(DAY_MINUTES);
    }
    expect(returnMinute(0)).toBe(600);
    expect(returnMinute(49)).toBe(698);
  });

  it.each([-1, 50, 51, 1.5, NaN, Infinity, -Infinity, 2 ** 53, "1", null, undefined, {}, [0]])(
    "departureMinute/returnMinute(%s) is null",
    (bad) => {
      const dep = departureMinute as unknown as (i: unknown) => number | null;
      const ret = returnMinute as unknown as (i: unknown) => number | null;
      expect(dep(bad)).toBeNull();
      expect(ret(bad)).toBeNull();
    },
  );

  it("-0 is treated as index 0", () => {
    expect(Number(departureMinute(-0)) === 0).toBe(true);
    expect(Number(returnMinute(-0))).toBe(600);
  });
});

describe("advanceMinutes: invalid minutes", () => {
  const g = createGame(1, CASH, fleetOf(3));

  it.each([
    -1,
    -720,
    0.5,
    1.0000001,
    NaN,
    Infinity,
    -Infinity,
    721,
    1000,
    2 ** 53,
    Number.MAX_SAFE_INTEGER,
    "5",
    "",
    null,
    undefined,
    true,
    {},
    [],
    [5],
    10n,
  ])("%s throws InvalidMinutesError carrying the value", (bad) => {
    const e = thrown(() => looseAdvance(g, bad));
    expect(e).toBeInstanceOf(InvalidMinutesError);
    expect((e as InvalidMinutesError).code).toBe("INVALID_MINUTES");
    expect((e as InvalidMinutesError).name).toBe("InvalidMinutesError");
    expect(Object.is((e as InvalidMinutesError).minutes, bad)).toBe(true);
  });

  it("accepts the bounds 0, 1, 720", () => {
    expect(() => advanceMinutes(g, 0)).not.toThrow();
    expect(() => advanceMinutes(g, 1)).not.toThrow();
    expect(() => advanceMinutes(g, 720)).not.toThrow();
  });

  it("-0 is valid and returns the same reference", () => {
    expect(advanceMinutes(g, -0)).toBe(g);
  });

  it("0 returns the same reference", () => {
    expect(advanceMinutes(g, 0)).toBe(g);
  });

  it("minutes are validated before the state: bad minutes + corrupt state is InvalidMinutesError", () => {
    const corrupt: GameState = { ...g, minute: 99999 };
    expect(thrown(() => looseAdvance(corrupt, -1))).toBeInstanceOf(InvalidMinutesError);
  });

  it("a hostile object with valueOf/toString is never coerced", () => {
    let called = 0;
    const hostile = {
      valueOf(): number {
        called++;
        return 5;
      },
      toString(): string {
        called++;
        return "5";
      },
    };
    expect(thrown(() => looseAdvance(g, hostile))).toBeInstanceOf(InvalidMinutesError);
    expect(called).toBe(0);
  });

  it("invalid minutes on a state that would overflow still reports InvalidMinutesError", () => {
    const edge = createGame(1, Number.MAX_SAFE_INTEGER, fleetOf(2));
    expectOverflow(() => advanceMinutes(edge, 720), "cash");
    expect(thrown(() => looseAdvance(edge, 721))).toBeInstanceOf(InvalidMinutesError);
  });
});

describe("advanceMinutes: corrupt state.minute", () => {
  const base = createGame(1, CASH, fleetOf(3));
  it.each([-1, 720, 721, 0.5, NaN, Infinity, -Infinity, 2 ** 53, "3", null, undefined])(
    "minute %s throws SimOverflowError(minute) and tick too",
    (m) => {
      const g = { ...base, minute: m } as unknown as GameState;
      expectOverflow(() => advanceMinutes(g, 1), "minute");
      expectOverflow(() => tick(g), "minute");
      expectOverflow(() => advance(g, 1), "minute");
    },
  );

  it("minute 719 is valid and the last minute", () => {
    const g = at(base, 719);
    expect(g.minute).toBe(719);
    expect(advanceMinutes(g, 1).minute).toBe(0);
  });
});

describe("slot boundaries", () => {
  const g0 = createGame(1, CASH, fleetOf(3));

  it("the event at minute a has not happened when the counter is at a", () => {
    // Car 1 departs at minute 2: at minute 2 it has not left yet.
    const g2 = at(g0, 2);
    expect(g2.minute).toBe(2);
    expect(g2.fleet[1]?.rented).toBe(false);
    expect(g2.fleet[1]?.outcome).toBeUndefined();
    expect(g2.fleet[0]?.outcome).toBeDefined(); // car 0 only (minute 0 processed)
    expect(g2.cash).toBe(CASH + revenueOf(g2.fleet.slice(0, 1)));
    expect(g2.todayRevenue).toBe(revenueOf(g2.fleet.slice(0, 1)));
  });

  it("advancing to a+1 fires the event at a", () => {
    const g3 = at(g0, 3);
    expect(g3.fleet[1]?.outcome).toBeDefined();
    expect(g3.fleet[2]?.outcome).toBeUndefined();
    expect(g3.cash).toBe(CASH + revenueOf(g3.fleet));
    expect(g3.todayRevenue).toBe(revenueOf(g3.fleet));
  });

  it("from minute 2, advancing 1 fires car 1 (minute 2); from 3, advancing 1 fires nothing", () => {
    const g2 = at(g0, 2);
    expect(advanceMinutes(g2, 1)).toEqual(at(g0, 3));
    const g3 = at(g0, 3);
    expect(advanceMinutes(g3, 1).cash).toBe(g3.cash);
    expect(advanceMinutes(g3, 1).fleet).toEqual(g3.fleet);
  });

  it("the first minute fires car 0 at 09:00 sharp", () => {
    const g1 = advanceMinutes(g0, 1);
    expect(g1.fleet[0]?.outcome).toBeDefined();
    expect(g1.cash).toBe(CASH + (g1.fleet[0]?.rented ? 60_00 : 0));
    expect(g0.fleet[0]?.rented).toBe(false);
    expect(g0.fleet[0]?.outcome).toBeUndefined();
  });

  it("each car fires exactly once per day at its own slot", () => {
    const g = createGame(1, CASH, fleetOf(50));
    let prev = g;
    for (let m = 1; m <= 99; m++) {
      const next = advanceMinutes(prev, 1);
      const fired = next.cash - prev.cash;
      // processed minute is m - 1: a car departs on even minutes 0..98
      if ((m - 1) % 2 === 0) {
        expect([0, 60_00]).toContain(fired);
        expect(next.fleet[(m - 1) / 2]?.outcome).toBeDefined();
      } else {
        expect(fired).toBe(0);
      }
      prev = next;
    }
    expect(prev.fleet.every((c) => c.outcome !== undefined)).toBe(true);
    expect(prev.cash).toBe(CASH + revenueOf(prev.fleet));
  });

  it("a car whose index is >= 50 (corrupt fleet) is never rented", () => {
    const base = createGame(1, CASH, fleetOf(2));
    const extra: Car[] = Array.from({ length: 52 }, (_, i) => ({
      id: i + 1,
      dailyPrice: 60_00,
      dailyCost: 1_00,
      rented: false,
    }));
    const g: GameState = { ...base, fleet: extra };
    const t = tick(g);
    expect(t.fleet.slice(0, 50).every((c) => c.outcome !== undefined)).toBe(true);
    expect(t.fleet.slice(50).every((c) => !c.rented && c.outcome === undefined)).toBe(true);
    expect(t.lastDay).toEqual({ revenue: revenueOf(t.fleet), costs: 52 * 1_00 });
  });
});

describe("live cash, todayRevenue and closing", () => {
  const fleet = [P60, P90, P200];
  const g0 = createGame(1, CASH, fleet);

  it("cash rises at departures; no cost is taken before closing", () => {
    const g = at(g0, 719);
    const rev = revenueOf(g.fleet);
    expect(g.cash).toBe(CASH + rev);
    expect(g.todayRevenue).toBe(rev);
    expect(g.day).toBe(0);
    expect(g.lastDay).toBeNull();
  });

  it("costs are taken at 720 along with the day change", () => {
    const before = at(g0, 719);
    const rev = revenueOf(before.fleet);
    const g = advanceMinutes(before, 1);
    expect(g.cash).toBe(CASH + rev - 95_00);
    expect(g.day).toBe(1);
    expect(g.minute).toBe(0);
    expect(g.todayRevenue).toBe(0);
    expect(g.lastDay).toEqual({ revenue: rev, costs: 95_00 });
  });

  it("lastDay.revenue counts only rented cars; costs count every car", () => {
    const t = advanceMinutes(g0, 720);
    expect(t.lastDay).toEqual({ revenue: revenueOf(t.fleet), costs: 25_00 + 40_00 + 30_00 });
    // 200,00 is >= 2x the 90,00 fixture reference: never rented
    expect(t.fleet[2]?.rented).toBe(false);
    expect(t.fleet[2]?.outcome).toBe("tooExpensive");
  });

  it("a car at 2x the reference or more is never rented, whatever the seed", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const t = tick(createGame(seed, CASH, [P200, { dailyPrice: 180_00, dailyCost: 1_00 }]));
      expect(t.fleet.map((c) => c.rented)).toEqual([false, false]);
      expect(t.lastDay?.revenue).toBe(0);
    }
  });

  it("odd prices near the old 150,00 limit follow the random acceptance, not a threshold", () => {
    const t = tick(createGame(1, CASH, mixed(5)));
    expect(t.fleet[2]?.rented).toBe(false);
    expect(t.lastDay?.revenue).toBe(revenueOf(t.fleet));
    // 150,00 and 150,01 are both rentable for some seed
    for (const idx of [3, 4]) {
      const seen = new Set<boolean>();
      for (let seed = 1; seed <= 60; seed++) {
        seen.add(tick(createGame(seed, CASH, mixed(5))).fleet[idx]?.rented ?? false);
      }
      expect(seen).toEqual(new Set([true, false]));
    }
  });

  it("an empty fleet pays nothing and still changes day", () => {
    const t = advanceMinutes(createGame(1, CASH), 720);
    expect(t.cash).toBe(CASH);
    expect(t.day).toBe(1);
    expect(t.lastDay).toEqual({ revenue: 0, costs: 0 });
  });

  it("an unrentable car is still charged at closing", () => {
    const t = advanceMinutes(createGame(1, CASH, [P200]), 720);
    expect(t.cash).toBe(CASH - 30_00);
    expect(t.fleet[0]?.rented).toBe(false);
  });

  it("rented flips back to false at the slot when the price became unrentable", () => {
    const seed = findSeed([P60], DAY_MINUTES, (s) => s.fleet[0]?.rented === true);
    const d1 = tick(createGame(seed, CASH, [P60]));
    expect(d1.fleet[0]?.rented).toBe(true);
    expect(d1.fleet[0]?.outcome).toBe("rented");
    const pricey = setCarPrice(d1, 1, 200_00);
    // before the slot the value still describes yesterday
    expect(pricey.fleet[0]?.rented).toBe(true);
    const after = advanceMinutes(pricey, 1);
    expect(after.fleet[0]?.rented).toBe(false);
    expect(after.fleet[0]?.outcome).toBe("tooExpensive");
  });

  it("minute and day advance modulo the day length", () => {
    let g = g0;
    g = advanceMinutes(g, 700);
    expect([g.day, g.minute]).toEqual([0, 700]);
    g = advanceMinutes(g, 30);
    expect([g.day, g.minute]).toEqual([1, 10]);
    g = advanceMinutes(g, 720);
    expect([g.day, g.minute]).toEqual([2, 10]);
  });

  it("crossing closing from the middle of a day counts the next morning's slots in the new todayRevenue", () => {
    const mid = at(g0, 700);
    const g = advanceMinutes(mid, 720); // 20 min to close, then 700 into day 1
    expect(g.day).toBe(1);
    expect(g.minute).toBe(700);
    expect(g.todayRevenue).toBe(revenueOf(g.fleet));
    expect(g.lastDay).toEqual({ revenue: revenueOf(mid.fleet), costs: 95_00 });
    expect(g.cash).toBe(CASH + revenueOf(mid.fleet) - 95_00 + revenueOf(g.fleet));
  });

  it("seed is untouched; rngState is a deterministic function of the state", () => {
    const g = { ...createGame(7, CASH, fleet), rngState: 12345 };
    const t = advanceMinutes(g, 720);
    expect(t.seed).toBe(7);
    expect(Number.isInteger(t.rngState)).toBe(true);
    expect(t.rngState).not.toBe(12345); // the day's draws consumed the stream
    expect(advanceMinutes(g, 720)).toEqual(t);
  });

  it("without any random event the rngState does not move", () => {
    const g = at(createGame(7, CASH, fleet), 10); // all slots done, minute 0 already processed
    expect(advanceMinutes(g, 100).rngState).toBe(g.rngState);
  });

  it("tick from minute 0: cash = start + rented prices - costs", () => {
    const f = mixed(13);
    const g = createGame(1, CASH, f);
    const costs = f.reduce((s, c) => s + c.dailyCost, 0);
    const t = tick(g);
    const revenue = revenueOf(t.fleet);
    expect(t.cash).toBe(CASH + revenue - costs);
    expect(t.day).toBe(1);
    expect(t.minute).toBe(0);
    expect(t.lastDay).toEqual({ revenue, costs });
    // five days: sum the per-day reports
    let s = g;
    let net = 0;
    for (let d = 0; d < 5; d++) {
      s = tick(s);
      net += (s.lastDay?.revenue ?? NaN) - (s.lastDay?.costs ?? NaN);
    }
    expect(advance(g, 5)).toEqual(s);
    expect(s.cash).toBe(CASH + net);
  });

  it("tick from mid-day equals advancing the remaining minutes", () => {
    const mid = at(createGame(1, CASH, mixed(9)), 123);
    expect(tick(mid)).toEqual(advanceMinutes(mid, 720 - 123));
    expect(tick(mid).minute).toBe(0);
    expect(tick(mid).day).toBe(mid.day + 1);
  });
});

describe("composition: a then b equals a + b", () => {
  const states: [string, GameState][] = [
    ["empty", createGame(3, CASH)],
    ["mixed 13", createGame(3, CASH, mixed(13))],
    ["full 50", createGame(3, CASH, mixed(50))],
  ];
  const pairs: [number, number][] = [
    [0, 0],
    [0, 5],
    [1, 1],
    [1, 719],
    [2, 3],
    [3, 2],
    [99, 2],
    [100, 1],
    [359, 361],
    [360, 360],
    [719, 1],
    [719, 719],
    [720, 0],
    [720, 720],
    [500, 600],
    [700, 700],
    [1, 720],
    [37, 683],
  ];

  describe.each(states)("%s", (_n, g) => {
    it.each(pairs)("advance %i then %i", (a, b) => {
      const split = advanceMinutes(advanceMinutes(g, a), b);
      const whole =
        a + b <= 720
          ? advanceMinutes(g, a + b)
          : advanceMinutes(advanceMinutes(g, 720), a + b - 720);
      expect(split).toEqual(whole);
    });
  });

  it("many small steps equal one big tick sequence over several days", () => {
    const g = createGame(3, CASH, mixed(20));
    let stepped = g;
    for (let i = 0; i < 3 * 720; i += 7) {
      stepped = advanceMinutes(stepped, Math.min(7, 3 * 720 - i));
    }
    expect(stepped).toEqual(advance(g, 3));
  });

  it("chunks of 85 minutes (the web clock commit size) equal advance", () => {
    const g = createGame(3, CASH, mixed(50));
    let stepped = g;
    let left = 5 * 720;
    while (left > 0) {
      const n = Math.min(85, left);
      stepped = advanceMinutes(stepped, n);
      left -= n;
    }
    expect(stepped).toEqual(advance(g, 5));
  });
});

describe("buying and pricing during the day", () => {
  function withTwentyCars(minute: number): GameState {
    const g = createGame(1, CASH, fleetOf(20));
    // Room to buy more: full parking (upgrades.md).
    return at({ ...g, upgrades: { ...g.upgrades, parking: UPGRADES.parking.maxLevel } }, minute);
  }

  it("a car bought at minute 30 as the 21st (slot 40) leaves the same day", () => {
    const g = buyCar(withTwentyCars(30), "compact");
    expect(g.minute).toBe(30);
    expect(g.fleet).toHaveLength(21);
    expect(g.fleet[20]?.rented).toBe(false);
    const before = g.cash;
    const after = advanceMinutes(g, 11); // processes 30..40
    expect(after.fleet[20]?.outcome).toBeDefined(); // it had its slot today
    expect(after.cash - before).toBe(revenueOf(after.fleet) - revenueOf(g.fleet));
  });

  it("bought at the very minute of its slot (40): still leaves the same day", () => {
    const g = buyCar(withTwentyCars(40), "compact");
    expect(g.fleet[20]?.outcome).toBeUndefined();
    expect(advanceMinutes(g, 1).fleet[20]?.outcome).toBeDefined();
  });

  it("bought one minute after its slot (41): waits for tomorrow", () => {
    const g = buyCar(withTwentyCars(41), "compact");
    const closed = advanceMinutes(g, DAY_MINUTES - 41);
    expect(closed.fleet[20]?.rented).toBe(false);
    expect(closed.fleet[20]?.outcome).toBeUndefined();
    expect(closed.lastDay?.costs).toBe(20 * 25_00 + 25_00); // pays the whole day
    const nextMorning = advanceMinutes(closed, 41);
    expect(nextMorning.fleet[20]?.outcome).toBeDefined();
  });

  it("bought at 11:00 (minute 120): waits for tomorrow", () => {
    const g = buyCar(withTwentyCars(120), "compact");
    const closed = advanceMinutes(g, 600);
    expect(closed.fleet[20]?.rented).toBe(false);
    expect(closed.fleet[20]?.outcome).toBeUndefined();
    expect(closed.lastDay?.revenue).toBe(revenueOf(closed.fleet.slice(0, 20)));
  });

  it("buyCar keeps minute and todayRevenue and spends cash immediately", () => {
    const g = withTwentyCars(100);
    const b = buyCar(g, "used");
    expect(b.minute).toBe(100);
    expect(b.todayRevenue).toBe(g.todayRevenue);
    expect(b.cash).toBe(g.cash - 4_000_00);
  });

  it("buying the 50th car at the last minute is paid for the whole day", () => {
    const g = buyCar(withTwentyCars(719), "used");
    const closed = advanceMinutes(g, 1);
    expect(closed.lastDay?.costs).toBe(20 * 25_00 + 60_00);
  });

  it("a price raised to 200 before the slot blocks today's rental", () => {
    const g = setCarPrice(createGame(1, CASH, fleetOf(3)), 2, 200_00); // id 2 = index 1
    const t = advanceMinutes(g, 720);
    expect(t.fleet[1]?.rented).toBe(false);
    expect(t.fleet[1]?.outcome).toBe("tooExpensive");
    expect(t.lastDay?.revenue).toBe(revenueOf(t.fleet));
    expect(t.lastDay?.revenue).toBeLessThanOrEqual(120_00);
  });

  it("the same raise applied after the slot only counts tomorrow", () => {
    // minute 3: car id 2 (index 1, slot 2) has left; car id 3 (slot 4) has not.
    const g = at(createGame(1, CASH, fleetOf(3)), 3);
    const late = setCarPrice(g, 2, 200_00);
    const closed = advanceMinutes(late, 717);
    expect(closed.fleet[1]).toEqual({ ...g.fleet[1], dailyPrice: 200_00 }); // today's outcome kept
    expect(closed.lastDay?.revenue).toBe(
      revenueOf(closed.fleet.map((c, i) => (i === 1 ? { ...c, dailyPrice: 60_00 } : c))),
    );
    expect(advanceMinutes(closed, 720).fleet[1]?.rented).toBe(false);
    // the car whose slot is still ahead is blocked today
    const early = setCarPrice(g, 3, 200_00);
    const earlyClosed = advanceMinutes(early, 717);
    expect(earlyClosed.fleet[2]?.rented).toBe(false);
    expect(earlyClosed.fleet[2]?.outcome).toBe("tooExpensive");
  });

  it("setCarPrice keeps minute and todayRevenue", () => {
    const g = at(createGame(1, CASH, fleetOf(5)), 6);
    const s = setCarPrice(g, 1, 99_00);
    expect(s.minute).toBe(6);
    expect(s.todayRevenue).toBe(g.todayRevenue);
    expect(price(s.fleet[0])).toBe(99_00);
  });
});

describe("overflow mid-day", () => {
  it("the second departure overflows", () => {
    const seed = findSeed([P60, P60], 3, (s) => s.fleet.every((c) => c.rented));
    const g = deepFreeze(createGame(seed, Number.MAX_SAFE_INTEGER - 60_00, [P60, P60]));
    const copy = clone(g);
    expectOverflow(() => advanceMinutes(g, 720), "cash");
    expectOverflow(() => advanceMinutes(g, 3), "cash");
    expect(g).toEqual(copy);
  });

  it("an advance that stops before the overflowing slot succeeds and the next one throws", () => {
    const seed = findSeed([P60, P60], 3, (s) => s.fleet.every((c) => c.rented));
    const g = createGame(seed, Number.MAX_SAFE_INTEGER - 60_00, [P60, P60]);
    const mid = advanceMinutes(g, 2); // only car 0 (minute 0, 1)
    expect(mid.cash).toBe(Number.MAX_SAFE_INTEGER);
    const copy = clone(mid);
    expectOverflow(() => advanceMinutes(mid, 1), "cash");
    expect(mid).toEqual(copy);
  });

  it("todayRevenue unsafe also reports cash", () => {
    const seed = findSeed([P60], 1, (s) => s.fleet[0]?.rented === true);
    const g: GameState = {
      ...createGame(seed, 0, [P60]),
      todayRevenue: Number.MAX_SAFE_INTEGER - 10,
    };
    expectOverflow(() => advanceMinutes(g, 1), "cash");
  });

  it("closing with negative cash overflow reports cash and keeps input", () => {
    const g = deepFreeze(createGame(1, 0, [P200]));
    const low: GameState = { ...g, cash: Number.MIN_SAFE_INTEGER + 10_00 };
    const copy = clone(low);
    expectOverflow(() => advanceMinutes(low, 720), "cash");
    expect(low).toEqual(copy);
  });

  it("day overflow at closing reports day", () => {
    const g: GameState = { ...createGame(1, CASH, [P60]), day: Number.MAX_SAFE_INTEGER };
    expectOverflow(() => advanceMinutes(g, 720), "day");
    // not at closing: the day does not move, no error
    expect(() => advanceMinutes(g, 719)).not.toThrow();
  });

  it.each([NaN, Infinity, 0.5])("hand-built cash %s throws cash", (cash) => {
    const g = { ...createGame(1, CASH, [P60]), cash } as unknown as GameState;
    expectOverflow(() => advanceMinutes(g, 1), "cash");
  });

  it("corrupt todayRevenue (NaN) does not render NaN cash", () => {
    const g: GameState = { ...createGame(1, CASH, [P60]), todayRevenue: NaN };
    const e = thrown(() => advanceMinutes(g, 1));
    if (e === undefined) {
      const t = advanceMinutes(g, 1);
      expect(Number.isNaN(t.cash)).toBe(false);
      expect(Number.isNaN(t.todayRevenue)).toBe(false);
    } else {
      expect(e).toBeInstanceOf(SimOverflowError);
    }
  });
});

describe("references, purity, performance", () => {
  it("fleet keeps its reference when no slot is crossed", () => {
    const g = at(createGame(1, CASH, fleetOf(3)), 10); // slots at 0, 2, 4
    expect(advanceMinutes(g, 5).fleet).toBe(g.fleet);
    expect(advanceMinutes(g, 5)).not.toBe(g);
    expect(advanceMinutes(g, 5).minute).toBe(15);
  });

  it("an empty fleet keeps its reference too", () => {
    const g = createGame(1, CASH);
    expect(advanceMinutes(g, 100).fleet).toBe(g.fleet);
  });

  it("fleet gets a fresh array when a slot is crossed", () => {
    const g = createGame(1, CASH, fleetOf(3));
    expect(advanceMinutes(g, 1).fleet).not.toBe(g.fleet);
  });

  it("deep-frozen inputs work, including across closing, and are not mutated", () => {
    const g = deepFreeze(createGame(1, CASH, mixed(30)));
    const copy = clone(g);
    expect(() => advanceMinutes(g, 720)).not.toThrow();
    expect(() => advanceMinutes(at(g, 5), 720)).not.toThrow();
    expect(() => advance(g, 3)).not.toThrow();
    expect(() => tick(g)).not.toThrow();
    expect(g).toEqual(copy);
  });

  it("results are JSON round-trip stable", () => {
    const t = advanceMinutes(createGame(1, CASH, mixed(7)), 333);
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it("bought cars keep their model through a day", () => {
    let g = createGame(1, CASH);
    g = buyCar(g, "hybrid");
    g = buyCar(g, "used");
    const t = advanceMinutes(g, 720);
    expect(t.fleet.map((c) => c.model)).toEqual(["hybrid", "used"]);
    expect(t.fleet.map((c) => c.id)).toEqual([1, 2]);
  });

  it("advance(g, 3650) with 50 cars is fast", () => {
    const g = createGame(1, 0, mixed(50));
    const t = advance(g, 3650);
    expect(t.day).toBe(3650);
    expect(Number.isSafeInteger(t.cash)).toBe(true);
  }, 5_000);

  it("a thousand 1-minute steps do not blow up", () => {
    let g = createGame(1, CASH, fleetOf(50));
    for (let i = 0; i < 1000; i++) g = advanceMinutes(g, 1);
    expect(g.day).toBe(1);
    expect(g.minute).toBe(280);
  });
});
