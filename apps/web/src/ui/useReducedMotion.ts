import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function query(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY)
    : null;
}

function subscribe(onChange: () => void): () => void {
  const mq = query();
  if (!mq) return () => undefined;
  mq.addEventListener("change", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
  };
}

function snapshot(): boolean {
  return query()?.matches === true;
}

/** True while the OS asks for reduced motion. Follows live changes (`matchMedia` change). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
