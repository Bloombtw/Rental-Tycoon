import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyCar, createGame, DAILY_REWARDS } from "@rt/sim";
import { App } from "./App.js";
import { memoryStorage } from "./game/fakeStorage.js";
import { calendarDay } from "./game/calendar.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
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

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("daily reward (daily-reward.md)", () => {
  it("is offered once a day after the tutorial, and pays on claim", () => {
    const game = buyCar(createGame(1), "used"); // not a fresh agency: no tutorial
    act(() => {
      root.render(<App initialGame={game} storage={memoryStorage()} newSeed={() => 1} />);
    });
    expect(q("daily-dialog")).not.toBeNull();
    expect(q("daily-amount")?.textContent).toContain("500");
    act(() => {
      q("daily-claim")?.click();
    });
    expect(q("daily-dialog")).toBeNull();
    expect(q("notice")?.textContent).toContain("Prime du jour");
  });

  it("is not offered during the tutorial, nor twice the same day", () => {
    act(() => {
      root.render(<App initialGame={createGame(1)} storage={memoryStorage()} newSeed={() => 1} />);
    });
    expect(q("daily-dialog")).toBeNull();
    const today = calendarDay(Date.now());
    const claimed = {
      ...buyCar(createGame(1), "used"),
      dailyReward: { lastDay: today, streak: 1 },
    };
    act(() => {
      root.render(<App initialGame={claimed} storage={memoryStorage()} newSeed={() => 1} />);
    });
    expect(q("daily-dialog")).toBeNull();
    expect(DAILY_REWARDS).toHaveLength(7);
  });
});
