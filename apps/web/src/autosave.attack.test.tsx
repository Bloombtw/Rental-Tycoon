import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { quotaStorage, memoryStorage } from "./game/fakeStorage.js";
import { SAVE_KEY, decodeSave } from "./game/saveFormat.js";
import type { SaveStorage } from "./game/saveStorage.js";
import type { ClockDriver } from "./game/useGameClock.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
let now = 0;
const queue = new Map<number, () => void>();
let nextId = 1;
const driver: ClockDriver = {
  now: () => now,
  requestFrame: (cb) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  },
  cancelFrame: (id) => {
    queue.delete(id);
  },
};
function frame(ms = 100): void {
  now += ms;
  const due = Array.from(queue.values());
  queue.clear();
  act(() => {
    vi.advanceTimersByTime(ms);
    for (const cb of due) cb();
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  now = 0;
  queue.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function mount(storage: SaveStorage | null): void {
  act(() => {
    root.render(
      <App dailyReward={false} clockDriver={driver} storage={storage} newSeed={() => 99} />,
    );
  });
}
function click(id: string): void {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  act(() => {
    el.click();
  });
}

describe("autosave attacks", () => {
  it("failing writes keep the 2 s throttle after a speed change (no write per commit)", () => {
    const s = quotaStorage();
    mount(s);
    click("speed-10"); // speed differs from the last *successful* write forever
    const before = s.setItemCalls;
    for (let i = 0; i < 100; i++) frame(100); // 10 real seconds
    // Spec 2.4/2.6: attempts continue "au rythme normal" (one per 2 s, plus day closings).
    expect(s.setItemCalls - before).toBeLessThanOrEqual(12);
  });

  it("hiding the page while time runs saves the exact displayed clock", () => {
    const s = memoryStorage();
    mount(s);
    click("speed-10");
    for (let i = 0; i < 7; i++) frame(100);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const r = decodeSave(s.data.get(SAVE_KEY) ?? null);
    if (r.kind !== "ok") throw new Error("no save");
    const clock = container.querySelector('[data-testid="hud-clock"]')?.textContent ?? "";
    const min = r.game.minute + 540; // day starts at 09:00
    const hh = String(Math.floor(min / 60) % 24).padStart(2, "0");
    const mm = String(min % 60).padStart(2, "0");
    expect(clock).toContain(`${hh}:${mm}`);
  });
});
