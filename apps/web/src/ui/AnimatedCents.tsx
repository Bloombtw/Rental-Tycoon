import { useEffect, useRef, useState, type JSX } from "react";
import type { Cents } from "@rt/sim";
import { formatCents } from "../format.js";
import { tweenCents } from "./tween.js";
import { useReducedMotion } from "./useReducedMotion.js";

interface AnimatedCentsProps {
  readonly value: Cents;
  /** Tween length in ms. Defaults to 450 (`--dur-counter`). */
  readonly durationMs?: number;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** At most one pulse in this window, whatever the pace of the incoming values. */
const PULSE_MIN_GAP_MS = 600;

type Trend = "up" | "down";

/**
 * Visible cash amount that rolls from its current display to the new value (integer cents, ends
 * exactly on the target). Display only: the exact text lives elsewhere (`hud-cash`, sr-only), so
 * this element is aria-hidden. With reduced motion the value jumps straight to the target.
 */
export function AnimatedCents({
  value,
  durationMs = 450,
  className,
  "data-testid": testId,
}: AnimatedCentsProps): JSX.Element {
  const reduced = useReducedMotion();
  const target = Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState<number>(target ?? 0);
  const shownRef = useRef<number>(target ?? 0);
  const lastTarget = useRef<number | null>(target);
  const lastPulse = useRef(Number.NEGATIVE_INFINITY);
  const [pulse, setPulse] = useState<{ trend: Trend; n: number } | null>(null);

  useEffect(() => {
    if (target === null) return undefined;
    const previous = lastTarget.current;
    lastTarget.current = target;
    if (!reduced && previous !== null && previous !== target) {
      const now = performance.now();
      if (now - lastPulse.current >= PULSE_MIN_GAP_MS) {
        lastPulse.current = now;
        const trend: Trend = target > previous ? "up" : "down";
        setPulse((p) => ({ trend, n: (p?.n ?? 0) + 1 }));
      }
    }
    if (reduced || !(durationMs > 0)) {
      shownRef.current = target;
      return undefined;
    }
    const from = shownRef.current;
    if (from === target) return undefined;
    const start = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const t = (now - start) / durationMs;
      const next = tweenCents(from, target, t);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [target, reduced, durationMs]);

  const display = target === null ? Number.NaN : reduced ? target : shown;
  const classes = className === undefined ? "animated-cents" : `animated-cents ${className}`;
  return (
    <span
      key={pulse?.n ?? 0}
      className={classes}
      data-pulse={pulse?.trend ?? "none"}
      data-testid={testId}
      aria-hidden="true"
    >
      {formatCents(display)}
    </span>
  );
}
