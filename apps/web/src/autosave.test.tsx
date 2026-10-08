import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceMinutes, buyCar, createGame, type GameState } from "@rt/sim";
import { App } from "./App.js";
import {
  memoryStorage,
  quotaStorage,
  throwingStorage,
  type FakeStorage,
} from "./game/fakeStorage.js";
import { SAVE_KEY, REJECTED_SAVE_KEY, decodeSave, encodeSave } from "./game/saveFormat.js";
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
/** One animation frame of `ms` real milliseconds, with the wall clock moving too. */
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

function mount(storage: SaveStorage | null, extra: { initialGame?: GameState } = {}): void {
  act(() => {
    root.render(<App clockDriver={driver} storage={storage} newSeed={() => 99} {...extra} />);
  });
}
function byId(id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el;
}
function maybe(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}
function click(id: string): void {
  act(() => {
    byId(id).click();
  });
}
function saved(s: FakeStorage): GameState {
  const r = decodeSave(s.data.get(SAVE_KEY) ?? null);
  if (r.kind !== "ok") throw new Error("no valid save");
  return r.game;
}

describe("resume", () => {
  it("restores the saved game paused, with a notice", () => {
    const game = advanceMinutes(advanceMinutes(buyCar(createGame(5), "compact"), 700), 300);
    const s = memoryStorage({ [SAVE_KEY]: encodeSave(game, 4, 1) });
    mount(s);
    expect(byId("hud-clock").textContent).toContain("Jour 2");
    expect(byId("notice").textContent).toContain("Partie reprise : Jour 2");
    expect(byId("speed-pause").getAttribute("data-highlight")).toBe("true");
    expect(s.setItemCalls).toBe(0);
  });

  it("falls back to a new game on corrupt storage, keeping the raw text", () => {
    const s = memoryStorage({ [SAVE_KEY]: "garbage" });
    mount(s);
    expect(byId("error-banner").textContent).toContain("Sauvegarde illisible");
    expect(s.data.get(REJECTED_SAVE_KEY)).toBe("garbage");
    expect(container.textContent).not.toMatch(/NaN|undefined|\[object Object\]/);
  });
});

describe("saving", () => {
  it("saves a purchase immediately and on pagehide", () => {
    const s = memoryStorage();
    mount(s);
    click("buy-compact");
    expect(saved(s).fleet).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(saved(s).fleet).toHaveLength(1);
  });

  it("throttles while time runs and stays silent when paused", () => {
    const s = memoryStorage();
    mount(s);
    click("speed-10");
    for (let i = 0; i < 100; i++) frame(100); // 10 real seconds
    const running = s.setItemCalls;
    expect(running).toBeGreaterThan(0);
    // 10 s / 2 s throttle + a few day closings, far below one write per commit.
    expect(running).toBeLessThanOrEqual(12);
    click("speed-pause");
    const afterPause = s.setItemCalls;
    for (let i = 0; i < 50; i++) frame(100);
    expect(s.setItemCalls).toBe(afterPause);
  });
});

describe("new game", () => {
  it("cancel keeps the game, confirm restarts and persists", () => {
    const s = memoryStorage();
    mount(s);
    click("buy-compact");
    click("new-game");
    expect(byId("new-game-dialog").getAttribute("role")).toBe("alertdialog");
    expect(byId("new-game-summary").textContent).toContain("1 voiture");
    click("new-game-cancel");
    expect(maybe("new-game-dialog")).toBeNull();
    expect(saved(s).fleet).toHaveLength(1);

    click("new-game");
    click("new-game-confirm");
    expect(maybe("new-game-dialog")).toBeNull();
    expect(byId("hud-clock").textContent).toBe("Jour 1 · 09:00");
    expect(byId("notice").textContent).toContain("Nouvelle partie commencée.");
    expect(saved(s)).toEqual(createGame(99));
  });

  it("closes on Escape and pauses the game", () => {
    mount(memoryStorage());
    click("speed-1");
    click("new-game");
    expect(byId("speed-pause").textContent).toMatch(/Reprendre/);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(maybe("new-game-dialog")).toBeNull();
  });
});

describe("dialog focus", () => {
  function key(k: string, shiftKey = false): void {
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }));
    });
  }
  it("traps Tab inside the dialog and restores focus to the opener", () => {
    mount(memoryStorage());
    const opener = byId("new-game");
    act(() => {
      opener.focus();
      opener.click();
    });
    const cancel = byId("new-game-cancel");
    const confirm = byId("new-game-confirm");
    expect(document.activeElement).toBe(cancel);
    act(() => {
      confirm.focus();
    });
    key("Tab");
    expect(document.activeElement).toBe(cancel);
    key("Tab", true);
    expect(document.activeElement).toBe(confirm);
    act(() => {
      opener.focus(); // focus escaped: Tab pulls it back in
    });
    key("Tab");
    expect(document.activeElement).toBe(cancel);
    key("Escape");
    expect(maybe("new-game-dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("rejected save backup", () => {
  it("never overwrites the only copy until the backup succeeds", () => {
    const s = memoryStorage({ [SAVE_KEY]: "garbage" });
    let refuse = true;
    const real = s.setItem;
    s.setItem = (k, v) => {
      if (refuse && k === REJECTED_SAVE_KEY) throw new Error("QuotaExceededError");
      real(k, v);
    };
    mount(s);
    expect(byId("save-warning").textContent).toContain("Sauvegarde impossible");
    click("buy-compact");
    expect(s.data.get(SAVE_KEY)).toBe("garbage");
    refuse = false;
    click("buy-used");
    expect(s.data.get(REJECTED_SAVE_KEY)).toBe("garbage");
    expect(saved(s).fleet).toHaveLength(2);
    expect(maybe("save-warning")).toBeNull();
  });
});

describe("storage failures", () => {
  it("stays playable and warns when storage is unavailable", () => {
    mount(throwingStorage());
    expect(byId("save-warning").textContent).toContain("Sauvegarde indisponible");
    click("buy-compact");
    click("speed-1");
    for (let i = 0; i < 30; i++) frame(100);
    expect(byId("hud-cash").textContent).not.toMatch(/NaN|undefined/);
    click("save-warning-dismiss");
    expect(maybe("save-warning")).toBeNull();
  });

  it("warns once on quota errors then clears after a successful write", () => {
    const s = quotaStorage();
    mount(s);
    expect(maybe("save-warning")).toBeNull();
    click("buy-compact");
    expect(byId("save-warning").textContent).toContain("Sauvegarde impossible");
    click("save-warning-dismiss");
    click("buy-used");
    expect(maybe("save-warning")).toBeNull(); // dismissed, not re-shown within the episode
    s.full.value = false;
    click("buy-hybrid");
    expect(maybe("save-warning")).toBeNull();
    expect(saved(s).fleet).toHaveLength(3);
    s.full.value = true;
    click("buy-compact");
    expect(maybe("save-warning")).not.toBeNull(); // a new episode warns again
  });
});
