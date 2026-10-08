import { useEffect, useRef } from "react";
import { COMMIT_INTERVAL_MS, accumulateMinutes, splitPending, type Speed } from "./clock.js";

export interface ClockDriver {
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
}

export const browserClockDriver: ClockDriver = {
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(() => cb()),
  cancelFrame: (id) => {
    cancelAnimationFrame(id);
  },
};

interface Options {
  readonly speed: Speed;
  readonly paused: boolean;
  readonly driver: ClockDriver;
  /** Receives whole game minutes, at most every COMMIT_INTERVAL_MS. */
  readonly onCommit: (minutes: number) => void;
}

/**
 * Drives game time from animation frames, independently of the renderer. Fractional minutes live in
 * `pendingRef` (read by the scene for interpolation); whole minutes are committed in batches.
 * While paused nothing accumulates and the pending value is kept frozen.
 */
export function useGameClock(o: Options): { readonly pendingRef: { readonly current: number } } {
  const pendingRef = useRef(0);
  const commitRef = useRef(o.onCommit);
  useEffect(() => {
    commitRef.current = o.onCommit;
  });

  const { speed, paused, driver } = o;
  useEffect(() => {
    if (paused) return undefined;
    let last = driver.now();
    let lastCommit = last;
    let frame: number | null = null;
    const run = { cancelled: false };

    const loop = (): void => {
      frame = null;
      if (run.cancelled) return;
      const now = driver.now();
      const dt = now - last;
      last = now;
      pendingRef.current = accumulateMinutes(pendingRef.current, dt, speed, false);
      if (!(now >= lastCommit)) lastCommit = now; // clock went backwards
      if (now - lastCommit >= COMMIT_INTERVAL_MS) {
        lastCommit = now;
        const { whole, rest } = splitPending(pendingRef.current);
        if (whole > 0) {
          pendingRef.current = rest;
          commitRef.current(whole);
        }
      }
      // The commit may have paused the game: cleanup ran and set `cancelled`.
      if (run.cancelled) return;
      frame = driver.requestFrame(loop);
    };
    frame = driver.requestFrame(loop);
    return () => {
      run.cancelled = true;
      if (frame !== null) driver.cancelFrame(frame);
      frame = null;
    };
  }, [speed, paused, driver]);

  return { pendingRef };
}
