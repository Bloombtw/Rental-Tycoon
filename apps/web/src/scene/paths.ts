import type { GroundPoint } from "./layout";

/**
 * Polyline maths for lanes, rounded corners and sampling (spec 2.2, 2.3).
 * Pure: no three, no DOM. Ground: x east, z south; heading 0 = towards +z (south), PI / 2 = east.
 */

export interface PathSample {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

const EPS = 1e-9;
/** Segments per rounded corner. */
const ARC_SEGMENTS = 4;

function fin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function validPoint(p: GroundPoint | undefined): p is GroundPoint {
  return p !== undefined && fin(p.x) && fin(p.z);
}

/** Finite points only, consecutive duplicates removed. */
function clean(points: readonly GroundPoint[], closed: boolean): GroundPoint[] {
  const out: GroundPoint[] = [];
  for (const p of points) {
    if (!validPoint(p)) continue;
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < EPS) continue;
    out.push({ x: p.x, z: p.z });
  }
  if (closed && out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first && last && Math.hypot(first.x - last.x, first.z - last.z) < EPS) out.pop();
  }
  return out;
}

/**
 * The polyline moved `offset` to the right of the direction of travel (the right of (dx, dz) is
 * (-dz, dx)). Corners are mitred. A negative offset moves left. Fewer than 2 distinct points -> copy.
 */
export function laneOffset(centerline: readonly GroundPoint[], offset: number): GroundPoint[] {
  const pts = clean(centerline, false);
  const off = fin(offset) ? offset : 0;
  if (pts.length < 2) return pts;
  // Unit right-hand normal of each segment.
  const normals: GroundPoint[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    normals.push({ x: -(b.z - a.z) / len, z: (b.x - a.x) / len });
  }
  const out: GroundPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    const before = normals[i - 1];
    const after = normals[i];
    let nx: number;
    let nz: number;
    if (before && after) {
      const denom = 1 + before.x * after.x + before.z * after.z;
      if (denom < 1e-6) {
        nx = before.x;
        nz = before.z;
      } else {
        nx = (before.x + after.x) / denom;
        nz = (before.z + after.z) / denom;
      }
    } else {
      const n = before ?? after;
      nx = n?.x ?? 0;
      nz = n?.z ?? 0;
    }
    out.push({ x: p.x + nx * off, z: p.z + nz * off });
  }
  return out;
}

/**
 * Replaces every corner by a circular arc of `radius` sampled in 4 segments (5 points). The radius
 * shrinks when the adjacent segments are too short. Open paths keep their end points; collinear
 * vertices are kept as they are.
 */
export function roundCorners(
  points: readonly GroundPoint[],
  radius: number,
  closed: boolean,
): GroundPoint[] {
  const pts = clean(points, closed);
  const r = fin(radius) && radius > 0 ? radius : 0;
  const n = pts.length;
  if (r === 0 || n < 3) return pts;
  const out: GroundPoint[] = [];
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    if (!cur) continue;
    const isEnd = !closed && (i === 0 || i === n - 1);
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    if (isEnd || !prev || !next) {
      out.push(cur);
      continue;
    }
    const lenIn = Math.hypot(cur.x - prev.x, cur.z - prev.z);
    const lenOut = Math.hypot(next.x - cur.x, next.z - cur.z);
    const inX = (cur.x - prev.x) / lenIn;
    const inZ = (cur.z - prev.z) / lenIn;
    const outX = (next.x - cur.x) / lenOut;
    const outZ = (next.z - cur.z) / lenOut;
    const cos = Math.min(1, Math.max(-1, inX * outX + inZ * outZ));
    const cross = inX * outZ - inZ * outX;
    const turn = Math.acos(cos);
    if (turn < 1e-4 || Math.abs(cross) < 1e-9) {
      out.push(cur);
      continue;
    }
    const half = Math.tan(turn / 2);
    // Closed loops share each segment between two corners; open paths only at inner segments.
    const roomIn = closed || i - 1 > 0 ? lenIn / 2 : lenIn;
    const roomOut = closed || i + 1 < n - 1 ? lenOut / 2 : lenOut;
    const tangent = Math.min(r * half, roomIn, roomOut);
    const rr = tangent / half;
    const startX = cur.x - inX * tangent;
    const startZ = cur.z - inZ * tangent;
    // Normal of the incoming direction that points to the inside of the turn.
    let nx = -inZ;
    let nz = inX;
    if (nx * outX + nz * outZ < 0) {
      nx = -nx;
      nz = -nz;
    }
    const cx = startX + nx * rr;
    const cz = startZ + nz * rr;
    const a0 = Math.atan2(startZ - cz, startX - cx);
    const endX = cur.x + outX * tangent;
    const endZ = cur.z + outZ * tangent;
    let sweep = Math.atan2(endZ - cz, endX - cx) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (let k = 0; k <= ARC_SEGMENTS; k++) {
      const a = a0 + (sweep * k) / ARC_SEGMENTS;
      out.push({ x: cx + rr * Math.cos(a), z: cz + rr * Math.sin(a) });
    }
  }
  // Two arcs sharing a tangent point (a leg of exactly 2 x radius) would repeat it.
  return clean(out, closed);
}

interface Measured {
  /** cum[k] = distance at the start of segment k; length = number of segments + 1. */
  readonly cum: readonly number[];
  readonly total: number;
}

const measuredCache = new WeakMap<readonly GroundPoint[], { open?: Measured; closed?: Measured }>();

function measure(points: readonly GroundPoint[], closed: boolean): Measured {
  let entry = measuredCache.get(points);
  if (!entry) {
    entry = {};
    measuredCache.set(points, entry);
  }
  const cached = closed ? entry.closed : entry.open;
  if (cached) return cached;
  const cum: number[] = [0];
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = validPoint(a) && validPoint(b) ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
    total += len;
    cum.push(total);
  }
  const result: Measured = { cum, total };
  if (closed) entry.closed = result;
  else entry.open = result;
  return result;
}

/** Length of the polyline; `closed` adds the segment from the last point back to the first. */
export function pathLength(points: readonly GroundPoint[], closed: boolean): number {
  if (points.length < 2) return 0;
  return measure(points, closed).total;
}

/**
 * Position and heading at `distance` along the polyline. Open paths clamp to their ends, closed
 * paths wrap around. Never returns NaN: a non-finite distance counts as 0 and an empty path gives
 * the origin. Heading is that of the segment containing the point.
 */
export function sampleAt(
  points: readonly GroundPoint[],
  distance: number,
  closed: boolean,
): PathSample {
  const first = points[0];
  if (!validPoint(first)) return { x: 0, z: 0, heading: 0 };
  if (points.length < 2) return { x: first.x, z: first.z, heading: 0 };
  const { cum, total } = measure(points, closed);
  if (!(total > 0)) return { x: first.x, z: first.z, heading: 0 };
  let d = fin(distance) ? distance : 0;
  d = closed ? ((d % total) + total) % total : Math.min(total, Math.max(0, d));
  const segs = cum.length - 1;
  // Last segment whose start is <= d and that has a length.
  let k = 0;
  for (let i = 0; i < segs; i++) {
    const start = cum[i] ?? 0;
    const end = cum[i + 1] ?? start;
    if (end > start) {
      k = i;
      if (d < end) break;
    }
  }
  const a = points[k];
  const b = points[(k + 1) % points.length];
  const start = cum[k] ?? 0;
  const end = cum[k + 1] ?? start;
  if (!validPoint(a) || !validPoint(b) || !(end > start)) {
    return { x: first.x, z: first.z, heading: 0 };
  }
  const t = Math.min(1, Math.max(0, (d - start) / (end - start)));
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return { x: a.x + dx * t, z: a.z + dz * t, heading: Math.atan2(dx, dz) };
}
