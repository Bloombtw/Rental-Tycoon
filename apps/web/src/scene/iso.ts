import { planeToScreen, type Camera, type ScreenRect } from "./camera";
import type { GroundPoint, Rect, Vec } from "./layout";

/**
 * Orthographic view maths (spec 2.5). Pure: no three, no DOM.
 * World: y up, x east, z south (towards the camera). The camera sits south-east, looks north-west.
 */

export const CAMERA_AZIMUTH = Math.PI / 6;
export const CAMERA_ELEVATION = Math.PI / 4;
export const CAMERA_DISTANCE = 200;
export const SHADOW_MARGIN = 6;
/** Height of the tallest surface that receives a shadow, for the shadow frustum. */
export const RECEIVER_HEIGHT = 12;

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const SIN_A = Math.sin(CAMERA_AZIMUTH);
const COS_A = Math.cos(CAMERA_AZIMUTH);
const SIN_E = Math.sin(CAMERA_ELEVATION);
const COS_E = Math.cos(CAMERA_ELEVATION);

/** Screen-right axis. */
const R: Point3 = { x: COS_A, y: 0, z: -SIN_A };
/** Screen-up axis. */
const U: Point3 = { x: -SIN_A * SIN_E, y: COS_E, z: -COS_A * SIN_E };
/** Direction the camera looks along. */
const D: Point3 = { x: -(SIN_A * COS_E), y: -SIN_E, z: -(COS_A * COS_E) };

function ok(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** View-plane coordinates of a 3D point: (p . r, -(p . u)), y pointing down. */
export function toViewPlane(p: Point3): Vec {
  return { x: dot(p, R), y: -dot(p, U) };
}

/** Where the view ray through the view-plane point `v` meets the plane y = groundY. Null if not finite. */
export function viewPlaneToGround(v: Vec, groundY = 0): GroundPoint | null {
  if (!ok(v.x) || !ok(v.y) || !ok(groundY)) return null;
  // Along-ground coordinate perpendicular to r: q = sin a * x + cos a * z.
  const q = (v.y + COS_E * groundY) / SIN_E;
  const x = COS_A * v.x + SIN_A * q;
  const z = -SIN_A * v.x + COS_A * q;
  return ok(x) && ok(z) ? { x, z } : null;
}

/** Bounding rectangle of the projected points. Empty or non-finite input -> all zeros. */
export function projectedBounds(points: readonly Point3[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!ok(p.x) || !ok(p.y) || !ok(p.z)) return { x: 0, y: 0, width: 0, height: 0 };
    const v = toViewPlane(p);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  if (![minX, minY, maxX, maxY].every(ok)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface CameraRig {
  readonly position: Point3;
  readonly target: Point3;
  readonly up: Point3;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function safeZoom(cam: Camera): number {
  return ok(cam.zoom) && cam.zoom > 0 ? cam.zoom : 1;
}

function safeSize(n: number): number {
  return ok(n) && n > 0 ? n : 1;
}

/** Orthographic camera parameters for a view-plane camera. Always finite. */
export function cameraRig(cam: Camera, view: ScreenRect): CameraRig {
  const zoom = safeZoom(cam);
  const ground = viewPlaneToGround({ x: cam.centerX, y: cam.centerY }) ?? { x: 0, z: 0 };
  const target: Point3 = { x: ground.x, y: 0, z: ground.z };
  const position: Point3 = {
    x: target.x - D.x * CAMERA_DISTANCE,
    y: target.y - D.y * CAMERA_DISTANCE,
    z: target.z - D.z * CAMERA_DISTANCE,
  };
  const halfW = safeSize(view.width) / 2 / zoom;
  const halfH = safeSize(view.height) / 2 / zoom;
  return { position, target, up: U, left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

const DEFAULT_SUN: Point3 = { x: 0.3, y: 0.8, z: 0.52 };

function unit(v: Point3): Point3 | null {
  if (!ok(v.x) || !ok(v.y) || !ok(v.z)) return null;
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 1e-9 ? { x: v.x / len, y: v.y / len, z: v.z / len } : null;
}

/**
 * Orthonormal basis of the light's view (three's lookAt convention, camera at the sun):
 * right = normalize(Y x sunDir), up = sunDir x right. A vertical or invalid sun falls back safely.
 */
export function lightBasis(sunDir: Point3): { readonly right: Point3; readonly up: Point3 } {
  const s = unit(sunDir) ?? (unit(DEFAULT_SUN) as Point3);
  let right = unit({ x: s.z, y: 0, z: -s.x });
  if (!right) right = { x: 1, y: 0, z: 0 };
  const up: Point3 = {
    x: s.y * right.z - s.z * right.y,
    y: s.z * right.x - s.x * right.z,
    z: s.x * right.y - s.y * right.x,
  };
  return { right, up };
}

/**
 * Rectangle of the shadow camera in the light's axes covering what the screen shows: the 4 screen
 * corners projected to the ground (y = 0) and to y = RECEIVER_HEIGHT, plus SHADOW_MARGIN. `center`
 * is the rectangle centre moved along `sunDir` down to the ground.
 */
export function shadowFrustum(
  cam: Camera,
  view: ScreenRect,
  sunDir: Point3,
): {
  readonly center: GroundPoint;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly up: Point3;
} {
  const s = unit(sunDir) ?? (unit(DEFAULT_SUN) as Point3);
  const { right, up } = lightBasis(s);
  const zoom = safeZoom(cam);
  const w = safeSize(view.width);
  const h = safeSize(view.height);
  const cx = ok(cam.centerX) ? cam.centerX : 0;
  const cy = ok(cam.centerY) ? cam.centerY : 0;
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const y of [0, RECEIVER_HEIGHT]) {
        const g = viewPlaneToGround(
          { x: cx + (sx * w) / 2 / zoom, y: cy + (sy * h) / 2 / zoom },
          y,
        );
        if (!g) continue;
        const p: Point3 = { x: g.x, y, z: g.z };
        const r = dot(p, right);
        const u = dot(p, up);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
      }
    }
  }
  if (![minR, maxR, minU, maxU].every(ok)) {
    return { center: { x: 0, z: 0 }, halfWidth: SHADOW_MARGIN, halfHeight: SHADOW_MARGIN, up };
  }
  const cr = (minR + maxR) / 2;
  const cu = (minU + maxU) / 2;
  const px = right.x * cr + up.x * cu;
  const py = right.y * cr + up.y * cu;
  const pz = right.z * cr + up.z * cu;
  const along = s.y > 1e-6 ? -py / s.y : 0;
  const center = { x: px + s.x * along, z: pz + s.z * along };
  const halfWidth = (maxR - minR) / 2 + SHADOW_MARGIN;
  const halfHeight = (maxU - minU) / 2 + SHADOW_MARGIN;
  return {
    center: ok(center.x) && ok(center.z) ? center : { x: 0, z: 0 },
    halfWidth: ok(halfWidth) && halfWidth > 0 ? halfWidth : SHADOW_MARGIN,
    halfHeight: ok(halfHeight) && halfHeight > 0 ? halfHeight : SHADOW_MARGIN,
    up,
  };
}

/** True if the 3D point projects inside the view rectangle grown by `marginPx` on every side. */
export function groundPointOnScreen(
  cam: Camera,
  view: ScreenRect,
  p: Point3,
  marginPx: number,
): boolean {
  if (!ok(p.x) || !ok(p.y) || !ok(p.z) || !ok(cam.zoom) || cam.zoom <= 0) return false;
  const m = ok(marginPx) ? Math.max(0, marginPx) : 0;
  const s = planeToScreen(cam, view, toViewPlane(p));
  return (
    ok(s.x) &&
    ok(s.y) &&
    s.x >= view.x - m &&
    s.x <= view.x + view.width + m &&
    s.y >= view.y - m &&
    s.y <= view.y + view.height + m
  );
}
