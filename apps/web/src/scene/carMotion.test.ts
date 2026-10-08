import { describe, expect, it } from "vitest";
import { MAX_FLEET_SIZE, departureMinute, returnMinute } from "@rt/sim";
import { fitCamera, planeToScreen, type Camera, type ScreenRect } from "./camera.js";
import {
  CAR_BOX,
  DRIVE_MINUTES,
  MIN_TOUCH_PX,
  PARKED_HEADING,
  TURN_BLEND,
  WHEEL_RADIUS,
  carIndexAt,
  carPhaseAt,
  carPoseAt,
  easeInOutQuad,
  type CarPose,
} from "./carMotion.js";
import { exitPath, returnPath, computeLayout, type GroundPoint } from "./layout.js";
import { toViewPlane } from "./iso.js";

const VIEW: ScreenRect = { x: 0, y: 130, width: 390, height: 650 };
const layout = computeLayout(50, VIEW);
const dep = (i: number) => departureMinute(i) as number;
const ret = (i: number) => returnMinute(i) as number;

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
    expect([DRIVE_MINUTES, MIN_TOUCH_PX, TURN_BLEND, WHEEL_RADIUS]).toEqual([30, 44, 1.5, 0.42]);
    expect(PARKED_HEADING).toBe(Math.PI);
    expect(CAR_BOX).toEqual({ width: 2.1, length: 3.6, height: 1.6 });
  });

  it("easeInOutQuad is 0 to 1, symmetric and monotone", () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutQuad(-3)).toBe(0);
    expect(easeInOutQuad(9)).toBe(1);
    let prev = 0;
    for (let p = 0; p <= 1; p += 0.01) {
      expect(easeInOutQuad(p)).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = easeInOutQuad(p);
    }
  });
});

describe("carPhaseAt", () => {
  it("follows the schedule with exact boundaries (car 3)", () => {
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
        const p = carPhaseAt(i, true, t, true);
        expect(p).toBe(t >= dep(i) && t < ret(i) ? "away" : "parked");
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

  it("every car is back before 21:00 and phases only go parked > departing > away > returning > parked", () => {
    for (const i of [0, 17, 49]) {
      expect(ret(i)).toBeLessThan(720);
      const seen: string[] = [];
      for (let t = 0; t < 720; t += 0.5) {
        const p = carPhaseAt(i, true, t, false);
        if (seen[seen.length - 1] !== p) seen.push(p);
      }
      const order = ["parked", "departing", "away", "returning", "parked"];
      expect(seen.join(">")).toBe(i === 0 ? order.slice(1).join(">") : order.join(">"));
    }
  });
});

describe("carPoseAt: parked, away and invisible cars", () => {
  it("parked: on its spot, nose to the building, wheels still, opaque", () => {
    const p = carPoseAt(layout, 7, true, dep(7) - 1, false);
    expect(p).toMatchObject({
      x: spot(7).x,
      z: spot(7).z,
      heading: PARKED_HEADING,
      wheelRotation: 0,
      alpha: 1,
      phase: "parked",
    });
    expect(carPoseAt(layout, 7, false, 300, false)).toMatchObject({ phase: "parked", alpha: 1 });
    expect(carPoseAt(layout, 7, true, ret(7), false)).toMatchObject({
      x: spot(7).x,
      z: spot(7).z,
      wheelRotation: 0,
      alpha: 1,
    });
  });

  it("away: invisible, wheels still", () => {
    const p = carPoseAt(layout, 30, true, 300, false);
    expect(p).toMatchObject({ alpha: 0, phase: "away", wheelRotation: 0 });
  });

  it.each([-1, 50, 51, 3.5, NaN, Infinity, 2 ** 53, "2", null, undefined])(
    "index %s without a spot is a frozen invisible pose",
    (i) => {
      const p = carPoseAt(layout, i as number, true, 100, false);
      expect(p.alpha).toBe(0);
      expect(p.wheelRotation).toBe(0);
      expect(poseNumbers(p).every(Number.isFinite)).toBe(true);
    },
  );

  it("an index beyond the placed spots is invisible", () => {
    const small = computeLayout(3, VIEW);
    expect(carPoseAt(small, 3, true, 100, false).alpha).toBe(0);
    expect(carPoseAt(computeLayout(0, VIEW), 0, true, 100, false).alpha).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, "5", null, undefined])(
    "hostile time %s keeps the car parked",
    (t) => {
      expect(carPoseAt(layout, 3, true, t as number, false)).toMatchObject({
        phase: "parked",
        alpha: 1,
        wheelRotation: 0,
      });
    },
  );

  it.each([false, undefined, null, 0, 1, "true", {}, [], NaN])(
    "rented = %j never moves the car",
    (rented) => {
      for (let t = 0; t < 720; t += 11) {
        expect(carPoseAt(layout, 4, rented, t, false)).toMatchObject({ phase: "parked", alpha: 1 });
      }
    },
  );

  it("every pose over the whole day, for 0..51 cars and bad indexes, is finite with alpha in [0, 1]", () => {
    for (const n of [0, 1, 3, 11, 25, 50, 51]) {
      const l = computeLayout(n, VIEW);
      for (let i = -1; i <= 52; i++) {
        for (let t = -5; t < 725; t += 9.7) {
          for (const reduced of [false, true]) {
            const p = carPoseAt(l, i, true, t, reduced);
            expect(poseNumbers(p).every(Number.isFinite)).toBe(true);
            expect(p.alpha).toBeGreaterThanOrEqual(0);
            expect(p.alpha).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe("carPoseAt: departure", () => {
  const i = 12;

  it("starts on the spot nose to the building and ends on the street, heading east", () => {
    const start = carPoseAt(layout, i, true, dep(i), false);
    expect(start).toMatchObject({
      x: spot(i).x,
      z: spot(i).z,
      alpha: 1,
      phase: "departing",
      wheelRotation: 0,
    });
    expect(Math.abs(angDiff(start.heading, Math.PI))).toBeLessThan(1e-9);
    const end = carPoseAt(layout, i, true, dep(i) + DRIVE_MINUTES - 1e-6, false);
    expect(end.x).toBeCloseTo(layout.exitEndX, 2);
    expect(end.z).toBeCloseTo(layout.laneOutZ, 2);
    expect(Math.abs(angDiff(end.heading, Math.PI / 2))).toBeLessThan(0.01);
    expect(end.alpha).toBeLessThan(0.05);
  });

  it("backs out first: the first moves are south with the nose north, wheels turning backwards", () => {
    const p = carPoseAt(layout, i, true, dep(i) + 1, false);
    expect(p.z).toBeGreaterThan(spot(i).z);
    expect(p.x).toBeCloseTo(spot(i).x, 9);
    expect(Math.abs(angDiff(p.heading, Math.PI))).toBeLessThan(1e-9);
    expect(p.wheelRotation).toBeLessThan(0);
  });

  it("fades out only on the street, never inside the agency lot", () => {
    let last = 1;
    for (let t = dep(i); t < dep(i) + DRIVE_MINUTES; t += 0.05) {
      const p = carPoseAt(layout, i, true, t, false);
      expect(p.alpha).toBeLessThanOrEqual(last + 1e-9);
      last = p.alpha;
      if (p.alpha < 1) expect(p.z).toBeGreaterThanOrEqual(layout.streetRow * 6 - 1e-6);
    }
    expect(carPoseAt(layout, i, true, dep(i) + 0.5 * DRIVE_MINUTES, false).alpha).toBe(1);
  });
});

describe("carPoseAt: return", () => {
  const i = 30;

  it("starts invisible at the street end heading west and ends on the spot, nose to the building", () => {
    const first = carPoseAt(layout, i, true, ret(i) - DRIVE_MINUTES, false);
    expect(first.alpha).toBeCloseTo(0, 9);
    expect(first.x).toBeCloseTo(layout.exitEndX, 6);
    expect(first.z).toBeCloseTo(layout.laneInZ, 6);
    expect(Math.abs(angDiff(first.heading, -Math.PI / 2))).toBeLessThan(0.01);
    expect(first.wheelRotation).toBe(0);
    const end = carPoseAt(layout, i, true, ret(i) - 1e-6, false);
    expect(end.x).toBeCloseTo(spot(i).x, 3);
    expect(end.z).toBeCloseTo(spot(i).z, 3);
    expect(Math.abs(angDiff(end.heading, Math.PI))).toBeLessThan(0.01);
    expect(end.alpha).toBe(1);
  });

  it("fades in on the street, then drives opaque; wheels only turn forward", () => {
    let last = 0;
    let prevWheel = 0;
    for (let t = ret(i) - DRIVE_MINUTES; t < ret(i); t += 0.05) {
      const p = carPoseAt(layout, i, true, t, false);
      expect(p.alpha).toBeGreaterThanOrEqual(last - 1e-9);
      last = p.alpha;
      if (p.alpha < 1) expect(p.z).toBeGreaterThanOrEqual(layout.streetRow * 6 - 1e-6);
      expect(p.wheelRotation).toBeGreaterThanOrEqual(prevWheel - 1e-9);
      prevWheel = p.wheelRotation;
    }
    expect(carPoseAt(layout, i, true, ret(i) - 0.5 * DRIVE_MINUTES, false).alpha).toBe(1);
  });

  it("the return drives the whole return path (rolled distance = path length / radius)", () => {
    const L = length(returnPath(layout, i));
    const end = carPoseAt(layout, i, true, ret(i) - 1e-7, false);
    expect(end.wheelRotation * WHEEL_RADIUS).toBeCloseTo(L, 2);
  });
});

describe("carPoseAt: no teleport, continuous heading, proportional wheels", () => {
  const dt = 0.02;
  const cases = [0, 9, 24, 49].flatMap((i) =>
    [layout, computeLayout(6, { width: 3000, height: 200 })].map((l) => ({ i, l })),
  );

  it.each(cases)("car $i: steps are bounded over departure and return", ({ i, l }) => {
    if (i >= l.spots.length) return;
    for (const [path, start] of [
      [exitPath(l, i), dep(i)],
      [returnPath(l, i), ret(i) - DRIVE_MINUTES],
    ] as const) {
      const maxStep = ((2.05 * length(path)) / DRIVE_MINUTES) * dt + 1e-6;
      const maxWheel = maxStep / WHEEL_RADIUS;
      let prev = carPoseAt(l, i, true, start, false);
      let rolled = 0;
      let backwards = 0;
      for (let t = start + dt; t < start + DRIVE_MINUTES; t += dt) {
        const p = carPoseAt(l, i, true, t, false);
        const move = Math.hypot(p.x - prev.x, p.z - prev.z);
        expect(move, `jump at t=${t}`).toBeLessThanOrEqual(maxStep);
        expect(Math.abs(angDiff(prev.heading, p.heading)), `turn at t=${t}`).toBeLessThan(0.3);
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
        prev = p;
      }
      // the wheels rolled about the whole path (the loop stops one step before the end)
      expect(rolled).toBeGreaterThan(length(path) * 0.97);
      expect(rolled).toBeLessThanOrEqual(length(path) * 1.001);
      // only the exit backs out, and only along the first leg
      if (start === dep(i)) {
        const first = Math.hypot(at(path, 1).x - at(path, 0).x, at(path, 1).z - at(path, 0).z);
        expect(backwards).toBeGreaterThan(first * 0.8);
        expect(backwards).toBeLessThanOrEqual(first + 0.5);
      } else {
        expect(backwards).toBe(0);
      }
    }
  });

  it("the departure ends with (path length - 2 x reverse leg) / radius of wheel rotation", () => {
    for (const i of [0, 17, 49]) {
      const out = exitPath(layout, i);
      const first = Math.hypot(at(out, 1).x - at(out, 0).x, at(out, 1).z - at(out, 0).z);
      const end = carPoseAt(layout, i, true, dep(i) + DRIVE_MINUTES - 1e-7, false);
      expect(end.wheelRotation * WHEEL_RADIUS).toBeCloseTo(length(out) - 2 * first, 2);
    }
  });

  it("position and opacity are continuous across every phase boundary", () => {
    for (const i of [0, 9, 49]) {
      for (const edge of [dep(i), dep(i) + DRIVE_MINUTES, ret(i) - DRIVE_MINUTES, ret(i)]) {
        const a = carPoseAt(layout, i, true, edge - 1e-6, false);
        const b = carPoseAt(layout, i, true, edge + 1e-6, false);
        if (a.alpha > 0.01 && b.alpha > 0.01) {
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.1);
          expect(Math.abs(angDiff(a.heading, b.heading))).toBeLessThan(0.05);
        }
        expect(Math.abs(a.alpha - b.alpha)).toBeLessThan(0.02);
      }
    }
  });

  it("the heading blends over TURN_BLEND at corners: both legs of a corner give the same heading", () => {
    const out = exitPath(layout, 20);
    const corner = at(out, 2); // aisle -> exit lane corner
    // find the time the car is at that corner
    let best = { t: dep(20), d: Infinity };
    for (let t = dep(20); t < dep(20) + DRIVE_MINUTES; t += 0.002) {
      const p = carPoseAt(layout, 20, true, t, false);
      const d = Math.hypot(p.x - corner.x, p.z - corner.z);
      if (d < best.d) best = { t, d };
    }
    expect(best.d).toBeLessThan(0.05);
    const before = carPoseAt(layout, 20, true, best.t - 0.0005, false);
    const after = carPoseAt(layout, 20, true, best.t + 0.0005, false);
    expect(Math.abs(angDiff(before.heading, after.heading))).toBeLessThan(0.05);
  });
});

describe("carPoseAt: reduced motion", () => {
  it("hidden from dep to ret, parked and visible otherwise, wheels never turn", () => {
    for (const i of [0, 4, 49]) {
      expect(carPoseAt(layout, i, true, dep(i) + 5, true)).toMatchObject({ alpha: 0 });
      expect(carPoseAt(layout, i, true, ret(i), true)).toMatchObject({
        alpha: 1,
        x: spot(i).x,
        z: spot(i).z,
      });
      for (let t = -2; t < 722; t += 0.7) {
        const p = carPoseAt(layout, i, true, t, true);
        expect(p.phase === "departing" || p.phase === "returning").toBe(false);
        expect(p.wheelRotation).toBe(0);
        expect(poseNumbers(p).every(Number.isFinite)).toBe(true);
        if (p.alpha > 0) expect(p).toMatchObject({ x: spot(i).x, z: spot(i).z });
      }
    }
  });

  it("switching reduced motion on mid-trip does not leave a ghost on the road", () => {
    const i = 8;
    const mid = dep(i) + 10;
    expect(carPoseAt(layout, i, true, mid, false).alpha).toBeGreaterThan(0);
    expect(carPoseAt(layout, i, true, mid, true).alpha).toBe(0);
    const back = ret(i) - 10;
    expect(carPoseAt(layout, i, true, back, true).alpha).toBe(0);
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

  it("at large zoom the hit box follows the projected, oriented car box", () => {
    const cam40: Camera = { zoom: 40, centerX: 0, centerY: 0 };
    const along = mkPose(0, 0, { heading: Math.PI }); // long axis north-south
    const across = mkPose(0, 0, { heading: Math.PI / 2 }); // long axis east-west
    const c = screenOf(cam40, along);
    const hit = (p: CarPose, dx: number) => carIndexAt(cam40, VIEW, [p], { x: c.x + dx, y: c.y });
    expect(hit(along, 66)).toBe(0);
    expect(hit(across, 66)).toBe(0);
    expect(hit(along, 78)).toBeNull();
    expect(hit(across, 78)).toBe(0);
    expect(hit(across, 90)).toBeNull();
    expect(hit(along, -78)).toBeNull();
    expect(hit(across, -78)).toBe(0);
  });

  it("the closest centre wins; ties go to the larger index", () => {
    const c: Camera = { zoom: 10, centerX: 0, centerY: 0 };
    const a = mkPose(0, 0);
    const b = mkPose(1, 0); // about 8.7 px to the right
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
    expect(carIndexAt(c, VIEW, [{ ...base, phase: "departing", alpha: 0.6 }], s)).toBe(0);
    expect(carIndexAt(c, VIEW, [base, { ...base, alpha: 0, phase: "away" }], s)).toBe(0);
  });

  it("a real day: away cars are never selected, parked ones are", () => {
    const noon = layout.spots.map((_, i) => carPoseAt(layout, i, i % 2 === 0, 300, false));
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
    expect(() => carIndexAt(cam, VIEW, bad, { x: 10, y: 10 })).not.toThrow();
    expect(carIndexAt(cam, VIEW, bad, { x: 10, y: 10 })).toBeNull();
  });
});
