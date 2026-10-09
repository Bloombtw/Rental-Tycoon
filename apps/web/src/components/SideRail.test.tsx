import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { SideRail } from "./SideRail.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("zone under construction (showcase only)", () => {
  it("the Airport entry is locked and only shows a message", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(
        <SideRail
          active={null}
          missionsBadge={0}
          gems={0}
          boosted={false}
          onOpen={() => undefined}
          onOpenShop={() => undefined}
          top={0}
        />,
      );
    });
    const btn = host.querySelector<HTMLElement>('[data-testid="rail-airport"]');
    expect(btn?.getAttribute("aria-label")).toBe("Aéroport : en chantier");
    act(() => {
      btn?.click();
    });
    expect(host.querySelector('[data-testid="airport-soon"]')?.textContent).toBe(
      "En chantier, revenez plus tard !",
    );
    act(() => {
      root.unmount();
    });
  });
});
