import { departureMinute, returnMinute } from "@rt/sim";
import { planeToScreen, type Camera, type ScreenRect } from "./camera.js";
import { toViewPlane } from "./iso.js";
import type { AgencyLayout, GroundPoint, Vec } from "./layout.js";
import type { CarRoutes } from "./routes.js";

/** Car schedule and motion as pure functions of time (spec 2.2). No three, no DOM. */

export const DRIVE_MINUTES = 60;
/** Fraction of the trip time spent speeding up (departure) or braking (return). */
export const RAMP = 0.25;
/** Minimum touch target, in screen pixels. */
export const MIN_TOUCH_PX = 44;
/** Distance (world units) on each side of a path corner over which the heading is blended. */
export const TURN_BLEND = 1.5;
export const WHEEL_RADIUS = 0.42;
/** Yaw 0 = nose towards the south (+z); PI = nose towards the building. */
export const PARKED_HEADING = Math.PI;
/** Car footprint and height, in world units. */
export const CAR_BOX = { width: 2.1, length: 3.6, height: 1.6 } as const;
/** Below this opacity a car cannot be touched. */
const MIN_TOUCH_ALPHA = 0.05;

export type CarPhase = "parked" | "departing" | "away" | "returning";

export interface CarPose {
  readonly x: number;
  readonly z: number;
  /** Yaw in radians around +y. */
  readonly heading: number;
  /** Signed rolling angle in radians (negative when reversing). 0 when stopped. */
  readonly wheelRotation: number;
  readonly alpha: number;
  readonly phase: CarPhase;
}

function fin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function easeInOutQuad(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** Fraction of distance covered at fraction `p` of the time: soft start, then constant speed. */
export function easeInCruise(p: number): number {
  const x = fin(p) ? Math.min(1, Math.max(0, p)) : 0;
  return x < RAMP ? (x * x) / (RAMP * (2 - RAMP)) : (2 * x - RAMP) / (2 - RAMP);
}

/** Constant speed, then braking: the mirror of easeInCruise. */
export function cruiseEaseOut(p: number): number {
  const x = fin(p) ? Math.min(1, Math.max(0, p)) : 0;
  return 1 - easeInCruise(1 - x);
}

export function carPhaseAt(
  index: number,
  rented: unknown,
  timeOfDay: number,
  reducedMotion: boolean,
): CarPhase {
  if (rented !== true || !fin(timeOfDay)) return "parked";
  const dep = departureMinute(index);
  const ret = returnMinute(index);
  if (dep === null || ret === null) return "parked";
  const t = timeOfDay;
  if (t < dep || t >= ret) return "parked";
  if (reducedMotion) return "away";
  if (t < dep + DRIVE_MINUTES) return "departing";
  if (t < ret - DRIVE_MINUTES) return "away";
  return "returning";
}

interface Segment {
  readonly from: GroundPoint;
  readonly len: number;
  readonly dx: number;
  readonly dz: number;
  readonly heading: number;
  /** -1 when driving in reverse. */
  readonly sign: 1 | -1;
}

function buildSegments(
  path: readonly GroundPoint[],
  reverseFirst: boolean,
  parkLast: boolean,
): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (!(len > 0)) continue;
    segs.push({ from: a, len, dx, dz, heading: Math.atan2(dx, dz), sign: 1 });
  }
  // Cars back out of their spot and park nose first, both facing the building.
  const first = segs[0];
  if (reverseFirst && first) segs[0] = { ...first, heading: PARKED_HEADING, sign: -1 };
  const last = segs[segs.length - 1];
  if (parkLast && last) segs[segs.length - 1] = { ...last, heading: PARKED_HEADING };
  return segs;
}

const segmentCache = new WeakMap<
  readonly GroundPoint[],
  Map<string, { segs: Segment[]; total: number }>
>();

/** Routes are immutable and reused every frame: build their segments once. */
function cachedSegments(
  path: readonly GroundPoint[],
  reverseFirst: boolean,
  parkLast: boolean,
): { segs: Segment[]; total: number } {
  let byFlags = segmentCache.get(path);
  if (!byFlags) {
    byFlags = new Map();
    segmentCache.set(path, byFlags);
  }
  const flags = `${reverseFirst ? "r" : "-"}${parkLast ? "p" : "-"}`;
  let entry = byFlags.get(flags);
  if (!entry) {
    const segs = buildSegments(path, reverseFirst, parkLast);
    entry = { segs, total: segs.reduce((sum, s) => sum + s.len, 0) };
    byFlags.set(flags, entry);
  }
  return entry;
}

function angleDiff(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

interface Along {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  /** Signed distance travelled since the start of the path. */
  readonly distance: number;
}

/** Position, heading and signed distance at fraction `p` (0..1) of the polyline's length. */
function along(
  path: readonly GroundPoint[],
  p: number,
  reverseFirst: boolean,
  parkLast: boolean,
): Along {
  const { segs, total } = cachedSegments(path, reverseFirst, parkLast);
  const start = path[0] ?? { x: 0, z: 0 };
  if (segs.length === 0) return { x: start.x, z: start.z, heading: PARKED_HEADING, distance: 0 };
  let d = Math.min(1, Math.max(0, p)) * total;
  let travelled = 0;
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    if (!seg) continue;
    if (d <= seg.len || k === segs.length - 1) {
      const s = Math.min(d, seg.len);
      const blend = Math.min(TURN_BLEND, seg.len / 2);
      let heading = seg.heading;
      const next = segs[k + 1];
      const prev = segs[k - 1];
      if (next && seg.len - s < blend) {
        heading += 0.5 * (1 - (seg.len - s) / blend) * angleDiff(seg.heading, next.heading);
      } else if (prev && s < blend) {
        heading += 0.5 * (1 - s / blend) * angleDiff(seg.heading, prev.heading);
      }
      return {
        x: seg.from.x + (seg.dx / seg.len) * s,
        z: seg.from.z + (seg.dz / seg.len) * s,
        heading,
        distance: travelled + seg.sign * s,
      };
    }
    d -= seg.len;
    travelled += seg.sign * seg.len;
  }
  return { x: start.x, z: start.z, heading: PARKED_HEADING, distance: 0 };
}

const HIDDEN: CarPose = Object.freeze({
  x: 0,
  z: 0,
  heading: PARKED_HEADING,
  wheelRotation: 0,
  alpha: 0,
  phase: "parked",
});

export function carPoseAt(
  layout: AgencyLayout,
  routes: CarRoutes,
  index: number,
  rented: unknown,
  timeOfDay: number,
  reducedMotion: boolean,
): CarPose {
  const spot = Number.isInteger(index) && index >= 0 ? layout.spots[index] : undefined;
  if (!spot) return HIDDEN;
  const phase = carPhaseAt(index, rented, timeOfDay, reducedMotion);
  const parked: CarPose = {
    x: spot.x,
    z: spot.z,
    heading: PARKED_HEADING,
    wheelRotation: 0,
    alpha: 1,
    phase,
  };
  if (phase === "parked") return parked;

  const dep = departureMinute(index) ?? 0;
  const ret = returnMinute(index) ?? 0;
  const out = routes.departure[index];
  const back = routes.arrival[index];
  if (phase === "away") {
    const end = out?.[out.length - 1];
    return { ...parked, x: end?.x ?? spot.x, z: end?.z ?? spot.z, alpha: 0 };
  }
  if (phase === "departing") {
    if (!out) return parked;
    const p = (timeOfDay - dep) / DRIVE_MINUTES;
    const a = along(out, easeInCruise(p), true, false);
    return {
      x: a.x,
      z: a.z,
      heading: a.heading,
      wheelRotation: a.distance / WHEEL_RADIUS,
      alpha: 1,
      phase,
    };
  }
  if (!back) return parked;
  const p = (timeOfDay - (ret - DRIVE_MINUTES)) / DRIVE_MINUTES;
  const a = along(back, cruiseEaseOut(p), false, true);
  return {
    x: a.x,
    z: a.z,
    heading: a.heading,
    wheelRotation: a.distance / WHEEL_RADIUS,
    alpha: 1,
    phase,
  };
}

/** Screen bounding box (half sizes + centre) of the car's oriented box standing on the ground. */
function screenBox(
  cam: Camera,
  view: ScreenRect,
  pose: CarPose,
): { cx: number; cy: number; halfW: number; halfH: number } | null {
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);
  const lx = fz;
  const lz = -fx;
  const hl = CAR_BOX.length / 2;
  const hw = CAR_BOX.width / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const sl of [-1, 1]) {
    for (const sw of [-1, 1]) {
      for (const y of [0, CAR_BOX.height]) {
        const s = planeToScreen(
          cam,
          view,
          toViewPlane({
            x: pose.x + fx * hl * sl + lx * hw * sw,
            y,
            z: pose.z + fz * hl * sl + lz * hw * sw,
          }),
        );
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y);
      }
    }
  }
  const c = planeToScreen(cam, view, toViewPlane({ x: pose.x, y: CAR_BOX.height / 2, z: pose.z }));
  const box = {
    cx: c.x,
    cy: c.y,
    halfW: Math.max(MIN_TOUCH_PX / 2, (maxX - minX) / 2),
    halfH: Math.max(MIN_TOUCH_PX / 2, (maxY - minY) / 2),
  };
  return [box.cx, box.cy, box.halfW, box.halfH].every(fin) ? box : null;
}

/**
 * Index of the touched car, or null. The projected box of each car is widened to at least 44x44
 * screen px around its projected centre. Closest centre wins; ties go to the larger index.
 * Absent or nearly transparent cars are ignored.
 */
export function carIndexAt(
  cam: Camera,
  view: ScreenRect,
  poses: readonly CarPose[],
  screen: Vec,
): number | null {
  if (!fin(screen.x) || !fin(screen.y) || !fin(cam.zoom) || cam.zoom <= 0) return null;
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i];
    if (!pose || pose.phase === "away" || !(pose.alpha >= MIN_TOUCH_ALPHA)) continue;
    const box = screenBox(cam, view, pose);
    if (!box) continue;
    const dx = screen.x - box.cx;
    const dy = screen.y - box.cy;
    if (Math.abs(dx) > box.halfW || Math.abs(dy) > box.halfH) continue;
    const dist = Math.hypot(dx, dy);
    if (dist <= bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}
