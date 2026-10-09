import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Car } from "@rt/sim";
import { CarRow } from "./CarRow.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE: Car = {
  id: 3,
  model: "compact",
  dailyPrice: 60_00,
  dailyCost: 10_00,
  rented: false,
};

let container: HTMLElement;
let root: Root;
const handlers = {
  onSetPrice: vi.fn(),
  onRepair: vi.fn(),
  onService: vi.fn(),
  onSell: vi.fn(),
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  for (const fn of Object.values(handlers)) fn.mockClear();
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

function show(car: Car, sellable = true): void {
  act(() => {
    root.render(
      <ul>
        <CarRow car={car} sellable={sellable} {...handlers} />
      </ul>,
    );
  });
}
const q = (id: string): HTMLElement | null => document.body.querySelector(`[data-testid="${id}"]`);
const norm = (s: string): string => s.replace(/\s/g, " ");
function click(el: HTMLElement | null): void {
  if (!el) throw new Error("missing element");
  act(() => {
    el.click();
  });
}
function assertClean(): void {
  for (const bad of ["NaN", "undefined", "Infinity", "[object"]) {
    expect(document.body.textContent).not.toContain(bad);
  }
}

describe("CarRow wear display", () => {
  it("a new car (no wear fields): 0 j, 100 %, only the sell button", () => {
    show(BASE);
    expect(q("car-age-3")?.textContent).toBe("0 j");
    expect(q("car-condition-3")?.textContent).toContain("100 %");
    expect(q("car-condition-3")?.getAttribute("data-tone")).toBe("good");
    expect(q("car-repair-3")).toBeNull();
    expect(q("car-service-3")).toBeNull();
    expect(norm(q("car-sell-3")?.textContent ?? "")).toMatch(/^Vendre · .*€$/);
    expect(q("car-broken-3")).toBeNull();
    assertClean();
  });

  it("a worn car shows its age, the condition tone and the service button", () => {
    show({ ...BASE, age: 12, condition: 55 });
    expect(q("car-age-3")?.textContent).toBe("12 j");
    expect(q("car-condition-3")?.textContent).toContain("55 %");
    expect(q("car-condition-3")?.getAttribute("data-tone")).toBe("warn");
    expect(norm(q("car-service-3")?.textContent ?? "")).toMatch(/^Entretien · .*€$/);
    expect(q("car-repair-3")).toBeNull();
    show({ ...BASE, age: 40, condition: 20 });
    expect(q("car-condition-3")?.getAttribute("data-tone")).toBe("bad");
  });

  it("a broken car: badge, status, repair button, no service button", () => {
    show({ ...BASE, broken: true, condition: 30, outcome: "broken" });
    expect(q("car-broken-3")?.textContent).toBe("En panne");
    expect(q("car-row-3")?.textContent).toContain("Au parking · en panne");
    expect(norm(q("car-repair-3")?.textContent ?? "")).toMatch(/^Réparer · .*€$/);
    expect(q("car-service-3")).toBeNull();
    click(q("car-repair-3"));
    expect(handlers.onRepair).toHaveBeenCalledWith(3);
    assertClean();
  });

  it("the service button calls onService", () => {
    show({ ...BASE, condition: 80 });
    click(q("car-service-3"));
    expect(handlers.onService).toHaveBeenCalledWith(3);
  });

  it("corrupted wear fields never print NaN or undefined", () => {
    show({ ...BASE, age: NaN, condition: Infinity } as unknown as Car);
    assertClean();
    show({ ...BASE, age: -4, condition: "x" } as unknown as Car);
    assertClean();
  });

  it("keeps the tutorial hook on the price editor", () => {
    show(BASE);
    expect(document.body.querySelector('[data-tutorial="price-editor"]')).not.toBeNull();
  });

  it("action buttons are real buttons with a visible label", () => {
    show({ ...BASE, broken: true, condition: 10 });
    const row = q("car-row-3");
    const labels = Array.from(row?.querySelectorAll(".car-actions button") ?? []).map((b) =>
      norm(b.textContent),
    );
    expect(labels).toHaveLength(2);
    for (const l of labels) expect(l.length).toBeGreaterThan(3);
  });
});

describe("CarRow sell flow", () => {
  it("asks for confirmation, then sells", () => {
    show({ ...BASE, age: 10, condition: 90 });
    click(q("car-sell-3"));
    const dialog = q("sell-dialog");
    expect(dialog).not.toBeNull();
    expect(norm(dialog?.querySelector("h2")?.textContent ?? "")).toMatch(
      /^Vendre la voiture n°3 pour .+ € \?$/,
    );
    expect(handlers.onSell).not.toHaveBeenCalled();
    click(q("sell-confirm"));
    expect(handlers.onSell).toHaveBeenCalledWith(3);
    expect(q("sell-dialog")).toBeNull();
  });

  it("cancel (button, backdrop, Escape) sells nothing", () => {
    show(BASE);
    click(q("car-sell-3"));
    click(q("sell-cancel"));
    expect(q("sell-dialog")).toBeNull();

    click(q("car-sell-3"));
    click(q("sell-dialog-backdrop"));
    expect(q("sell-dialog")).toBeNull();

    click(q("car-sell-3"));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(q("sell-dialog")).toBeNull();
    expect(handlers.onSell).not.toHaveBeenCalled();
  });

  it("focus moves to Cancel and Tab stays inside the dialog", () => {
    show(BASE);
    click(q("car-sell-3"));
    expect(document.activeElement).toBe(q("sell-cancel"));
    q("sell-confirm")?.focus();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(q("sell-cancel"));
  });

  it("the sell button is disabled with a visible reason while the car is rented out", () => {
    show({ ...BASE, rented: true }, false);
    const btn = q("car-sell-3") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(q("car-row-3")?.textContent).toContain("En location : vente impossible");
    click(btn);
    expect(q("sell-dialog")).toBeNull();
    expect(handlers.onSell).not.toHaveBeenCalled();
  });

  it("an open dialog cannot confirm once the car left on a rental", () => {
    show(BASE);
    click(q("car-sell-3"));
    show({ ...BASE, rented: true }, false);
    expect((q("sell-confirm") as HTMLButtonElement).disabled).toBe(true);
    click(q("sell-confirm"));
    expect(handlers.onSell).not.toHaveBeenCalled();
  });
});
