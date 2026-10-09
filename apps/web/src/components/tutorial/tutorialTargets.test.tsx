import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGame } from "@rt/sim";
import { ManageDrawer } from "../ManageDrawer.js";
import { PriceEditor } from "../PriceEditor.js";
import { SideRail } from "../SideRail.js";
import { SpeedControls } from "../SpeedControls.js";
import { BuyCarPanel } from "../BuyCarPanel.js";
import { UpgradesPanel } from "../UpgradesPanel.js";
import { Hud } from "../Hud.js";

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

const noop = (): void => undefined;
const targets = (id: string) => container.querySelectorAll(`[data-tutorial="${id}"]`);

describe("data-tutorial targets (the tutorial overlay finds them by these ids)", () => {
  it("side rail: cars, upgrades and missions, once each, on a button", () => {
    act(() => {
      root.render(
        <SideRail
          active={null}
          missionsBadge={0}
          gems={0}
          boosted={false}
          onOpen={noop}
          onOpenShop={noop}
          top={0}
        />,
      );
    });
    for (const id of ["rail-cars", "rail-upgrades", "rail-missions"]) {
      expect(targets(id).length, id).toBe(1);
      expect(targets(id)[0]?.tagName).toBe("BUTTON");
    }
    // Every menu button of the rail is addressable (staff and settings too).
    expect(container.querySelectorAll("[data-tutorial]").length).toBe(6);
  });

  it("speed controls: pause/resume button and the x2 button", () => {
    act(() => {
      root.render(
        <SpeedControls speed={1} paused hasRun={false} onSetSpeed={noop} onTogglePause={noop} />,
      );
    });
    expect(targets("speed-pause")[0]?.textContent).toContain("Reprendre");
    expect(targets("speed-fast").length).toBe(1);
    expect(targets("speed-fast")[0]?.textContent).toContain("x2");
  });

  it("drawer handle", () => {
    act(() => {
      root.render(
        <ManageDrawer open={false} fleetSize={0} onSetOpen={noop}>
          <p>contenu</p>
        </ManageDrawer>,
      );
    });
    expect(targets("drawer-handle").length).toBe(1);
    expect(targets("drawer-handle")[0]?.getAttribute("aria-expanded")).toBe("false");
  });

  it("price editor root", () => {
    act(() => {
      root.render(<PriceEditor carId={1 as never} dailyPrice={9000 as never} onSubmit={noop} />);
    });
    expect(targets("price-editor").length).toBe(1);
    expect(targets("price-editor")[0]?.tagName).toBe("FORM");
  });

  it("buy panel: only the used car's « Acheter » button", () => {
    act(() => {
      root.render(
        <BuyCarPanel
          cash={1_000_000 as never}
          fleetSize={0}
          capacity={5}
          highlight={false}
          onBuy={noop}
        />,
      );
    });
    expect(targets("buy-used").length).toBe(1);
    expect(targets("buy-used")[0]?.textContent).toContain("Acheter");
    expect(container.querySelectorAll("[data-tutorial]").length).toBe(1);
  });

  it("upgrades panel: only the advertising buy button", () => {
    const game = createGame(1);
    act(() => {
      root.render(<UpgradesPanel cash={game.cash} upgrades={game.upgrades} onBuy={noop} />);
    });
    expect(targets("upgrade-buy-ads").length).toBe(1);
    expect(container.querySelectorAll("[data-tutorial]").length).toBe(1);
  });

  it("HUD report line, with and without a finished day", () => {
    const game = createGame(1);
    act(() => {
      root.render(
        <Hud game={game} speed={1} paused hasRun={false} onSetSpeed={noop} onTogglePause={noop} />,
      );
    });
    expect(targets("hud-report").length).toBe(1);
    act(() => {
      root.render(
        <Hud
          game={{ ...game, lastDay: { revenue: 5000, costs: 2000 } as never }}
          speed={1}
          paused
          hasRun={false}
          onSetSpeed={noop}
          onTogglePause={noop}
        />,
      );
    });
    expect(targets("hud-report").length).toBe(1);
  });
});
