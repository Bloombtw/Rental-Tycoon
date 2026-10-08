import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAR_MODELS,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  createGame,
  type GameState,
  type NewCar,
} from "@rt/sim";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { formatCents } from "./format.js";
import { PRICE_FORMAT_ERROR, PRICE_RANGE_ERROR } from "./game/messages.js";
import { formatCentsForInput } from "./game/parseEuros.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDLE: readonly NewCar[] = [
  { dailyPrice: 200_00, dailyCost: 30_00 },
  { dailyPrice: 160_00, dailyCost: 20_00 },
];
const FIXTURE: readonly NewCar[] = [{ dailyPrice: 60_00, dailyCost: 25_00 }];

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
  vi.restoreAllMocks();
});

function mount(node: ReactNode): void {
  act(() => {
    root.render(node);
  });
}

function mountApp(initialGame?: GameState): void {
  mount(initialGame ? <App initialGame={initialGame} /> : <App />);
}

function byId(id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing testid ${id}`);
  return el;
}
function maybeId(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}
function text(id: string): string {
  return byId(id).textContent;
}
function norm(s: string): string {
  return s.replace(/\s/g, " ");
}
function click(el: HTMLElement): void {
  act(() => {
    el.click();
  });
}
function clickId(id: string): void {
  click(byId(id));
}
function priceInput(carId: number): HTMLInputElement {
  const row = byId(`car-row-${carId}`);
  const input = row.querySelector("input");
  if (!input) throw new Error("no input");
  return input;
}
function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("no setter");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function apply(carId: number): void {
  const row = byId(`car-row-${carId}`);
  const btn = Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "Appliquer");
  if (!btn) throw new Error("no apply button");
  click(btn);
}
function setPrice(carId: number, value: string): void {
  type(priceInput(carId), value);
  apply(carId);
}
function pressEnter(input: HTMLInputElement): void {
  const form = input.closest("form");
  if (!form) throw new Error("no form");
  act(() => {
    form.requestSubmit();
  });
}
function assertClean(): void {
  const body = document.body.textContent;
  expect(body.length).toBeGreaterThan(0);
  for (const bad of ["NaN", "undefined", "Infinity", "[object", "null"]) {
    expect(body).not.toContain(bad);
  }
  expect(container.innerHTML).not.toBe("");
}
function cashText(): string {
  return norm(text("hud-cash"));
}

describe("App: launch", () => {
  it("shows day 1, 50 000,00 EUR, no report, welcome message", () => {
    mountApp();
    expect(text("hud-day")).toBe("Jour 1");
    expect(cashText()).toBe(norm(formatCents(50_000_00)));
    expect(cashText()).toBe("50 000,00 €");
    expect(byId("hud-cash").getAttribute("data-negative")).toBe("false");
    expect(text("hud-report")).toBe("Aucune journée écoulée.");
    expect(maybeId("fleet-empty")).not.toBeNull();
    expect(container.textContent).toContain(`Flotte 0/${MAX_FLEET_SIZE}`);
    expect(maybeId("error-banner")).toBeNull();
    expect(maybeId("notice")).toBeNull();
    assertClean();
  });

  it("works under StrictMode (double reducer calls)", () => {
    mount(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    clickId("buy-compact");
    expect(container.querySelectorAll('[data-testid^="car-row-"]')).toHaveLength(1);
    assertClean();
  });

  it("all three buy buttons enabled with the default cash", () => {
    mountApp();
    for (const id of ["used", "compact", "hybrid"]) {
      expect((byId(`buy-${id}`) as HTMLButtonElement).disabled).toBe(false);
    }
  });
});

describe("App: purchase and day flow", () => {
  it("buy compact: row, badge, price, cash, notice, no welcome", () => {
    mountApp();
    clickId("buy-compact");
    const row = byId("car-row-1");
    expect(row.textContent).toContain("Citadine neuve");
    expect(row.textContent).toContain("Au parking");
    expect(norm(row.textContent)).toContain(norm(formatCents(60_00)));
    expect(cashText()).toBe(norm(formatCents(50_000_00 - CAR_MODELS.compact.purchasePrice)));
    expect(cashText()).toBe("41 000,00 €");
    expect(byId("notice").closest('[role="status"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      byId("notice").textContent,
    );
    expect(maybeId("fleet-empty")).toBeNull();
    assertClean();
  });

  it("then next day: Jour 2, Louée, report", () => {
    mountApp();
    clickId("buy-compact");
    clickId("next-day");
    expect(text("hud-day")).toBe("Jour 2");
    expect(byId("car-row-1").textContent).toContain("Louée");
    expect(norm(text("hud-report"))).toBe(
      norm(
        `Hier : recettes ${formatCents(60_00)} · charges ${formatCents(25_00)} · résultat +${formatCents(35_00)}`,
      ),
    );
    expect(byId("hud-report").getAttribute("data-sign")).toBe("positive");
    expect(norm(text("notice"))).toContain("Jour 1 terminé");
    assertClean();
  });

  it("set price 150 shows 150,00 EUR and a notice", () => {
    mountApp();
    clickId("buy-compact");
    setPrice(1, "150");
    expect(norm(byId("car-row-1").textContent)).toContain(norm(formatCents(150_00)));
    expect(text("notice")).toContain("Prix de la voiture n°1");
    expect(priceInput(1).value).toBe("150,00");
    assertClean();
  });

  it("Enter in the field submits", () => {
    mountApp();
    clickId("buy-compact");
    type(priceInput(1), "99,5");
    pressEnter(priceInput(1));
    expect(norm(byId("car-row-1").textContent)).toContain(norm(formatCents(99_50)));
  });

  it("price above the sim acceptance threshold leaves the car parked the next day", () => {
    mountApp();
    clickId("buy-compact");
    setPrice(1, "150,01");
    clickId("next-day");
    expect(byId("car-row-1").textContent).toContain("Au parking");
    expect(byId("hud-report").getAttribute("data-sign")).toBe("negative");
    expect(norm(text("hud-report"))).toContain(
      `résultat ${formatCents(-25_00)}`.replace(/\s/g, " "),
    );
  });

  it("zero result is shown without + sign and data-sign zero", () => {
    mountApp(createGame(1, 100, [{ dailyPrice: 25_00, dailyCost: 25_00 }]));
    clickId("next-day");
    expect(byId("hud-report").getAttribute("data-sign")).toBe("zero");
    expect(text("hud-report")).not.toContain("+");
    assertClean();
  });

  it("dismissing the banner removes it", () => {
    mountApp();
    clickId("buy-compact");
    const close = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Fermer",
    );
    expect(close).toBeDefined();
    click(close as HTMLElement);
    expect(maybeId("notice")).toBeNull();
  });
});

describe("App: price field attacks", () => {
  const LONG = "9".repeat(10_000);
  const cases: ReadonlyArray<[string, string, string]> = [
    ["empty", "", "format"],
    ["spaces", "   ", "format"],
    ["exponent", "1e3", "format"],
    ["hex", "0x10", "format"],
    ["minus", "-5", "format"],
    ["plus", "+5", "format"],
    ["3 decimals", "1.234", "format"],
    ["two separators", "1,5,0", "format"],
    ["arabic digits", "١٢٣", "format"],
    ["infinity glyph", "∞", "format"],
    ["letters", "abc", "format"],
    ["NaN", "NaN", "format"],
    ["html", "<img src=x onerror=alert(1)>", "format"],
    ["sql", "1; DROP TABLE cars;--", "format"],
    ["emoji", "🚗🚗", "format"],
    ["internal space", "1 000", "format"],
    ["very long", LONG, "format"],
    ["max + 1 cent", formatCentsForInput(MAX_CAR_DAILY_PRICE + 1), "range"],
    ["huge but 7 digits", "9999999", "range"],
  ];

  it.each(cases)("%s -> inline error, aria-invalid, nothing dispatched", (_n, value, kind) => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    const cashBefore = cashText();
    const priceBefore = norm(byId("car-row-1").querySelector(".car-meta")?.textContent ?? "");
    setPrice(1, value);
    const err = byId("price-error-1");
    expect(err.textContent).toBe(kind === "range" ? PRICE_RANGE_ERROR : PRICE_FORMAT_ERROR);
    expect(priceInput(1).getAttribute("aria-invalid")).toBe("true");
    expect(maybeId("error-banner")).toBeNull();
    expect(maybeId("notice")).toBeNull();
    expect(cashText()).toBe(cashBefore);
    expect(norm(byId("car-row-1").querySelector(".car-meta")?.textContent ?? "")).toBe(priceBefore);
    assertClean();
  });

  it("the input enforces maxLength 10 and has a label", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    const input = priceInput(1);
    expect(input.maxLength).toBe(10);
    expect(container.textContent).toContain("Prix par jour (€)");
    const label = container.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toBe("Prix par jour (€)");
  });

  it("MAX_CAR_DAILY_PRICE is accepted", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    setPrice(1, formatCentsForInput(MAX_CAR_DAILY_PRICE));
    expect(maybeId("price-error-1")).toBeNull();
    expect(norm(byId("car-row-1").textContent)).toContain(norm(formatCents(MAX_CAR_DAILY_PRICE)));
  });

  it("0 is accepted", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    setPrice(1, "0");
    expect(maybeId("price-error-1")).toBeNull();
    expect(norm(byId("car-row-1").textContent)).toContain(norm(formatCents(0)));
  });

  it("an invalid then a valid entry clears the inline error and aria-invalid", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    setPrice(1, "abc");
    expect(maybeId("price-error-1")).not.toBeNull();
    setPrice(1, "70");
    expect(maybeId("price-error-1")).toBeNull();
    expect(priceInput(1).getAttribute("aria-invalid")).toBe("false");
  });

  it("typed value with padding spaces is accepted", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    setPrice(1, "  70  ");
    expect(maybeId("price-error-1")).toBeNull();
    expect(norm(byId("car-row-1").textContent)).toContain(norm(formatCents(70_00)));
  });

  it("the field resyncs to the sim price after a valid entry typed in a loose format", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    setPrice(1, "7");
    expect(priceInput(1).value).toBe("7,00");
  });

  it("re-submitting the unchanged price normalises the field text to the sim price", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    setPrice(1, "60");
    expect(priceInput(1).value).toBe(formatCentsForInput(60_00));
    expect(priceInput(1).value).toBe("60,00");
  });
});

describe("App: buying limits", () => {
  it("3_999_99: used disabled with 'Fonds insuffisants', all three disabled", () => {
    mountApp(createGame(1, CAR_MODELS.used.purchasePrice - 1));
    const used = byId("buy-used") as HTMLButtonElement;
    expect(used.disabled).toBe(true);
    expect(used.parentElement?.textContent).toContain("Fonds insuffisants");
    for (const id of ["used", "compact", "hybrid"]) {
      const btn = byId(`buy-${id}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      const ref = btn.getAttribute("aria-describedby");
      expect(ref).toBeTruthy();
      expect(document.getElementById(ref ?? "")?.textContent).toBe("Fonds insuffisants");
    }
  });

  it("enabled buy buttons carry no aria-describedby", () => {
    mountApp();
    for (const id of ["used", "compact", "hybrid"]) {
      expect(byId(`buy-${id}`).hasAttribute("aria-describedby")).toBe(false);
    }
  });

  it("cash exactly the used price enables only used", () => {
    mountApp(createGame(1, CAR_MODELS.used.purchasePrice));
    expect((byId("buy-used") as HTMLButtonElement).disabled).toBe(false);
    expect((byId("buy-compact") as HTMLButtonElement).disabled).toBe(true);
  });

  it("50 cars: all buy buttons disabled, Flotte 50/50, 'Flotte complète'", () => {
    const fleet = Array.from({ length: MAX_FLEET_SIZE }, () => ({
      dailyPrice: 100_00,
      dailyCost: 1_00,
    }));
    mountApp(createGame(1, 10 ** 12, fleet));
    for (const id of ["used", "compact", "hybrid"]) {
      const btn = byId(`buy-${id}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      const ref = btn.getAttribute("aria-describedby");
      expect(ref).toBeTruthy();
      expect(document.getElementById(ref ?? "")?.textContent).toBe(
        `Flotte complète (${MAX_FLEET_SIZE}/${MAX_FLEET_SIZE})`,
      );
    }
    expect(container.textContent).toContain(`Flotte ${MAX_FLEET_SIZE}/${MAX_FLEET_SIZE}`);
    expect(container.textContent).toContain("Flotte complète");
    expect(container.querySelectorAll('[data-testid^="car-row-"]')).toHaveLength(MAX_FLEET_SIZE);
    assertClean();
  });

  it("spam-clicking buy-used until broke: stops at the limit, button disabled, no error banner", () => {
    mountApp();
    const expected = Math.floor(50_000_00 / CAR_MODELS.used.purchasePrice);
    for (let i = 0; i < 40; i++) clickId("buy-used");
    expect(container.querySelectorAll('[data-testid^="car-row-"]')).toHaveLength(expected);
    expect((byId("buy-used") as HTMLButtonElement).disabled).toBe(true);
    expect(maybeId("error-banner")).toBeNull();
    assertClean();
  });

  it("reaching 50 cars one purchase at a time, then the 51st is impossible via UI", () => {
    mountApp(createGame(1, 10 ** 12));
    for (let i = 0; i < MAX_FLEET_SIZE + 5; i++) clickId("buy-used");
    expect(container.querySelectorAll('[data-testid^="car-row-"]')).toHaveLength(MAX_FLEET_SIZE);
    expect(container.textContent).toContain(`Flotte ${MAX_FLEET_SIZE}/${MAX_FLEET_SIZE}`);
    assertClean();
  });

  it("negative cash disables everything and still renders", () => {
    mountApp({ ...createGame(1), cash: -10_00 });
    for (const id of ["used", "compact", "hybrid"]) {
      expect((byId(`buy-${id}`) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(byId("hud-cash").getAttribute("data-negative")).toBe("true");
    assertClean();
  });
});

describe("App: next day", () => {
  it("IDLE fleet: cash goes negative, data-negative, negative report", () => {
    mountApp(createGame(1, 0, IDLE));
    clickId("next-day");
    expect(byId("hud-cash").getAttribute("data-negative")).toBe("true");
    expect(cashText()).toBe(norm(formatCents(-50_00)));
    expect(byId("hud-report").getAttribute("data-sign")).toBe("negative");
    expect(norm(text("hud-report"))).toContain(norm(`résultat ${formatCents(-50_00)}`));
    assertClean();
  });

  it("cash exactly 0 is not negative", () => {
    mountApp(createGame(1, 0));
    expect(byId("hud-cash").getAttribute("data-negative")).toBe("false");
  });

  it("50 rapid clicks advance exactly 50 days", () => {
    mountApp();
    for (let i = 0; i < 50; i++) clickId("next-day");
    expect(text("hud-day")).toBe("Jour 51");
    assertClean();
  });

  it("overflow edge: error banner, game displayed unchanged", () => {
    mountApp(createGame(1, Number.MAX_SAFE_INTEGER, [{ dailyPrice: 100_00, dailyCost: 1_00 }]));
    const cashBefore = cashText();
    clickId("next-day");
    const banner = byId("error-banner");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("limite numérique");
    expect(text("hud-day")).toBe("Jour 1");
    expect(cashText()).toBe(cashBefore);
    assertClean();
  });

  it("an extreme cash renders formatted, not as exponent or NaN", () => {
    mountApp(createGame(1, Number.MAX_SAFE_INTEGER));
    assertClean();
    expect(text("hud-cash")).not.toMatch(/e\+/i);
  });
});

describe("App: fixtures and robustness", () => {
  it("fixture car without model: title 'Voiture n°1'", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    const title = byId("car-row-1").querySelector("h3");
    expect(title?.textContent).toBe("Voiture n°1");
    assertClean();
  });

  it("badge has the tooltip", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    expect(
      byId("car-row-1").querySelector('[title="Statut du dernier jour simulé"]'),
    ).not.toBeNull();
  });

  it("a hostile hand-built state (corrupt model, NaN price) never crashes or prints NaN", () => {
    const g: GameState = {
      ...createGame(1),
      cash: NaN,
      day: NaN,
      lastDay: { revenue: NaN, costs: Infinity },
      fleet: [
        {
          id: 1,
          model: "__proto__" as unknown as "used",
          dailyPrice: 5_00,
          dailyCost: Infinity,
          rented: false,
        },
        { id: NaN, dailyPrice: -1, dailyCost: 1.5, rented: true },
      ],
    };
    mountApp(g);
    assertClean();
  });

  it("a corrupted car with dailyPrice NaN does not loop forever in PriceEditor (re-render guard)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const g: GameState = {
      ...createGame(1),
      fleet: [{ id: 1, dailyPrice: NaN, dailyCost: 1_00, rented: false }],
    };
    // Even with a corrupted state, the page must render (or be caught by the boundary), but
    // must never throw "Too many re-renders" out of render without a boundary.
    expect(() => {
      mountApp(g);
    }).not.toThrow();
    assertClean();
  });

  it("a hostile model name 'toString' does not render a function body", () => {
    const g: GameState = {
      ...createGame(1),
      fleet: [
        {
          id: 1,
          model: "toString" as unknown as "used",
          dailyPrice: 1,
          dailyCost: 1,
          rented: false,
        },
      ],
    };
    mountApp(g);
    assertClean();
    expect(container.textContent).not.toContain("function");
  });

  it("the whole page never renders html injected through text (no raw script nodes)", () => {
    mountApp();
    clickId("buy-used");
    expect(container.querySelector("script")).toBeNull();
  });

  it("no raw hex colours in rendered inline styles", () => {
    mountApp(createGame(1, 50_000_00, FIXTURE));
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("ErrorBoundary", () => {
  function Bomb(): ReactNode {
    throw new Error("render boom");
  }

  it("shows the French fallback instead of a blank screen", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain(
      "Une erreur inattendue est survenue. Rechargez la page pour recommencer.",
    );
    expect(container.innerHTML).not.toBe("");
  });

  it("renders children when nothing fails", () => {
    mount(
      <ErrorBoundary>
        <p data-testid="ok">fine</p>
      </ErrorBoundary>,
    );
    expect(text("ok")).toBe("fine");
  });

  it("catches a crash coming from App given a poisoned initialGame", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const poisoned = {
      seed: 1,
      rngState: 1,
      day: 0,
      cash: 0,
      lastDay: null,
    } as unknown as GameState;
    mount(
      <ErrorBoundary>
        <App initialGame={poisoned} />
      </ErrorBoundary>,
    );
    expect(container.innerHTML).not.toBe("");
    expect(container.textContent).not.toBe("");
  });
});
