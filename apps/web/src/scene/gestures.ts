import type { Vec } from "./layout";

/** Pointer-event reducer: tap / hover / pan / pinch. Pure and immutable. */

export const TAP_SLOP_PX = 10;
export const TAP_MAX_MS = 500;

export interface PointerInput {
  readonly kind: "down" | "move" | "up" | "cancel";
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly pointerType: string;
  readonly buttons: number;
}

export type GestureEffect =
  | { type: "none" }
  | { type: "tap"; x: number; y: number }
  | { type: "hover"; x: number; y: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; factor: number; anchor: Vec; dx: number; dy: number };

interface Tracked {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface GestureState {
  /** idle: nothing down. press: one pointer, may still become a tap. pan: dragging. pinch: two pointers. */
  readonly mode: "idle" | "press" | "pan" | "pinch";
  /** At most two tracked pointers, in arrival order. */
  readonly pointers: readonly Tracked[];
  readonly originX: number;
  readonly originY: number;
  readonly startT: number;
}

export const INITIAL_GESTURE: GestureState = Object.freeze({
  mode: "idle",
  pointers: Object.freeze([]) as readonly Tracked[],
  originX: 0,
  originY: 0,
  startT: 0,
});

const NONE: GestureEffect = { type: "none" };

function fin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Pinch maths. factor = ratio of finger distances (1 if either is zero or not finite),
 * anchor = the new midpoint, (dx, dy) = midpoint displacement.
 * Apply as: panBy(dx, dy) then zoomAt(factor, anchor): the world point that was under the
 * old midpoint ends up under the new one.
 */
export function pinchStep(
  prev: readonly [Vec, Vec],
  next: readonly [Vec, Vec],
): { factor: number; anchor: Vec; dx: number; dy: number } {
  const dPrev = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y);
  const dNext = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y);
  const prevMid = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 };
  const anchor = { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 };
  const factor = fin(dPrev) && fin(dNext) && dPrev > 0 && dNext > 0 ? dNext / dPrev : 1;
  const dx = anchor.x - prevMid.x;
  const dy = anchor.y - prevMid.y;
  return {
    factor,
    anchor: fin(anchor.x) && fin(anchor.y) ? anchor : { x: 0, y: 0 },
    dx: fin(dx) ? dx : 0,
    dy: fin(dy) ? dy : 0,
  };
}

function out(state: GestureState, effect: GestureEffect = NONE) {
  return { state, effect };
}

/** After a pointer leaves: nothing left -> idle; one left -> keep dragging with it (never a tap). */
function afterLeave(remaining: readonly Tracked[], s: GestureState): GestureState {
  if (remaining.length === 0) return INITIAL_GESTURE;
  return { ...s, mode: "pan", pointers: remaining };
}

export function reduceGesture(
  s: GestureState,
  e: PointerInput,
): { state: GestureState; effect: GestureEffect } {
  if (!fin(e.id) || !fin(e.x) || !fin(e.y)) return out(s);
  const idx = s.pointers.findIndex((p) => p.id === e.id);
  const tracked = idx >= 0 ? s.pointers[idx] : undefined;
  const isMouse = e.pointerType === "mouse";

  switch (e.kind) {
    case "down": {
      if (tracked || s.pointers.length >= 2) return out(s);
      if (isMouse && (e.buttons & 1) === 0) return out(s); // primary button only
      const pointers = [...s.pointers, { id: e.id, x: e.x, y: e.y }];
      if (pointers.length === 1) {
        return out({
          mode: "press",
          pointers,
          originX: e.x,
          originY: e.y,
          startT: fin(e.t) ? e.t : 0,
        });
      }
      return out({ ...s, mode: "pinch", pointers });
    }

    case "move": {
      if (!tracked) {
        if (isMouse && s.pointers.length === 0 && e.buttons === 0) {
          return out(s, { type: "hover", x: e.x, y: e.y });
        }
        return out(s);
      }
      // A mouse that moves with no button held lost its "up": drop the gesture.
      if (isMouse && e.buttons === 0) return out(INITIAL_GESTURE);
      const pointers = s.pointers.map((p) => (p.id === e.id ? { id: p.id, x: e.x, y: e.y } : p));
      if (s.mode === "pinch" && pointers.length === 2) {
        const [a, b] = s.pointers as readonly [Tracked, Tracked];
        const [na, nb] = pointers as [Tracked, Tracked];
        const step = pinchStep([a, b], [na, nb]);
        return out({ ...s, pointers }, { type: "pinch", ...step });
      }
      const dx = e.x - tracked.x;
      const dy = e.y - tracked.y;
      if (s.mode === "press") {
        if (Math.hypot(e.x - s.originX, e.y - s.originY) <= TAP_SLOP_PX) {
          return out({ ...s, pointers });
        }
        return out({ ...s, mode: "pan", pointers }, { type: "pan", dx, dy });
      }
      if (s.mode === "pan") return out({ ...s, pointers }, { type: "pan", dx, dy });
      return out({ ...s, pointers });
    }

    case "up": {
      if (!tracked) return out(s);
      if (s.mode === "press" && s.pointers.length === 1) {
        const moved = Math.hypot(e.x - s.originX, e.y - s.originY);
        const duration = e.t - s.startT;
        const isTap = moved <= TAP_SLOP_PX && fin(duration) && duration <= TAP_MAX_MS;
        return out(INITIAL_GESTURE, isTap ? { type: "tap", x: e.x, y: e.y } : NONE);
      }
      return out(
        afterLeave(
          s.pointers.filter((p) => p.id !== e.id),
          s,
        ),
      );
    }

    case "cancel": {
      if (!tracked) return out(s);
      return out(
        afterLeave(
          s.pointers.filter((p) => p.id !== e.id),
          s,
        ),
      );
    }

    default:
      return out(s);
  }
}
