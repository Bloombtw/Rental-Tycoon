import { describe, expect, it } from "vitest";
import { MAX_FLEET_SIZE, departureMinute, returnMinute } from "@rt/sim";
import { fitCamera, planeToScreen, type Camera, type ScreenRect } from "./camera.js";
import {
  CAR_BOX,
  DRIVE_MINUTES,
  MIN_TOUCH_PX,
  PARKED_HEADING,
  RAMP,
  TURN_BLEND,
  WHEEL_RADIUS,
  carIndexAt,
  carPhaseAt,
  carPoseAt,
  cruiseEaseOut,
  easeInCruise,
  easeInOutQuad,
  type CarPose,
} from "./carMotion.js";
import { computeLayout, type GroundPoint } from "./layout.js";
import { toViewPlane } from "./iso.js";
import { deepFreeze, planFor } from "./cityKit.test";
import { carRoutes, type CarRoutes } from "./routes.js";

const VIEW: ScreenRect = { x: 0, y: 130, width: 390, height: 650 };
const layout = computeLayout(50, VIEW);
const plan = planFor(layout);
const routes = carRoutes(layout, plan);
const dep = (i: number) => departureMinute(i) as number;
const ret = (i: number) => returnMinute(i) as number;
const pose = (i: number, t: number, rented: unknown = true, reduced = false) =>
  carPoseAt(layout, routes, i, rented, t, reduced);

function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}
const spot = (i: number) => at(layout.spots, i);
const angDiff = (from: number, to: number) => {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};
const length = (path: readonly GroundPoint[]) => {
  let sum = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    sum += Math.hypot(at(path, k + 1).x - at(path, k).x, at(path, k + 1).z - at(path, k).z);
  }
  return sum;
};
const poseNumbers = (p: CarPose) => [p.x, p.z, p.heading, p.wheelRotation, p.alpha];

describe("constants", () => {
  it("match the spec", () => {
    expect([DRIVE_MINUTES, RAMP, MIN_TOUCH_PX, TURN_BLEND, WHEEL_RADIUS]).toEqual([
      60, 0.25, 44, 1.5, 0.42,
    ]);
    expect(PARKED_HEADING).toBe(Math.PI);
    expect(CAR_BOX).toEqual({ width: 2.1, length: 3.6, height: 1.6 });
  });

  it("easeInOutQuad is still 0 to 1 and monotone", () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 12);
  });

  it("every car is back before 21:00 and the trips never overlap (ret - 60 >= dep + 60)", () => {
    for (let i = 0; i < MAX_FLEET_SIZE; i++) {
      expect(ret(i), `car ${i}`).toBeLessThan(720);
      expect(ret(i) - DRIVE_MINUTES, `car ${i}`).toBeGreaterThanOrEqual(dep(i) + DRIVE_MINUTES);
    }
  });
});

describe("easeInCruise / cruiseEaseOut", () => {
  it("0 to 1, continuous at the ramp, monotone, soft start then constant speed", () => {
    expect(easeInCruise(0)).toBe(0);
    expect(easeInCruise(1)).toBeCloseTo(1, 12);
    expect(easeInCruise(RAMP)).toBeCloseTo(RAMP / (2 - RAMP), 12);
    expect(easeInCruise(0.1)).toBeCloseTo(0.01 / (RAMP * (2 - RAMP)), 12);
    expect(easeInCruise(0.6)).toBeCloseTo((1.2 - RAMP) / (2 - RAMP), 12);
    let prev = 0;
    for (let p = 0; p <= 1; p += 0.001) {
      const v = easeInCruise(p);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
    const slope = (a: number, b: number) => (easeInCruise(b) - easeInCruise(a)) / (b - a);
    expect(slope(0.4, 0.5)).toBeCloseTo(slope(0.8, 0.9), 9);
    expect(slope(0, 0.01)).toBeLessThan(slope(0.5, 0.6) * 0.1);
  });

  it("the return mirrors it: 1 - easeInCruise(1 - p), constant speed then braking", () => {
    for (let p = 0; p <= 1; p += 0.01) {
      expect(cruiseEaseOut(p)).toBeCloseTo(1 - easeInCruise(1 - p), 12);
    }
    const slope = (a: number, b: number) => (cruiseEaseOut(b) - cruiseEaseOut(a)) / (b - a);
    expect(slope(0.99, 1)).toBeLessThan(slope(0.4, 0.5) * 0.1);
  });

  it.each([-5, 7, NaN, Infinity, -Infinity])("input %s stays in [0, 1] and finite", (p) => {
    for (const f of [easeInCruise, cruiseEaseOut]) {
      expect(Number.isFinite(f(p))).toBe(true);
      expect(f(p)).toBeGreaterThanOrEqual(0);
      expect(f(p)).toBeLessThanOrEqual(1);
    }
  });
});

describe("carPhaseAt", () => {
  it("follows the schedule with exact boundaries (car 3), 60 minute trips", () => {
    const i = 3;
    const d = dep(i);
    const r = ret(i);
    expect(carPhaseAt(i, true, d - 0.001, false)).toBe("parked");
    expect(carPhaseAt(i, true, d, false)).toBe("departing");
    expect(carPhaseAt(i, true, d + DRIVE_MINUTES - 0.001, false)).toBe("departing");
    expect(carPhaseAt(i, true, d + DRIVE_MINUTES, false)).toBe("away");
    expect(carPhaseAt(i, true, r - DRIVE_MINUTES - 0.001, false)).toBe("away");
    expect(carPhaseAt(i, true, r - DRIVE_MINUTES, false)).toBe("returning");
    expect(carPhaseAt(i, true, r - 0.001, false)).toBe("returning");
    expect(carPhaseAt(i, true, r, false)).toBe("parked");
    expect(carPhaseAt(i, true, 719.99, false)).toBe("parked");
  });

  it("a car not rented never moves", () => {
    for (const rented of [false, undefined, null, 0, 1, "true", {}, [], NaN]) {
      for (let t = 0; t < 720; t += 7.3) expect(carPhaseAt(5, rented, t, false)).toBe("parked");
    }
  });

  it("reduced motion: never departing or returning; away between dep and ret", () => {
    for (let i = 0; i < MAX_FLEET_SIZE; i++) {
      for (let t = 0; t < 720; t += 3.1) {
        expect(carPhaseAt(i, true, t, true)).toBe(t >= dep(i) && t < ret(i) ? "away" : "parked");
      }
    }
  });

  it.each([-1, 50, 51, 1.5, NaN, Infinity, 2 ** 53, "1", null, undefined])(
    "index %s is parked (never rented)",
    (i) => {
      expect(carPhaseAt(i as number, true, 300, false)).toBe("parked");
    },
  );

  it.each([NaN, Infinity, -Infinity, "300", null, undefined])("time %s is parked", (t) => {
    expect(carPhaseAt(2, true, t as number, false)).toBe("parked");
  });

  it("phases only go parked > departing > away > returning > parked for every car", () => {
    for (let i = 0; i < MAX_FLEET_SIZE; i++) {
      const seen: string[] = [];
      for (let t = 0; t < 720; t += 0.5) {
        const p = carPhaseAt(i, true, t, false);
        if (seen[seen.length - 1] !== p) seen.push(p);
      }
      const order = ["parked", "departing", "away", "returning", "parked"];
      expect(seen.join(">"), `car ${i}`).toBe(
        dep(i) === 0 ? order.slice(1).join(">") : order.join(">"),
      );
    }
  });
});

describe("carPoseAt: parked, away and invisible cars", () => {
  it("parked: on its spot, nose to the building, wheels still, opaque", () => {
    expect(pose(7, dep(7) - 1)).toMatchObject({
      x: spot(7).x,
      z: spot(7).z,
      heading: PARKED_HEADING,
      wheelRotation: 0,
      alpha: 1,
      phase: "parked",
    });
    expect(pose(7, 300, false)).toMatchObject({ phase: "parked", alpha: 1 });
    expect(pose(7, ret(7))).toMatchObject({
      x: spot(7).x,
      z: spot(7).z,
      wheelRotation: 0,
      alpha: 1,
    });
  });

  it("away: invisible (opacity 0), wheels still", () => {
    expect(pose(30, 300)).toMatchObject({ alpha: 0, phase: "away", wheelRotation: 0 });
  });

  it.each([-1, 50, 51, 3.5, NaN, Infinity, 2 ** 53, "2", null, undefined])(
    "index %s without a spot is a frozen invisible pose",
    (i) => {
      const p = carPoseAt(layout, routes, i as number, true, 100, false);
      expect(p.alpha).toBe(0);
      expect(p.wheelRotation).toBe(0);
      expect(poseNumbers(p).every(Number.isFinite)).toBe(true);
    },
  );

  it("a missing route never crashes: the car just stays parked", () => {
    const empty: CarRoutes = { departure: [], arrival: [] };
    for (const t of [dep(3) + 10, ret(3) - 10]) {
      const p = carPoseAt(layout, empty, 3, true, t, false);
      expect(poseNumbers(p).every(Number.isFinite)).toBe(true);
    }
    const small = computeLayout(3, VIEW);
    expect(carPoseAt(small, routes, 3, true, 100, false).alpha).toBe(0);
    expect(carPoseAt(computeLayout(0, VIEW), routes, 0, true, 100, false).alpha).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, "5", null, undefined])(
    "hostile time %s keeps the car parked",
    (t) => {
      expect(pose(3, t as number)).toMatchObject({ phase: "parked", alpha: 1, wheelRotation: 0 });
    },
  );

  it.each([false, undefined, null, 0, 1, "true", {}, [], NaN])(
    "rented = %j never moves the car",
    (rented) => {
      for (let t = 0; t < 720; t += 11) {
        expect(carPoseAt(layout, routes, 4, rented, t, false)).toMatchObject({
          phase: "parked",
          alpha: 1,
        });
      }
    },
  );

  it("opacity is only ever 0 or 1 and everything is finite, all day, all cars, all sizes", () => {
    for (const n of [0, 1, 3, 11, 25, 50, 51]) {
      const l = computeLayout(n, VIEW);
      const r = carRoutes(l, planFor(l));
      for (let i = -1; i <= 52; i++) {
        for (let t = -5; t < 725; t += 6.7) {
          for (const reduced of [false, true]) {
            const p = carPoseAt(l, r, i, true, t, reduced);
            expect(poseNumbers(p).every(Number.isFinite)).toBe(true);
            expect([0, 1], `n=${n} car ${i} t=${t}`).toContain(p.alpha);
          }
        }
      }
    }
  });

  it("works on frozen layout and routes", () => {
    const l = deepFreeze(structuredClone(layout));
    const r = deepFreeze(structuredClone(routes));
    expect(() => carPoseAt(l, r, 5, true, dep(5) + 20, false)).not.toThrow();
  });
});

describe("carPoseAt: departure", () => {
  const i = 12;

  it("starts on the spot nose to the building, soft start, ends at the route end", () => {
    const start = pose(i, dep(i));
    expect(start).toMatchObject({
      x: spot(i).x,
      z: spot(i).z,
      alpha: 1,
      phase: "departing",
      wheelRotation: 0,
    });
    expect(Math.abs(angDiff(start.heading, Math.PI))).toBeLessThan(1e-9);
    const route = at(routes.departure, i);
    const end = pose(i, dep(i) + DRIVE_MINUTES - 1e-6);
    expect(end.x).toBeCloseTo(at(route, route.length - 1).x, 1);
    expect(end.z).toBeCloseTo(at(route, route.length - 1).z, 1);
    expect(end.alpha).toBe(1);
  });

  it("the start is gentle: a fraction of the cruise distance in the first minutes", () => {
    const total = length(at(routes.departure, i));
    const cruisePerMinute = total / DRIVE_MINUTES;
    const p = pose(i, dep(i) + 0.6);
    const moved = Math.hypot(p.x - spot(i).x, p.z - spot(i).z);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.2 * cruisePerMinute * 0.6);
  });

  it("backs out first: south with the nose north, wheels turning backwards", () => {
    const p = pose(i, dep(i) + 3);
    expect(p.z).toBeGreaterThan(spot(i).z);
    expect(p.x).toBeCloseTo(spot(i).x, 9);
    expect(Math.abs(angDiff(p.heading, Math.PI))).toBeLessThan(1e-9);
    expect(p.wheelRotation).toBeLessThan(0);
  });
});

describe("carPoseAt: return", () => {
  const i = 30;

  it("starts at the route start, brakes into the spot, nose to the building", () => {
    const route = at(routes.arrival, i);
    const first = pose(i, ret(i) - DRIVE_MINUTES);
    expect(first.x).toBeCloseTo(at(route, 0).x, 6);
    expect(first.z).toBeCloseTo(at(route, 0).z, 6);
    expect(first.alpha).toBe(1);
    expect(first.wheelRotation).toBe(0);
    const end = pose(i, ret(i) - 1e-6);
    expect(end.x).toBeCloseTo(spot(i).x, 3);
    expect(end.z).toBeCloseTo(spot(i).z, 3);
    expect(Math.abs(angDiff(end.heading, Math.PI))).toBeLessThan(0.01);
  });

  it("brakes before the spot: very little distance left in the last minutes", () => {
    const total = length(at(routes.arrival, i));
    const cruisePerMinute = total / DRIVE_MINUTES;
    const p = pose(i, ret(i) - 0.6);
    const left = Math.hypot(p.x - spot(i).x, p.z - spot(i).z);
    expect(left).toBeLessThan(0.2 * cruisePerMinute * 0.6);
  });

  it("wheels only turn forward and roll the whole route", () => {
    let prev = 0;
    for (let t = ret(i) - DRIVE_MINUTES; t < ret(i); t += 0.05) {
      const w = pose(i, t).wheelRotation;
      expect(w).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = w;
    }
    expect(pose(i, ret(i) - 1e-7).wheelRotation * WHEEL_RADIUS).toBeCloseTo(
      length(at(routes.arrival, i)),
      2,
    );
  });
});

describe("carPoseAt: no teleport, continuous heading, proportional wheels", () => {
  const dt = 0.05;
  it.each([0, 1, 2, 9, 24, 49])("car %i: steps are bounded over departure and return", (i) => {
    for (const [path, start, profileMax] of [
      [at(routes.departure, i), dep(i), 2 / (2 - RAMP)],
      [at(routes.arrival, i), ret(i) - DRIVE_MINUTES, 2 / (2 - RAMP)],
    ] as const) {
      const L = length(path);
      const maxStep = ((profileMax * 1.02 * L) / DRIVE_MINUTES) * dt + 1e-6;
      const maxWheel = maxStep / WHEEL_RADIUS;
      let prev = pose(i, start);
      let rolled = 0;
      let backwards = 0;
      for (let t = start + dt; t < start + DRIVE_MINUTES; t += dt) {
        const p = pose(i, t);
        const move = Math.hypot(p.x - prev.x, p.z - prev.z);
        expect(move, `jump at t=${t}`).toBeLessThanOrEqual(maxStep);
        expect(Math.abs(angDiff(prev.heading, p.heading)), `turn at t=${t}`).toBeLessThan(0.45);
        const dw = p.wheelRotation - prev.wheelRotation;
        expect(Math.abs(dw), `wheel jump at t=${t}`).toBeLessThanOrEqual(maxWheel);
        rolled += Math.abs(dw) * WHEEL_RADIUS;
        if (move > 1e-4) {
          const along =
            ((p.x - prev.x) * Math.sin(p.heading) + (p.z - prev.z) * Math.cos(p.heading)) / move;
          if (along > 0.8) expect(dw).toBeGreaterThanOrEqual(0);
          if (along < -0.8) {
            expect(dw).toBeLessThanOrEqual(0);
            backwards += move;
          }
        }
        expect(poseNumbers(p).every(Number.isFinite)).toBe(true);
        expect([0, 1]).toContain(p.alpha);
        prev = p;
      }
      expect(rolled).toBeGreaterThan(L * 0.97);
      expect(rolled).toBeLessThanOrEqual(L * 1.001);
      if (start === dep(i)) {
        const first = Math.hypot(at(path, 1).x - at(path, 0).x, at(path, 1).z - at(path, 0).z);
        expect(backwards).toBeGreaterThan(first * 0.8);
        expect(backwards).toBeLessThanOrEqual(first + 0.5);
      } else expect(backwards).toBe(0);
    }
  });

  it("the departure ends with (route length - 2 x reverse leg) / radius of wheel rotation", () => {
    for (const i of [0, 17, 49]) {
      const out = at(routes.departure, i);
      const first = Math.hypot(at(out, 1).x - at(out, 0).x, at(out, 1).z - at(out, 0).z);
      const end = pose(i, dep(i) + DRIVE_MINUTES - 1e-7);
      expect(end.wheelRotation * WHEEL_RADIUS).toBeCloseTo(length(out) - 2 * first, 2);
    }
  });

  it("position is continuous across the phase boundaries while visible", () => {
    for (const i of [0, 9, 49]) {
      for (const edge of [dep(i), ret(i)]) {
        const a = pose(i, edge - 1e-6);
        const b = pose(i, edge + 1e-6);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.1);
      }
    }
  });
});

describe("carPoseAt: reduced motion", () => {
  it("hidden from dep to ret, parked and visible otherwise, wheels never turn", () => {
    for (const i of [0, 4, 49]) {
      expect(pose(i, dep(i) + 5, true, true)).toMatchObject({ alpha: 0 });
      expect(pose(i, ret(i), true, true)).toMatchObject({ alpha: 1, x: spot(i).x, z: spot(i).z });
      for (let t = -2; t < 722; t += 0.7) {
        const p = pose(i, t, true, true);
        expect(p.phase === "departing" || p.phase === "returning").toBe(false);
        expect(p.wheelRotation).toBe(0);
        if (p.alpha > 0) expect(p).toMatchObject({ x: spot(i).x, z: spot(i).z });
      }
    }
  });

  it("switching reduced motion on mid-trip leaves no ghost on the road", () => {
    const i = 8;
    expect(pose(i, dep(i) + 10).alpha).toBe(1);
    expect(pose(i, dep(i) + 10, true, true).alpha).toBe(0);
    expect(pose(i, ret(i) - 10, true, true).alpha).toBe(0);
  });
});

describe("carIndexAt", () => {
  const cam: Camera = fitCamera(layout.bounds, VIEW);
  const mkPose = (x: number, z: number, extra: Partial<CarPose> = {}): CarPose => ({
    x,
    z,
    heading: Math.PI,
    wheelRotation: 0,
    alpha: 1,
    phase: "parked",
    ...extra,
  });
  const screenOf = (c: Camera, p: { x: number; z: number }) =>
    planeToScreen(c, VIEW, toViewPlane({ x: p.x, y: 0, z: p.z }));
  const parked = layout.spots.map((s) => mkPose(s.x, s.z));
  const centredOn = (p: CarPose, zoom: number): Camera => {
    const v = toViewPlane({ x: p.x, y: 0, z: p.z });
    return { zoom, centerX: v.x, centerY: v.y };
  };

  it("touching the projected centre selects every car, at the overview and at max zoom", () => {
    for (let i = 0; i < parked.length; i++) {
      expect(carIndexAt(cam, VIEW, parked, screenOf(cam, at(parked, i)))).toBe(i);
      const near = centredOn(at(parked, i), 40);
      expect(carIndexAt(near, VIEW, parked, screenOf(near, at(parked, i)))).toBe(i);
    }
  });

  it("an empty area hits nothing", () => {
    expect(carIndexAt(cam, VIEW, parked, { x: 2, y: VIEW.y + 2 })).toBeNull();
    expect(carIndexAt(cam, VIEW, [], { x: 100, y: 300 })).toBeNull();
  });

  it("the touch box is at least 44 x 44 px even when the car is tiny on screen", () => {
    const tiny: Camera = { zoom: 0.3, centerX: 0, centerY: 0 };
    const one = [mkPose(10, 20)];
    const c = screenOf(tiny, at(one, 0));
    expect(carIndexAt(tiny, VIEW, one, { x: c.x + 20, y: c.y + 20 })).toBe(0);
    expect(carIndexAt(tiny, VIEW, one, { x: c.x - 20, y: c.y - 20 })).toBe(0);
    expect(carIndexAt(tiny, VIEW, one, { x: c.x + 24, y: c.y })).toBeNull();
    expect(carIndexAt(tiny, VIEW, one, { x: c.x, y: c.y - 24 })).toBeNull();
  });

  it("the closest centre wins; ties go to the larger index", () => {
    const c: Camera = { zoom: 10, centerX: 0, centerY: 0 };
    const a = mkPose(0, 0);
    const b = mkPose(1, 0);
    const sa = screenOf(c, a);
    const sb = screenOf(c, b);
    expect(carIndexAt(c, VIEW, [a, b], { x: sa.x - 2, y: sa.y })).toBe(0);
    expect(carIndexAt(c, VIEW, [a, b], { x: sb.x + 2, y: sb.y })).toBe(1);
    expect(carIndexAt(c, VIEW, [a, b], { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 })).toBe(1);
    expect(carIndexAt(c, VIEW, [a, a, a], sa)).toBe(2);
  });

  it("an absent or nearly transparent car is not touchable", () => {
    const c: Camera = { zoom: 10, centerX: 0, centerY: 0 };
    const base = mkPose(0, 0);
    const s = screenOf(c, base);
    expect(carIndexAt(c, VIEW, [{ ...base, phase: "away", alpha: 0 }], s)).toBeNull();
    expect(carIndexAt(c, VIEW, [{ ...base, phase: "away", alpha: 1 }], s)).toBeNull();
    expect(carIndexAt(c, VIEW, [{ ...base, alpha: 0 }], s)).toBeNull();
    expect(carIndexAt(c, VIEW, [{ ...base, alpha: 0.049 }], s)).toBeNull();
    expect(carIndexAt(c, VIEW, [{ ...base, alpha: 0.05 }], s)).toBe(0);
    expect(carIndexAt(c, VIEW, [{ ...base, phase: "departing", alpha: 1 }], s)).toBe(0);
  });

  it("a real day: away cars are never selected, parked ones are", () => {
    const noon = layout.spots.map((_, i) => pose(i, 300, i % 2 === 0));
    for (let i = 0; i < noon.length; i++) {
      const hit = carIndexAt(cam, VIEW, noon, screenOf(cam, spot(i)));
      if (i % 2 === 1) expect(hit).toBe(i);
      else expect(hit === null || hit % 2 === 1).toBe(true);
    }
  });

  it("garbage input is harmless", () => {
    for (const s of [
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
    ]) {
      expect(carIndexAt(cam, VIEW, parked, s)).toBeNull();
    }
    expect(carIndexAt({ ...cam, zoom: 0 }, VIEW, parked, { x: 1, y: 1 })).toBeNull();
    expect(carIndexAt({ ...cam, zoom: NaN }, VIEW, parked, { x: 1, y: 1 })).toBeNull();
    const bad: CarPose[] = [
      mkPose(NaN, 0),
      mkPose(0, 0, { heading: NaN }),
      mkPose(0, 0, { alpha: NaN }),
      mkPose(Infinity, -Infinity),
    ];
    expect(carIndexAt(cam, VIEW, bad, { x: 10, y: 10 })).toBeNull();
  });
});
