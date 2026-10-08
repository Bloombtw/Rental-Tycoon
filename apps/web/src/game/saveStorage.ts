export interface SaveStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** The browser's localStorage, or null when absent or when merely touching it throws. Never throws. */
export function browserSaveStorage(): SaveStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const storage = localStorage;
    // Reading a property can already throw (privacy modes, sandboxed frames).
    void storage.length;
    return {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        storage.setItem(k, v);
      },
      removeItem: (k) => {
        storage.removeItem(k);
      },
    };
  } catch {
    return null;
  }
}
