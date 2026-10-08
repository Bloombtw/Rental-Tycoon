import type { SaveStorage } from "./saveStorage.js";

/** In-memory storage for tests. Never imported by the app. */
export interface FakeStorage extends SaveStorage {
  readonly data: Map<string, string>;
  setItemCalls: number;
}

export function memoryStorage(initial: Record<string, string> = {}): FakeStorage {
  const data = new Map(Object.entries(initial));
  const s: FakeStorage = {
    data,
    setItemCalls: 0,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      s.setItemCalls++;
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
  return s;
}

/** Every access throws (private browsing). */
export function throwingStorage(): SaveStorage {
  const boom = (): never => {
    throw new Error("SecurityError");
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

/** Reads work, writes throw QuotaExceededError while `full.value` is true. */
export function quotaStorage(initial: Record<string, string> = {}): FakeStorage & {
  full: { value: boolean };
} {
  const base = memoryStorage(initial);
  const full = { value: true };
  return Object.assign(base, {
    full,
    setItem: (k: string, v: string): void => {
      base.setItemCalls++;
      if (full.value) throw new Error("QuotaExceededError");
      base.data.set(k, v);
    },
  });
}
