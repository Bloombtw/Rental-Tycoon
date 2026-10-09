import type { Cents } from "@rt/sim";

/** Pure tween maths for the cash counter. No timers, no DOM. */

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Ease-out cubic. `t` is bounded to [0, 1]; a non-finite `t` counts as 1 (the end). */
export function easeOutCubic(t: number): number {
  if (!finite(t)) return 1;
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Integer cents between `from` and `to` at progress `t`. Exactly `to` once `t >= 1`; a non-finite
 * `from`, `to` or `t` returns `to`, so the counter can never show NaN or get stuck.
 */
export function tweenCents(from: Cents, to: Cents, t: number): Cents {
  if (!finite(to)) return 0;
  if (!finite(from) || !finite(t)) return to;
  if (t >= 1) return to;
  if (t <= 0) return Math.round(from);
  const value = Math.round(from + (to - from) * easeOutCubic(t));
  return finite(value) ? value : to;
}
