import { useSyncExternalStore } from "react";
import { carAssetKey, type CarAssetKey } from "../scene/assets.js";

/**
 * In-memory store of the 3D car thumbnails (PNG data URLs), shared by every card. No `three`
 * here: the scene renders them and publishes the result. Nothing is persisted.
 */

export type ThumbnailStatus = "pending" | "ready" | "failed";

export interface ThumbnailState {
  readonly status: ThumbnailStatus;
  readonly images: ReadonlyMap<CarAssetKey, string>;
}

const EMPTY: ReadonlyMap<CarAssetKey, string> = new Map();
const INITIAL: ThumbnailState = Object.freeze({ status: "pending", images: EMPTY });

let state: ThumbnailState = INITIAL;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of Array.from(listeners)) cb();
}

export function getThumbnailState(): ThumbnailState {
  return state;
}

/** Stores the rendered images (only well-formed data URLs are kept) and marks the store ready. */
export function publishThumbnails(images: ReadonlyMap<CarAssetKey, string>): void {
  const kept = new Map<CarAssetKey, string>();
  for (const [key, src] of images) {
    if (typeof src === "string" && src.startsWith("data:image/")) kept.set(key, src);
  }
  state = Object.freeze({ status: "ready", images: kept });
  emit();
}

/** The render failed or is impossible: the drawn illustrations stay. A ready store stays ready. */
export function failThumbnails(): void {
  if (state.status === "ready") return;
  if (state.status === "failed") return;
  state = Object.freeze({ status: "failed", images: EMPTY });
  emit();
}

/** Back to "pending" (tests, or a fresh game session). */
export function resetThumbnails(): void {
  if (state === INITIAL) return;
  state = INITIAL;
  emit();
}

export function subscribeThumbnails(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Thumbnail of a car model. `src` is null until the 3D image exists and for unknown models; the
 * caller then draws the illustration. `key` is the (validated) asset key of `model`.
 */
export function useCarThumbnail(model: unknown): {
  status: ThumbnailStatus;
  src: string | null;
  key: CarAssetKey;
} {
  const snapshot = useSyncExternalStore(subscribeThumbnails, getThumbnailState, getThumbnailState);
  const key = carAssetKey(model);
  const src =
    snapshot.status === "ready" && key !== "unknown" ? (snapshot.images.get(key) ?? null) : null;
  return { status: snapshot.status, src, key };
}
