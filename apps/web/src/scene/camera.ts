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

/** Parts of the view hidden under floating UI (HUD, sheet, side panel), in screen pixels. */
export interface ObscuredInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: ObscuredInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/** At most this share of an axis can be hidden: at least 30 % of the scene stays free. */
export const MAX_OBSCURED_SHARE = 0.7;

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

function clampAxisPair(a: number, b: number, size: number): [number, number] {
  const cap = Math.max(0, size) * MAX_OBSCURED_SHARE;
  let lo = ok(a) ? Math.min(Math.max(0, a), cap) : 0;
  let hi = ok(b) ? Math.min(Math.max(0, b), cap) : 0;
  const sum = lo + hi;
  if (sum > cap && sum > 0) {
    lo = (lo / sum) * cap;
    hi = (hi / sum) * cap;
  }
  return [lo, hi];
}

/**
 * Makes insets safe for a view of `size`: finite, never negative, and together at most 70 % of
 * each axis. Anything invalid counts as 0.
 */
export function clampInsets(
  insets: ObscuredInsets,
  size: { readonly width: number; readonly height: number },
): ObscuredInsets {
  const w = ok(size.width) ? size.width : 0;
  const h = ok(size.height) ? size.height : 0;
  const [top, bottom] = clampAxisPair(insets.top, insets.bottom, h);
  const [left, right] = clampAxisPair(insets.left, insets.right, w);
  return { top, right, bottom, left };
}

/** The part of `view` left free by the insets. */
function freeRect(view: ScreenRect, insets: ObscuredInsets): ScreenRect {
  if (!viewValid(view)) return view;
  const i = clampInsets(insets, view);
  if (i.top + i.right + i.bottom + i.left === 0) return view;
  return {
    x: view.x + i.left,
    y: view.y + i.top,
    width: Math.max(1, view.width - i.left - i.right),
    height: Math.max(1, view.height - i.top - i.bottom),
  };
}

function fitZoom(bounds: Rect, view: ScreenRect): number {
  if (!viewValid(view) || !boundsValid(bounds)) return 1;
  const z = Math.min(view.width / bounds.width, view.height / bounds.height, MAX_FIT_ZOOM);
  return ok(z) && z > 0 ? z : 1;
}

export function zoomBounds(
  bounds: Rect,
  view: ScreenRect,
  insets: ObscuredInsets = NO_INSETS,
): { min: number; max: number } {
  const min = fitZoom(bounds, freeRect(view, insets));
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

/**
 * Fits `bounds` inside the free rectangle of `view` (what the insets leave visible). The camera
 * is expressed for the whole view (setCamera, panning and taps stay in full-view coordinates),
 * so the bounds' centre lands on the centre of the free rectangle. Zero insets = fitCamera.
 */
export function fitCameraInRect(bounds: Rect, view: ScreenRect, insets: ObscuredInsets): Camera {
  if (!viewValid(view) || !boundsValid(bounds)) return fitCamera(bounds, view);
  const free = freeRect(view, insets);
  const zoom = fitZoom(bounds, free);
  // Screen offset of the free rectangle's centre from the view's centre.
  const dx = free.x + free.width / 2 - (view.x + view.width / 2);
  const dy = free.y + free.height / 2 - (view.y + view.height / 2);
  return {
    zoom,
    centerX: bounds.x + bounds.width / 2 - dx / zoom,
    centerY: bounds.y + bounds.height / 2 - dy / zoom,
  };
}

function clampAxis(center: number, visible: number, origin: number, size: number): number {
  if (visible >= size) return origin + size / 2;
  const half = visible / 2;
  return Math.min(origin + size - half, Math.max(origin + half, center));
}

/**
 * Keeps the zoom in bounds and the view inside `bounds`. Non-finite input -> overview.
 * With insets, the free rectangle (not the whole view) is what must stay inside `bounds`.
 */
export function clampCamera(
  cam: Camera,
  bounds: Rect,
  view: ScreenRect,
  insets: ObscuredInsets = NO_INSETS,
): Camera {
  if (
    !ok(cam.zoom) ||
    !ok(cam.centerX) ||
    !ok(cam.centerY) ||
    cam.zoom <= 0 ||
    !viewValid(view) ||
    !boundsValid(bounds)
  ) {
    return fitCameraInRect(bounds, view, insets);
  }
  const { min, max } = zoomBounds(bounds, view, insets);
  const zoom = Math.min(max, Math.max(min, cam.zoom));
  const free = freeRect(view, insets);
  const dx = free.x + free.width / 2 - (view.x + view.width / 2);
  const dy = free.y + free.height / 2 - (view.y + view.height / 2);
  const fx = clampAxis(cam.centerX + dx / zoom, free.width / zoom, bounds.x, bounds.width);
  const fy = clampAxis(cam.centerY + dy / zoom, free.height / zoom, bounds.y, bounds.height);
  return { zoom, centerX: fx - dx / zoom, centerY: fy - dy / zoom };
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
