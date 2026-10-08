import { describe, expect, it } from "vitest";
import { CAR_ASSET, TRAFFIC_ASSET } from "./assets";
import { MIN_TRAFFIC_GAP } from "./cityPlan";
import {
  PORTRAIT,
  angDiff,
  at,
  cellOfPoint,
  deepFreeze,
  distToPolyline,
  layoutFor,
  planFor,
  rightOfAxis,
} from "./cityKit.test";
import { isStreetCell } from "./cityPlan";
import { LANE_OFFSET, computeLayout } from "./layout";
import { TIER_SETTINGS, type QualityTier } from "./quality";
import {
  AMBIENT_RATE,
  MAX_TRAFFIC,
  TRAFFIC_MIX,
  TRAFFIC_MODELS,
  advanceAmbient,
  ambientRate,
  trafficBudget,
  trafficPoseAt,
  trafficVehicles,
} from "./traffic";
import { WHEEL_RADIUS } from "./carMotion";

const plan = planFor(layoutFor(6, PORTRAIT));
const vehicles = trafficVehicles(plan);
const TIERS: QualityTier[] = ["high", "medium", "low"];
const SPEEDS = [1, 2, 4, 10] as const;

describe("ambient time", () => {
  it("rates: 1, 1.5, 2, 3 and 0 when paused", () => {
    expect(AMBIENT_RATE).toEqual({ 1: 1, 2: 1.5, 4: 2, 10: 3 });
    for (const s of SPEEDS) {
      expect(ambientRate(s, false)).toBe(AMBIENT_RATE[s]);
      expect(ambientRate(s, true)).toBe(0);
    }
  });

  it.each([0, 3, -1, 1.5, 100, NaN, Infinity, "10", "x", null, undefined, {}, [10], true])(
    "unknown speed %j counts as x1 (0 when paused)",
    (speed) => {
      expect(ambientRate(speed, false)).toBe(1);
      expect(ambientRate(speed, true)).toBe(0);
    },
  );

  it("freezes on pause for any speed and any dt", () => {
    for (const s of [...SPEEDS, 7, NaN]) {
      for (const dt of [0, 16, 250, 5000, -3, NaN, Infinity]) {
        expect(advanceAmbient(12.5, dt, s, true)).toBe(12.5);
      }
    }
  });

  it("scales with speed: x10 is exactly 3 times x1 over the same frames, with no jump", () => {
    let a = 0;
    let b = 0;
    let c = 0;
    let prev = 0;
    for (let i = 0; i < 600; i++) {
      a = advanceAmbient(a, 16.7, 1, false);
      b = advanceAmbient(b, 16.7, 10, false);
      c = advanceAmbient(c, 16.7, 4, false);
      expect(b - prev).toBeLessThan(0.06);
      prev = b;
    }
    expect(b / a).toBeCloseTo(3, 9);
    expect(c / a).toBeCloseTo(2, 9);
  });

  it("bounds dt to 250 ms: a tab left in the background does not teleport the traffic", () => {
    expect(advanceAmbient(0, 250, 1, false)).toBeCloseTo(0.25, 12);
    for (const dt of [251, 1000, 3_600_000, Infinity]) {
      expect(advanceAmbient(0, dt, 1, false)).toBeLessThanOrEqual(0.25 + 1e-12);
    }
    expect(advanceAmbient(0, 1e9, 10, false)).toBeCloseTo(0.75, 12);
  });

  it("never goes backwards and never yields NaN, whatever the inputs", () => {
    for (const dt of [-5, -Infinity, NaN, 0]) {
      expect(advanceAmbient(4, dt, 1, false)).toBeGreaterThanOrEqual(4);
      expect(Number.isFinite(advanceAmbient(4, dt, 1, false))).toBe(true);
    }
    for (const prev of [NaN, Infinity, -Infinity]) {
      for (const paused of [true, false]) {
        const v = advanceAmbient(prev, 16, 1, paused);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("vehicle list", () => {
  it("is fixed, ordered and at most MAX_TRAFFIC long", () => {
    expect(MAX_TRAFFIC).toBe(24);
    expect(vehicles.length).toBeGreaterThanOrEqual(20);
    expect(vehicles.length).toBeLessThanOrEqual(MAX_TRAFFIC);
    expect(trafficVehicles(plan)).toEqual(vehicles);
    expect(new Set(vehicles.map((v) => v.id)).size).toBe(vehicles.length);
    vehicles.forEach((v, i) => {
      if (i > 0) expect(v.id).toBeGreaterThan(at(vehicles, i - 1).id);
    });
  });

  it("the mix is the spec's: taxi x4, suv x3, van x2, delivery x2, one truck, police, ambulance, garbage truck", () => {
    const count = (m: string) => TRAFFIC_MIX.filter((x) => x === m).length;
    expect([
      count("taxi"),
      count("suv"),
      count("van"),
      count("delivery"),
      count("truck"),
      count("police"),
      count("ambulance"),
      count("garbage-truck"),
    ]).toEqual([4, 3, 2, 2, 1, 1, 1, 1]);
    expect(TRAFFIC_MIX).toHaveLength(15);
    expect([...TRAFFIC_MODELS].sort()).toEqual(Object.keys(TRAFFIC_ASSET).sort());
    for (const v of vehicles) expect(v.model).toBe(TRAFFIC_MIX[v.id % TRAFFIC_MIX.length]);
  });

  it("vehicle k rides loop k mod n at lap x length / capacity + phase", () => {
    const n = plan.loops.length;
    for (const v of vehicles) {
      expect(v.loop).toBe(v.id % n);
      const lp = at(plan.loops, v.loop);
      const expected = Math.floor(v.id / n) * (lp.length / lp.capacity) + lp.phase;
      const diff = (((v.offset - expected) % lp.length) + lp.length) % lp.length;
      expect(Math.min(diff, lp.length - diff)).toBeLessThan(1e-6);
    }
  });

  it("no background vehicle ever uses a player car asset", () => {
    const player = new Set(Object.values(CAR_ASSET).map((r) => r.name));
    for (const v of vehicles) expect(player.has(TRAFFIC_ASSET[v.model].name)).toBe(false);
  });

  it("any prefix keeps the gaps: the vehicles removed last never bring two closer", () => {
    for (let keep = 1; keep <= vehicles.length; keep++) {
      const prefix = vehicles.slice(0, keep);
      expect(prefix.every((v, i) => v === vehicles[i])).toBe(true);
      for (let a = 0; a < prefix.length; a++) {
        for (let b = a + 1; b < prefix.length; b++) {
          const A = at(prefix, a);
          const B = at(prefix, b);
          if (A.loop !== B.loop) continue;
          const len = at(plan.loops, A.loop).length;
          const d = (((A.offset - B.offset) % len) + len) % len;
          expect(Math.min(d, len - d)).toBeGreaterThanOrEqual(MIN_TRAFFIC_GAP - 1e-9);
        }
      }
    }
  });

  it("works with frozen input and is empty for a plan without loops", () => {
    const frozen = deepFreeze(structuredClone(plan));
    expect(() => trafficVehicles(frozen)).not.toThrow();
    expect(trafficVehicles({ ...plan, loops: [] })).toEqual([]);
    expect(() => trafficPoseAt(frozen, at(vehicles, 0), 12)).not.toThrow();
  });
});

describe("poses", () => {
  const times = [0, 0.1, 1, 7.3, 33, 120, 3600, 86_400, 1e6, 1e7];

  it("are a pure function of the ambient time (order and repetition do not matter)", () => {
    const forward = vehicles.map((v) => times.map((t) => trafficPoseAt(plan, v, t)));
    const backward = [...vehicles]
      .reverse()
      .map((v) => [...times].reverse().map((t) => trafficPoseAt(plan, v, t)));
    backward
      .reverse()
      .forEach((row, i) => row.reverse().forEach((p, j) => expect(p).toEqual(forward[i]?.[j])));
  });

  it("are finite, on the loop path and in a street cell, also after hours of play", () => {
    for (const v of vehicles) {
      const lp = at(plan.loops, v.loop);
      for (const t of times) {
        const p = trafficPoseAt(plan, v, t);
        expect([p.x, p.z, p.heading, p.distance].every(Number.isFinite)).toBe(true);
        expect(distToPolyline(p, lp.path, true), `vehicle ${v.id} t=${t}`).toBeLessThan(1e-3);
        const { col, row } = cellOfPoint(p);
        expect(isStreetCell(plan, col, row)).toBe(true);
      }
    }
  });

  it("drive on the right: on straights the lane offset is 1.5 m to the right of the heading", () => {
    let checked = 0;
    for (const v of vehicles) {
      for (let t = 0; t < 200; t += 0.37) {
        const p = trafficPoseAt(plan, v, t);
        const dx = Math.sin(p.heading);
        const dz = Math.cos(p.heading);
        if (Math.abs(dx) > 1e-6 && Math.abs(dz) > 1e-6) continue; // inside a corner
        const off = rightOfAxis(plan, p, Math.round(dx), Math.round(dz));
        if (off === null) continue;
        expect(off).toBeCloseTo(LANE_OFFSET, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("move smoothly: bounded steps, continuous heading, also across the lap wrap", () => {
    const dt = 0.05;
    for (const v of vehicles) {
      const lp = at(plan.loops, v.loop);
      let prev = trafficPoseAt(plan, v, 0);
      for (let t = dt; t < lp.length / lp.speed + 2; t += dt) {
        const p = trafficPoseAt(plan, v, t);
        expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThanOrEqual(lp.speed * dt + 1e-6);
        expect(Math.abs(angDiff(prev.heading, p.heading))).toBeLessThan(0.45);
        prev = p;
      }
    }
  });

  it("wheels turn in proportion to the distance driven", () => {
    for (const v of vehicles.slice(0, 6)) {
      const lp = at(plan.loops, v.loop);
      const d0 = trafficPoseAt(plan, v, 0).distance;
      expect(d0).toBe(0);
      for (const [a, b] of [
        [0, 10],
        [10, 11],
        [100, 130],
      ] as const) {
        const da = trafficPoseAt(plan, v, a).distance;
        const db = trafficPoseAt(plan, v, b).distance;
        expect(db - da).toBeCloseTo(lp.speed * (b - a), 9);
        expect((db - da) / WHEEL_RADIUS).toBeCloseTo((lp.speed * (b - a)) / WHEEL_RADIUS, 9);
      }
    }
  });

  it("freeze when the ambient time does not advance (pause)", () => {
    let t = 5;
    for (let i = 0; i < 100; i++) t = advanceAmbient(t, 16, 10, true);
    expect(t).toBe(5);
    for (const v of vehicles) expect(trafficPoseAt(plan, v, t)).toEqual(trafficPoseAt(plan, v, 5));
  });
});

describe("collisions", () => {
  it("vehicles on the same loop are never closer than MIN_TRAFFIC_GAP along the road, nor 8 m apart", () => {
    const byLoop = new Map<number, typeof vehicles>();
    for (const v of vehicles) byLoop.set(v.loop, [...(byLoop.get(v.loop) ?? []), v]);
    let pairs = 0;
    for (const [loop, list] of byLoop) {
      if (list.length < 2) continue;
      const lp = at(plan.loops, loop);
      for (let t = 0; t < (2 * lp.length) / lp.speed; t += 0.5) {
        for (let a = 0; a < list.length; a++) {
          for (let b = a + 1; b < list.length; b++) {
            const A = trafficPoseAt(plan, at(list, a), t);
            const B = trafficPoseAt(plan, at(list, b), t);
            expect(Math.hypot(A.x - B.x, A.z - B.z), `loop ${loop} t=${t}`).toBeGreaterThanOrEqual(
              8,
            );
            pairs++;
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it("vehicles of different loops never share a lane position (at least a car width apart)", () => {
    const period = 600;
    let worst = Infinity;
    for (let t = 0; t < period; t += 0.5) {
      const poses = vehicles.map((v) => trafficPoseAt(plan, v, t));
      for (let a = 0; a < poses.length; a++) {
        for (let b = a + 1; b < poses.length; b++) {
          const A = at(poses, a);
          const B = at(poses, b);
          worst = Math.min(worst, Math.hypot(A.x - B.x, A.z - B.z));
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(2.5);
  });
});

describe("trafficBudget", () => {
  it.each(TIERS)("%s: max - floor(driving / 2), never below the tier minimum", (tier) => {
    const s = TIER_SETTINGS[tier];
    for (let d = 0; d <= 50; d++) {
      expect(trafficBudget(tier, d)).toBe(Math.max(s.trafficMin, s.trafficMax - Math.floor(d / 2)));
    }
  });

  it.each(TIERS)("%s: never grows as more of our cars drive, stays within [min, max]", (tier) => {
    const s = TIER_SETTINGS[tier];
    let prev = Infinity;
    for (let d = 0; d <= 60; d++) {
      const b = trafficBudget(tier, d);
      expect(b).toBeLessThanOrEqual(prev);
      expect(b).toBeGreaterThanOrEqual(s.trafficMin);
      expect(b).toBeLessThanOrEqual(s.trafficMax);
      prev = b;
    }
  });

  it.each(TIERS)("%s: hostile driving counts stay inside [min, max] and finite", (tier) => {
    const s = TIER_SETTINGS[tier];
    for (const d of [-1, -50, -1e9, NaN, Infinity, -Infinity, 1e9, 2.5, 0.5]) {
      const b = trafficBudget(tier, d);
      expect(Number.isInteger(b), `${d}`).toBe(true);
      expect(b).toBeGreaterThanOrEqual(s.trafficMin);
      expect(b).toBeLessThanOrEqual(s.trafficMax);
    }
  });

  it("the high-tier budget never exceeds the vehicles that exist", () => {
    expect(trafficBudget("high", 0)).toBeLessThanOrEqual(MAX_TRAFFIC);
    const other = trafficVehicles(planFor(computeLayout(50, PORTRAIT)));
    expect(other.length).toBeGreaterThanOrEqual(trafficBudget("high", 0) - 4);
  });
});
