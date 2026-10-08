import { describe, expect, it } from "vitest";
import { MAX_ADVANCE_MINUTES, createGame, type GameState } from "@rt/sim";
import { formatCents } from "../format.js";
import {
  COMMIT_INTERVAL_MS,
  MAX_FRAME_MS,
  MS_PER_GAME_MINUTE,
  SPEEDS,
  accumulateMinutes,
  dayBannerDurationMs,
  dayBannerText,
  formatClock,
  previewClock,
  splitPending,
  type Speed,
} from "./clock.js";

const junk = (s: string) => /NaN|undefined|Infinity|\[object|null/.test(s);

describe("constants", () => {
  it("match the spec", () => {
    expect(MS_PER_GAME_MINUTE).toBe(40);
    expect(MAX_FRAME_MS).toBe(250);
    expect(COMMIT_INTERVAL_MS).toBe(100);
    expect([...SPEEDS]).toEqual([1, 2, 4, 10]);
    expect(Object.isFrozen(SPEEDS)).toBe(true);
  });
});

describe("accumulateMinutes", () => {
  function simulate(totalMs: number, frameMs: number, speed: Speed): number {
    let p = 0;
    for (let t = 0; t < totalMs; t += frameMs) p = accumulateMinutes(p, frameMs, speed, false);
    return p;
  }

  it("x1: one real second is 25 minutes; x10: 250 (frames of 50 ms)", () => {
    expect(simulate(1000, 50, 1)).toBeCloseTo(25, 9);
    expect(simulate(1000, 50, 10)).toBeCloseTo(250, 9);
    expect(simulate(1000, 50, 2)).toBeCloseTo(50, 9);
    expect(simulate(1000, 50, 4)).toBeCloseTo(100, 9);
  });

  it("a 10 s frame counts for 250 ms", () => {
    expect(accumulateMinutes(0, 10_000, 1, false)).toBeCloseTo(250 / 40, 9);
    expect(accumulateMinutes(0, 10_000, 10, false)).toBeCloseTo(62.5, 9);
    expect(accumulateMinutes(0, 250, 10, false)).toBe(accumulateMinutes(0, 1e12, 10, false));
  });

  it("paused: nothing accumulates, pending is unchanged", () => {
    expect(accumulateMinutes(3.5, 100, 10, true)).toBe(3.5);
    expect(accumulateMinutes(0, 1e6, 10, true)).toBe(0);
  });

  it.each([-100, -0, 0, NaN, Infinity, -Infinity, "5", null, undefined])(
    "bad dt %s counts for 0",
    (dt) => {
      expect(accumulateMinutes(2, dt as number, 4, false)).toBe(2);
    },
  );

  it.each([NaN, Infinity, -Infinity, -5, "x", null, undefined])(
    "bad pending %s counts for 0",
    (p) => {
      expect(accumulateMinutes(p as number, 40, 1, false)).toBe(1);
      expect(accumulateMinutes(p as number, 40, 1, true)).toBe(0);
    },
  );

  it.each([0, 3, -1, NaN, Infinity, "10", null, undefined])(
    "a forged speed %s never produces NaN and counts as x1",
    (s) => {
      const r = accumulateMinutes(0, 40, s as Speed, false);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBe(1);
    },
  );

  it("never negative, never NaN over random input", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let p = 0;
    for (let i = 0; i < 2000; i++) {
      const dt = [rnd() * 600 - 100, NaN, Infinity, 16.7][i % 4] as number;
      p = accumulateMinutes(p, dt, SPEEDS[i % 4] as Speed, i % 13 === 0);
      expect(Number.isFinite(p) && p >= 0).toBe(true);
      if (p > 50) p = splitPending(p).rest;
    }
  });
});

describe("splitPending", () => {
  it("splits whole and fraction", () => {
    const r = splitPending(3.25);
    expect(r.whole).toBe(3);
    expect(r.rest).toBeCloseTo(0.25, 12);
    expect(splitPending(0.99)).toEqual({ whole: 0, rest: 0.99 });
    expect(splitPending(5)).toEqual({ whole: 5, rest: 0 });
  });

  it("whole is at most MAX_ADVANCE_MINUTES (valid for the sim), the rest keeps the surplus", () => {
    const r = splitPending(5000.5);
    expect(r.whole).toBe(MAX_ADVANCE_MINUTES);
    expect(r.rest).toBeCloseTo(4280.5, 9);
    expect(Number.isInteger(r.whole)).toBe(true);
  });

  it.each([0, -1, -0.5, NaN, Infinity, -Infinity, "3", null, undefined])(
    "%s -> nothing to commit",
    (p) => {
      expect(splitPending(p as number)).toEqual({ whole: 0, rest: 0 });
    },
  );

  it("whole + rest always equals pending below the cap", () => {
    for (const p of [0.1, 1, 1.5, 84.9, 85, 719.999, 720]) {
      const { whole, rest } = splitPending(p);
      expect(whole + rest).toBeCloseTo(p, 9);
      expect(rest).toBeGreaterThanOrEqual(0);
      expect(rest).toBeLessThan(1);
    }
  });
});

describe("formatClock", () => {
  it("opens at 09:00 and ends at 20:59", () => {
    expect(formatClock(0, 0)).toBe("Jour 1 · 09:00");
    expect(formatClock(0, 719)).toBe("Jour 1 · 20:59");
    expect(formatClock(2, 305)).toBe("Jour 3 · 14:05");
    expect(formatClock(0, 60)).toBe("Jour 1 · 10:00");
    expect(formatClock(0, 59)).toBe("Jour 1 · 09:59");
  });

  it("every minute of the day is well-formed and monotonic", () => {
    let prev = "";
    for (let m = 0; m < 720; m++) {
      const s = formatClock(0, m);
      expect(s).toMatch(/^Jour 1 · (09|1\d|20):[0-5]\d$/);
      expect(s > prev).toBe(true);
      prev = s;
    }
  });

  it("fractional minutes floor", () => {
    expect(formatClock(0, 0.99)).toBe("Jour 1 · 09:00");
    expect(formatClock(0, 718.5)).toBe("Jour 1 · 20:58");
  });

  it.each([
    [NaN, 0],
    [0, NaN],
    [-1, 0],
    [0, -1],
    [0, 720],
    [0, 1e9],
    [0.5, 0],
    [Infinity, 0],
    [0, Infinity],
    [Number.MAX_SAFE_INTEGER, 0],
    ["1" as unknown as number, 0],
    [0, "5" as unknown as number],
    [null as unknown as number, 0],
    [undefined as unknown as number, undefined as unknown as number],
  ])("invalid (%s, %s) -> an em dash", (d, m) => {
    expect(formatClock(d, m)).toBe("—");
  });

  it("a huge valid day does not break the label", () => {
    expect(formatClock(Number.MAX_SAFE_INTEGER - 2, 0)).toBe(
      `Jour ${Number.MAX_SAFE_INTEGER - 1} · 09:00`,
    );
  });
});

describe("dayBannerText", () => {
  it("positive net has a plus sign", () => {
    expect(dayBannerText(1, { revenue: 100_00, costs: 65_00 })).toBe(
      `Jour 2 : l'agence ouvre ! Hier : +${formatCents(35_00)}`,
    );
  });

  it("matches the spec example 'Jour 2 : l'agence ouvre ! Hier : +35,00 €'", () => {
    expect(dayBannerText(1, { revenue: 100_00, costs: 65_00 }).replace(/\s/g, " ")).toBe(
      "Jour 2 : l'agence ouvre ! Hier : +35,00 €",
    );
  });

  it("negative net keeps its minus and has no plus; zero has no plus", () => {
    const neg = dayBannerText(4, { revenue: 0, costs: 50_00 });
    expect(neg).toContain("Jour 5");
    expect(neg).not.toContain("+");
    expect(neg).toContain(formatCents(-50_00));
    expect(dayBannerText(1, { revenue: 5, costs: 5 })).not.toContain("+");
  });

  it("null lastDay still gives a clean sentence", () => {
    const s = dayBannerText(1, null);
    expect(s).toBe("Jour 2 : l'agence ouvre !");
  });

  it.each([NaN, -1, Infinity, 1.5, "3" as unknown as number, undefined as unknown as number])(
    "bad day %s never leaks junk",
    (d) => {
      expect(junk(dayBannerText(d, { revenue: 1, costs: 2 }))).toBe(false);
    },
  );

  it("corrupted lastDay numbers never print NaN", () => {
    for (const bad of [NaN, Infinity, undefined as unknown as number]) {
      expect(junk(dayBannerText(1, { revenue: bad, costs: 1 }))).toBe(false);
    }
  });
});

describe("dayBannerDurationMs", () => {
  it("is a positive finite duration for every speed and shrinks with speed", () => {
    const d = SPEEDS.map((s) => dayBannerDurationMs(s));
    for (const x of d) expect(Number.isFinite(x) && x > 0).toBe(true);
    for (let i = 1; i < d.length; i++)
      expect(d[i] as number).toBeLessThanOrEqual(d[i - 1] as number);
  });

  it("is shorter than a whole day of play at every speed, so banners never stack (x10: < 2.9 s)", () => {
    for (const s of SPEEDS) {
      expect(dayBannerDurationMs(s)).toBeLessThanOrEqual((720 * MS_PER_GAME_MINUTE) / s + 1);
    }
  });

  it("forged speeds fall back to x1", () => {
    for (const bad of [0, 3, NaN, Infinity, -1, undefined, "10"]) {
      expect(dayBannerDurationMs(bad as Speed)).toBe(dayBannerDurationMs(1));
    }
  });
});

describe("previewClock", () => {
  const g = createGame(1, 100_000_00, [
    { dailyPrice: 60_00, dailyCost: 25_00 },
    { dailyPrice: 90_00, dailyCost: 40_00 },
  ]);

  it("no pending: the committed game, time of day = its minute", () => {
    const p = previewClock(g, 0);
    expect(p.game).toBe(g);
    expect(p.timeOfDay).toBe(0);
  });

  it("fraction only: same game, time of day = minute + fraction", () => {
    const p = previewClock(g, 0.5);
    expect(p.game).toBe(g);
    expect(p.timeOfDay).toBeCloseTo(0.5, 12);
  });

  it("whole minutes are applied through the sim, the fraction is added", () => {
    const p = previewClock(g, 3.25);
    expect(p.game.minute).toBe(3);
    expect(p.game.fleet[1]?.rented).toBe(true); // slot 2 is behind
    expect(p.game.cash).toBe(g.cash + 150_00);
    expect(p.timeOfDay).toBeCloseTo(3.25, 12);
  });

  it("does not mutate or advance the committed game", () => {
    const copy = JSON.stringify(g);
    previewClock(g, 400.5);
    expect(JSON.stringify(g)).toBe(copy);
  });

  it("across closing the preview shows the next morning", () => {
    const mid = previewClock(g, 720);
    expect(mid.game.day).toBe(1);
    expect(mid.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(mid.timeOfDay).toBeLessThan(720);
  });

  it("time of day stays below 720 even at minute 719 with a fraction", () => {
    const late = previewClock(previewClock(g, 719).game, 0.999);
    expect(late.timeOfDay).toBeLessThan(720);
  });

  it.each([NaN, Infinity, -Infinity, -5, "3", null, undefined])(
    "bad pending %s: committed game, finite time",
    (p) => {
      const r = previewClock(g, p as number);
      expect(r.game).toBe(g);
      expect(Number.isFinite(r.timeOfDay) && r.timeOfDay >= 0 && r.timeOfDay < 720).toBe(true);
    },
  );

  it("never throws on a corrupt game (minute out of range, overflow)", () => {
    const corrupt: GameState = { ...g, minute: 99_999 };
    const r = previewClock(corrupt, 10.5);
    expect(r.game).toBe(corrupt);
    expect(Number.isFinite(r.timeOfDay)).toBe(true);
    expect(r.timeOfDay).toBeLessThan(720);
    expect(r.timeOfDay).toBeGreaterThanOrEqual(0);

    const nan: GameState = { ...g, minute: NaN };
    const r2 = previewClock(nan, 3);
    expect(Number.isFinite(r2.timeOfDay)).toBe(true);

    const rich: GameState = { ...g, cash: Number.MAX_SAFE_INTEGER };
    const r3 = previewClock(rich, 5.5);
    expect(r3.game).toBe(rich);
    expect(Number.isFinite(r3.timeOfDay)).toBe(true);
  });

  it("a huge pending (one hidden-tab frame worth, 1e9) is handled", () => {
    const r = previewClock(g, 1e9);
    expect(Number.isFinite(r.timeOfDay)).toBe(true);
    expect(r.timeOfDay).toBeLessThan(720);
  });
});
