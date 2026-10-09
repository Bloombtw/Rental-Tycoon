import { useSyncExternalStore } from "react";

/**
 * In-memory store of René's portrait (a PNG data URL rendered offscreen by the 3D scene). No
 * `three` here: the scene renders it and publishes the result. Without it the overlay draws the
 * SVG portrait. Nothing is persisted.
 */

export type RenePortraitStatus = "pending" | "ready" | "failed";

export interface RenePortraitState {
  readonly status: RenePortraitStatus;
  readonly src: string | null;
}

const INITIAL: RenePortraitState = Object.freeze({ status: "pending", src: null });

let state: RenePortraitState = INITIAL;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of Array.from(listeners)) cb();
}

export function getRenePortraitState(): RenePortraitState {
  return state;
}

/** Keeps only a well-formed image data URL; anything else counts as a failure. */
export function publishRenePortrait(src: unknown): void {
  if (typeof src !== "string" || !src.startsWith("data:image/")) {
    failRenePortrait();
    return;
  }
  state = Object.freeze({ status: "ready", src });
  emit();
}

/** The render failed or is impossible: the SVG portrait stays. A ready store stays ready. */
export function failRenePortrait(): void {
  if (state.status !== "pending") return;
  state = Object.freeze({ status: "failed", src: null });
  emit();
}

/** Back to "pending" (tests, or a fresh game session). */
export function resetRenePortrait(): void {
  if (state === INITIAL) return;
  state = INITIAL;
  emit();
}

export function subscribeRenePortrait(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** René's 3D portrait: `src` is null until it exists (the caller draws the SVG meanwhile). */
export function useRenePortrait(): RenePortraitState {
  return useSyncExternalStore(subscribeRenePortrait, getRenePortraitState, getRenePortraitState);
}
