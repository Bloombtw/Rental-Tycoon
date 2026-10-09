import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { DayRecord } from "@rt/sim";
import { StatsPanel } from "./StatsPanel.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement | null = null;
function mount(history: unknown, stats: unknown): HTMLElement {
  const el = document.createElement("div");
  host = el;
  document.body.append(el);
  act(() => {
    createRoot(el).render(
      <StatsPanel
        history={history as readonly DayRecord[]}
        modelStats={stats as Record<string, { rentals: number; revenue: number }>}
      />,
    );
  });
  return el;
}
afterEach(() => {
  host?.remove();
});
const day = (d: number): DayRecord => ({ day: d, revenue: d * 100, costs: d * 50, cash: d * 1000 });

describe("StatsPanel", () => {
  it("shows the empty state", () => {
    const el = mount([], {});
    expect(el.textContent).toContain("Les statistiques arrivent après ta première journée.");
  });
  it("caps the line at 30 points and the bars at 14 days", () => {
    const el = mount(
      Array.from({ length: 40 }, (_, i) => day(i + 1)),
      {},
    );
    expect(el.querySelectorAll('[data-testid="stats-point"]')).toHaveLength(30);
    expect(el.querySelectorAll('[data-testid="stats-bar"]')).toHaveLength(28);
  });
  it("sorts models by revenue and labels other", () => {
    const el = mount([day(1)], {
      other: { rentals: 1, revenue: 100 },
      compact: { rentals: 2, revenue: 900 },
    });
    const rows = [...el.querySelectorAll('[data-testid="stats-row"]')];
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain("Autres");
  });
  it("never renders NaN or undefined with hostile values", () => {
    const el = mount([{ day: 1, revenue: NaN, costs: -5, cash: Infinity }, day(2)], {
      other: { rentals: 0, revenue: NaN },
      x: { rentals: -3, revenue: -9 },
    });
    expect(el.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
  });
});
