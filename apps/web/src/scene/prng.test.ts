import { describe, expect, it } from "vitest";
import { CITY_SEED, cellHash } from "./prng";

describe("cellHash", () => {
  it("has the spec seed", () => {
    expect(CITY_SEED).toBe(0x5eedc17);
  });

  it("is stable, stateless and always in [0, 1)", () => {
    const forward: number[] = [];
    for (let c = -30; c <= 30; c++) {
      for (let r = -30; r <= 30; r++) forward.push(cellHash(c, r, 7));
    }
    const backward: number[] = [];
    for (let c = 30; c >= -30; c--) {
      for (let r = 30; r >= -30; r--) backward.unshift(cellHash(c, r, 7));
    }
    expect(backward).toEqual(forward);
    for (const v of forward) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is roughly uniform and uncorrelated between neighbours", () => {
    const buckets = new Array<number>(10).fill(0);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let c = 0; c < 100; c++) {
      for (let r = 0; r < 100; r++) {
        const v = cellHash(c, r, 1);
        const b = Math.min(9, Math.floor(v * 10));
        buckets[b] = (buckets[b] ?? 0) + 1;
        xs.push(v);
        ys.push(cellHash(c + 1, r, 1));
      }
    }
    for (const b of buckets) {
      expect(b).toBeGreaterThan(800);
      expect(b).toBeLessThan(1200);
    }
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs);
    const my = mean(ys);
    let cov = 0;
    let vx = 0;
    let vy = 0;
    xs.forEach((x, i) => {
      const y = ys[i] ?? 0;
      cov += (x - mx) * (y - my);
      vx += (x - mx) ** 2;
      vy += (y - my) ** 2;
    });
    expect(Math.abs(cov / Math.sqrt(vx * vy))).toBeLessThan(0.05);
  });

  it("salt, axis order and sign all change the value", () => {
    let saltSame = 0;
    let swapSame = 0;
    let signSame = 0;
    for (let c = 1; c <= 60; c++) {
      for (let r = 1; r <= 60; r++) {
        if (cellHash(c, r, 0) === cellHash(c, r, 1)) saltSame++;
        if (cellHash(c, r, 0) === cellHash(r, c, 0) && c !== r) swapSame++;
        if (cellHash(c, r, 0) === cellHash(-c, r, 0)) signSame++;
      }
    }
    expect(saltSame).toBe(0);
    expect(swapSame).toBe(0);
    expect(signSame).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, 1e300, -1e300, 2 ** 53, 0.5, -0.5, Number.MIN_VALUE])(
    "hostile argument %s still gives a value in [0, 1)",
    (bad) => {
      for (const v of [cellHash(bad, 0, 0), cellHash(0, bad, 0), cellHash(0, 0, bad)]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    },
  );
});
