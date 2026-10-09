import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, type GameState } from "@rt/sim";
import { Hud } from "./Hud.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const chip = () => container.querySelector<HTMLElement>('[data-testid="hud-event"]');

function render(game: GameState, onEventInfo?: () => void): void {
  act(() => {
    root.render(
      <Hud
        game={game}
        speed={1}
        paused={false}
        hasRun
        onSetSpeed={() => undefined}
        onTogglePause={() => undefined}
        {...(onEventInfo ? { onEventInfo } : {})}
      />,
    );
  });
}

describe("Hud event chip", () => {
  it("is absent without an event", () => {
    render(createGame(1));
    expect(chip()).toBeNull();
  });

  it("shows icon, short name and days left during an event", () => {
    render({ ...createGame(1), day: 4, event: { kind: "holidays", startDay: 3, endDay: 6 } });
    const el = chip();
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("Vacances2 j");
    expect(el?.querySelector('[data-icon="event-holidays"]')).not.toBeNull();
    expect(el?.getAttribute("aria-label")).toContain("Clients × 2");
    expect(el?.textContent).not.toMatch(/NaN|undefined/);
  });

  it("is hidden once the event is over, and a tap calls the handler", () => {
    render({ ...createGame(1), day: 6, event: { kind: "storm", startDay: 3, endDay: 6 } });
    expect(chip()).toBeNull();
    const onInfo = vi.fn();
    render({ ...createGame(1), day: 5, event: { kind: "storm", startDay: 5, endDay: 6 } }, onInfo);
    expect(chip()?.textContent).toBe("Tempête1 j");
    act(() => {
      chip()?.click();
    });
    expect(onInfo).toHaveBeenCalledTimes(1);
  });
});
