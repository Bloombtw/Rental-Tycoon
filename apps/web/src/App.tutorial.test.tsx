import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyCar, createGame } from "@rt/sim";
import { App } from "./App.js";
import { memoryStorage } from "./game/fakeStorage.js";
import { decodeSave, encodeSave, SAVE_KEY } from "./game/saveFormat.js";

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

const q = (id: string): HTMLElement | null =>
  container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const step = (): string | null =>
  container.querySelector<HTMLElement>("main.app")?.getAttribute("data-tutorial-step") ?? null;

function click(id: string): void {
  const el = q(id);
  if (!el) throw new Error(`missing testid ${id}`);
  act(() => {
    el.click();
  });
}

/** Taps René's bubble until the whole step text has been read (finish typing, then next). */
function readBubbles(count: number): void {
  for (let i = 0; i < count * 2; i++) click("tutorial-bubble");
}

function mount(props: Parameters<typeof App>[0]): void {
  act(() => {
    root.render(<App dailyReward={false} newSeed={() => 1} {...props} />);
  });
}

describe("tutorial in the app (tutorial.md)", () => {
  it("a new game starts with René and walks the first steps with real controls", () => {
    const storage = memoryStorage();
    mount({ storage });
    expect(step()).toBe("welcome");
    expect(q("tutorial-overlay")).not.toBeNull();
    expect(q("tutorial-skip")).toBeNull(); // no skip in the first run

    readBubbles(3);
    expect(step()).toBe("openCars");
    click("rail-cars");
    expect(step()).toBe("buyUsed");
    expect(q("panel-cars")).not.toBeNull();
    click("buy-used");
    expect(step()).toBe("openFleet");
    click("drawer-toggle");
    expect(step()).toBe("setPrice");

    // the step is saved with the game: a reload resumes at the same place
    const saved = decodeSave(storage.getItem(SAVE_KEY));
    expect(saved).toMatchObject({ kind: "ok", tutorial: "setPrice" });
  });

  it("a reload resumes the saved step", () => {
    const storage = memoryStorage({
      [SAVE_KEY]: encodeSave(buyCar(createGame(1), "used"), 1, Date.now(), "setPrice"),
    });
    mount({ storage });
    expect(step()).toBe("setPrice");
    expect(q("tutorial-overlay")).not.toBeNull();
  });

  it("an old save without the field never shows the tutorial", () => {
    const env = JSON.parse(encodeSave(createGame(1), 1, Date.now())) as Record<string, unknown>;
    delete env["tutorial"];
    mount({ storage: memoryStorage({ [SAVE_KEY]: JSON.stringify(env) }) });
    expect(step()).toBe("done");
    expect(q("tutorial-overlay")).toBeNull();
  });

  it("the menus of the game are shut while René talks", () => {
    mount({ storage: memoryStorage() });
    click("rail-upgrades"); // not the step's menu: refused
    expect(q("panel-upgrades")?.getAttribute("aria-hidden") ?? "true").not.toBe("false");
    expect(step()).toBe("welcome");
  });

  it("settings can replay the tutorial, and a replay can be skipped", () => {
    mount({ initialGame: buyCar(createGame(1), "used"), storage: memoryStorage() });
    expect(step()).toBe("done");
    click("rail-settings");
    click("replay-tutorial");
    expect(step()).toBe("welcome");
    expect(q("tutorial-skip")).not.toBeNull();
    click("tutorial-skip");
    expect(step()).toBe("done");
    expect(q("tutorial-overlay")).toBeNull();
  });
});
