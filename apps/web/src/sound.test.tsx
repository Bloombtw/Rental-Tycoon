import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyCar, createGame } from "@rt/sim";
import { App } from "./App.js";
import { MUTED_KEY } from "./game/audio.js";
import { memoryStorage } from "./game/fakeStorage.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
beforeEach(() => {
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
  vi.restoreAllMocks();
});

describe("sound toggle (sounds.md)", () => {
  it("is on by default, toggles, and is remembered", () => {
    const storage = memoryStorage();
    const mount = () => {
      act(() => {
        root.render(
          <App
            dailyReward={false}
            initialGame={buyCar(createGame(1), "used")}
            storage={storage}
            newSeed={() => 1}
          />,
        );
      });
    };
    mount();
    const toggle = () => container.querySelector<HTMLElement>('[data-testid="sound-toggle"]');
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
    expect(toggle()?.getAttribute("aria-label")).toBe("Couper le son");
    act(() => {
      toggle()?.click();
    });
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
    expect(storage.getItem(MUTED_KEY)).toBe("1");
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    mount();
    expect(toggle()?.getAttribute("aria-label")).toBe("Activer le son");
  });
});
