import type { Camera, ScreenRect } from "./camera";
import type { GroundPoint, Rect, Vec } from "./layout";

/**
 * Orthographic view maths (spec 2.5). Pure: no three, no DOM.
 * World: y up, x east, z south (towards the camera). The camera sits south-east, looks north-west.
 */

export const CAMERA_AZIMUTH = Math.PI / 6;
export const CAMERA_ELEVATION = Math.PI / 4;
export const CAMERA_DISTANCE = 200;
export const SHADOW_MARGIN = 10;

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

/** Square ground area covering the visible region (plus margin) for the shadow camera. */
export function shadowFrustum(
  cam: Camera,
  view: ScreenRect,
): { readonly center: GroundPoint; readonly halfExtent: number } {
  const zoom = safeZoom(cam);
  const w = safeSize(view.width);
  const h = safeSize(view.height);
  const cx = ok(cam.centerX) ? cam.centerX : 0;
  const cy = ok(cam.centerY) ? cam.centerY : 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const g = viewPlaneToGround({ x: cx + (sx * w) / 2 / zoom, y: cy + (sy * h) / 2 / zoom });
      if (!g) continue;
      minX = Math.min(minX, g.x);
      maxX = Math.max(maxX, g.x);
      minZ = Math.min(minZ, g.z);
      maxZ = Math.max(maxZ, g.z);
    }
  }
  if (![minX, maxX, minZ, maxZ].every(ok)) {
    return { center: { x: 0, z: 0 }, halfExtent: SHADOW_MARGIN };
  }
  const half = Math.max(maxX - minX, maxZ - minZ) / 2 + SHADOW_MARGIN;
  return {
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    halfExtent: ok(half) && half > 0 ? half : SHADOW_MARGIN,
  };
}
