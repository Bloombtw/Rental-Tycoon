import type { Rect, Vec } from "./layout";

/**
 * Camera maths. Pure: zoom = screen pixels per view-plane unit, centre in view-plane coordinates
 * (the projection of the ground, see iso.ts). `bounds` is the agency's projected box.
 */

export interface Camera {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
}

/** The usable screen area (below the HUD, above the sheet / beside the panel), in screen pixels. */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const MAX_FIT_ZOOM = 27;
export const MIN_MAX_ZOOM = 40;

const WHEEL_SENSITIVITY = 0.0015;
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;

function ok(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

function viewValid(view: ScreenRect): boolean {
  return ok(view.x) && ok(view.y) && ok(view.width) && ok(view.height);
}

function boundsValid(b: Rect): boolean {
  return ok(b.x) && ok(b.y) && ok(b.width) && ok(b.height);
}

function fitZoom(bounds: Rect, view: ScreenRect): number {
  if (!viewValid(view) || !boundsValid(bounds)) return 1;
  const z = Math.min(view.width / bounds.width, view.height / bounds.height, MAX_FIT_ZOOM);
  return ok(z) && z > 0 ? z : 1;
}

export function zoomBounds(bounds: Rect, view: ScreenRect): { min: number; max: number } {
  const min = fitZoom(bounds, view);
  return { min, max: Math.max(MIN_MAX_ZOOM, min) };
}

export function fitCamera(bounds: Rect, view: ScreenRect): Camera {
  const valid = boundsValid(bounds);
  return {
    zoom: fitZoom(bounds, view),
    centerX: valid ? bounds.x + bounds.width / 2 : 0,
    centerY: valid ? bounds.y + bounds.height / 2 : 0,
  };
}

function clampAxis(center: number, visible: number, origin: number, size: number): number {
  if (visible >= size) return origin + size / 2;
  const half = visible / 2;
  return Math.min(origin + size - half, Math.max(origin + half, center));
}

/** Keeps the zoom in bounds and the view inside `bounds`. Non-finite input -> overview. */
export function clampCamera(cam: Camera, bounds: Rect, view: ScreenRect): Camera {
  if (
    !ok(cam.zoom) ||
    !ok(cam.centerX) ||
    !ok(cam.centerY) ||
    cam.zoom <= 0 ||
    !viewValid(view) ||
    !boundsValid(bounds)
  ) {
    return fitCamera(bounds, view);
  }
  const { min, max } = zoomBounds(bounds, view);
  const zoom = Math.min(max, Math.max(min, cam.zoom));
  return {
    zoom,
    centerX: clampAxis(cam.centerX, view.width / zoom, bounds.x, bounds.width),
    centerY: clampAxis(cam.centerY, view.height / zoom, bounds.y, bounds.height),
  };
}

/** View-plane point -> screen pixel. */
export function planeToScreen(cam: Camera, view: ScreenRect, p: Vec): Vec {
  return {
    x: view.x + view.width / 2 + (p.x - cam.centerX) * cam.zoom,
    y: view.y + view.height / 2 + (p.y - cam.centerY) * cam.zoom,
  };
}

/** Screen pixel -> view-plane point. */
export function screenToPlane(cam: Camera, view: ScreenRect, p: Vec): Vec {
  return {
    x: cam.centerX + (p.x - view.x - view.width / 2) / cam.zoom,
    y: cam.centerY + (p.y - view.y - view.height / 2) / cam.zoom,
  };
}

/** Drags the view by a screen delta. Non-finite delta -> unchanged. Not clamped. */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  if (!ok(dxScreen) || !ok(dyScreen) || !ok(cam.zoom) || cam.zoom <= 0) return cam;
  return {
    zoom: cam.zoom,
    centerX: cam.centerX - dxScreen / cam.zoom,
    centerY: cam.centerY - dyScreen / cam.zoom,
  };
}

/**
 * Multiplies the zoom by `factor` keeping the plane point under `anchor` fixed on screen.
 * Not clamped: pass the result through clampCamera. Invalid factor or anchor -> unchanged.
 */
export function zoomAt(cam: Camera, view: ScreenRect, factor: number, anchor: Vec): Camera {
  if (!ok(factor) || factor <= 0 || !ok(anchor.x) || !ok(anchor.y)) return cam;
  if (!ok(cam.zoom) || cam.zoom <= 0) return cam;
  const zoom = cam.zoom * factor;
  if (!ok(zoom) || zoom <= 0) return cam;
  const w = screenToPlane(cam, view, anchor);
  return {
    zoom,
    centerX: w.x - (anchor.x - view.x - view.width / 2) / zoom,
    centerY: w.y - (anchor.y - view.y - view.height / 2) / zoom,
  };
}

/** Wheel / trackpad-pinch zoom factor: exp(-delta * 0.0015), bounded to [0.5, 2]; 1 if not finite. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  if (!ok(deltaY)) return 1;
  const unit = deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1;
  const f = Math.exp(-deltaY * unit * WHEEL_SENSITIVITY);
  if (!ok(f)) return deltaY < 0 ? 2 : 0.5;
  return Math.min(2, Math.max(0.5, f));
}
