import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_PARKING_SPOTS,
  CAR_MODELS,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  UPGRADES,
  createGame,
  type GameState,
  type NewCar,
} from "@rt/sim";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { formatCents } from "./format.js";
import { memoryStorage } from "./game/fakeStorage.js";
import { PRICE_FORMAT_ERROR, PRICE_RANGE_ERROR } from "./game/messages.js";
import { formatCentsForInput } from "./game/parseEuros.js";
import type { ClockDriver } from "./game/useGameClock.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDLE: readonly NewCar[] = [
  { dailyPrice: 200_00, dailyCost: 30_00 },
  { dailyPrice: 160_00, dailyCost: 20_00 },
];
const FIXTURE: readonly NewCar[] = [{ dailyPrice: 60_00, dailyCost: 25_00 }];

let container: HTMLElement;
let root: Root;

/** Manual animation-frame clock: nothing moves unless a test calls `frames`. */
interface ManualDriver extends ClockDriver {
  /** Runs `n` animation frames of `stepMs` real milliseconds each. */
  frames(n: number, stepMs?: number): void;
  scheduled(): number;
}
function makeDriver(): ManualDriver {
  let now = 0;
  let nextId = 1;
  const queue = new Map<number, () => void>();
  return {
    now: () => now,
    requestFrame: (cb) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    cancelFrame: (id) => {
      queue.delete(id);
    },
    scheduled: () => queue.size,
    frames(n, stepMs = 100) {
      for (let i = 0; i < n; i++) {
        now += stepMs;
        const due = Array.from(queue.entries());
        queue.clear();
        act(() => {
          for (const [, cb] of due) cb();
        });
      }
    },
  };
}
let driver: ManualDriver;

/** Runs frames until the HUD clock text satisfies `until` (bounded). */
function runUntil(until: (clock: string) => boolean, stepMs = 100, maxFrames = 20_000): void {
  for (let i = 0; i < maxFrames; i++) {
    if (until(text("hud-clock"))) return;
    driver.frames(1, stepMs);
  }
  throw new Error(`clock never reached the target, stuck at ${text("hud-clock")}`);
}
/** Starts time at x1 (or the given speed) and runs until the next opening (day number N). */
function playUntilDay(dayNumber: number, speedId = "speed-1", stepMs = 100): void {
  clickId(speedId);
  runUntil((c) => c.startsWith(`Jour ${dayNumber} `), stepMs);
}

beforeEach(() => {
  // jsdom has no canvas: silence its "not implemented" noise; WebGL stays unavailable.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  driver = makeDriver();
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

/** Full parking (50 places) so purchases are limited by cash or MAX_FLEET_SIZE only. */
function roomy(g: GameState): GameState {
  return { ...g, upgrades: { ...g.upgrades, parking: UPGRADES.parking.maxLevel } };
}

function mountApp(initialGame?: GameState): void {
  mount(
    // Isolated storage and a fixed seed: no test touches the real localStorage.
    initialGame ? (
      <App
        initialGame={initialGame}
        clockDriver={driver}
        storage={memoryStorage()}
        newSeed={() => 1}
      />
    ) : (
      <App clockDriver={driver} storage={memoryStorage()} newSeed={() => 1} />
    ),
  );
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
/** The "Hier : ..." report line, without the trailing "Aujourd'hui" part. */
function reportText(): string {
  const today = maybeId("hud-today")?.textContent ?? "";
  return norm(text("hud-report").replace(today, ""));
}
function cashText(): string {
  return norm(text("hud-cash"));
}

describe("App: launch", () => {
  it("shows Jour 1 · 09:00, paused with Reprendre highlighted, 50 000,00 EUR, no report", () => {
    mountApp();
    expect(text("hud-clock")).toBe("Jour 1 · 09:00");
    expect(maybeId("hud-day")).toBeNull();
    expect(maybeId("next-day")).toBeNull();
    expect(text("speed-pause")).toBe("Reprendre");
    expect(byId("speed-pause").getAttribute("aria-pressed")).toBe("true");
    expect(byId("speed-pause").getAttribute("data-highlight")).toBe("true");
    expect(byId("speed-1").getAttribute("aria-pressed")).toBe("true");
    expect(byId("drawer-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(maybeId("agency-fallback")).not.toBeNull();
    expect(cashText()).toBe(norm(formatCents(50_000_00)));
    expect(cashText()).toBe("50 000,00 €");
    expect(byId("hud-cash").getAttribute("data-negative")).toBe("false");
    expect(reportText()).toBe("Aucune journée écoulée.");
    expect(norm(text("hud-today"))).toContain("Aujourd'hui : +0,00 €");
    expect(maybeId("fleet-empty")).not.toBeNull();
    expect(container.textContent).toContain(`Flotte 0/${BASE_PARKING_SPOTS}`);
    expect(maybeId("error-banner")).toBeNull();
    expect(maybeId("notice")).toBeNull();
    assertClean();
  });

  it("works under StrictMode (double reducer calls)", () => {
    mount(
      <StrictMode>
        <App storage={memoryStorage()} newSeed={() => 1} />
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

  it("then a full day at x1: Jour 2, Louée, report, toast", () => {
    mountApp();
    clickId("buy-compact");
    playUntilDay(2);
    expect(text("hud-clock").startsWith("Jour 2 · 09:0")).toBe(true);
    expect(norm(text("day-banner"))).toBe("Jour 2 : l'agence ouvre ! Hier : +35,00 €");
    expect(byId("day-banner").getAttribute("role")).toBe("status");
    expect(byId("car-row-1").textContent).toContain("Louée");
    expect(reportText()).toBe(
      norm(
        `Hier : recettes ${formatCents(60_00)} · charges ${formatCents(25_00)} · résultat +${formatCents(35_00)}`,
      ),
    );
    expect(byId("hud-report").getAttribute("data-sign")).toBe("positive");
    expect(norm(text("notice"))).not.toContain("terminé");
    assertClean();
  });

  it("cash rises live at the departure, costs are only taken at closing", () => {
    mountApp();
    clickId("buy-compact");
    const afterBuy = 50_000_00 - CAR_MODELS.compact.purchasePrice;
    clickId("speed-1");
    runUntil((c) => c !== "Jour 1 · 09:00", 100);
    expect(cashText()).toBe(norm(formatCents(afterBuy + 60_00)));
    expect(norm(text("hud-today"))).toContain(`Aujourd'hui : +${norm(formatCents(60_00))}`);
    runUntil((c) => c === "Jour 1 · 20:59" || c.startsWith("Jour 2"), 100);
    runUntil((c) => c.startsWith("Jour 2"), 100);
    expect(cashText()).toBe(norm(formatCents(afterBuy + 60_00 - 25_00)));
  });

  it("time only moves while running: x1 for 1 s is 25 minutes, x10 is 250, pause freezes", () => {
    mountApp();
    driver.frames(20);
    expect(text("hud-clock")).toBe("Jour 1 · 09:00");
    clickId("speed-1");
    driver.frames(10);
    expect(text("hud-clock")).toBe("Jour 1 · 09:25");
    clickId("speed-pause");
    expect(text("speed-pause")).toBe("Reprendre");
    driver.frames(50);
    expect(text("hud-clock")).toBe("Jour 1 · 09:25");
    clickId("speed-10");
    expect(text("speed-pause")).toBe("Pause");
    driver.frames(10);
    expect(text("hud-clock")).toBe("Jour 1 · 13:35");
  });

  it("a 10 s hung frame advances at most 250 ms worth", () => {
    mountApp();
    clickId("speed-1");
    driver.frames(1, 10_000);
    driver.frames(1, 100);
    expect(text("hud-clock")).toBe("Jour 1 · 09:08");
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
    playUntilDay(2);
    expect(byId("car-row-1").textContent).toContain("Au parking");
    expect(byId("hud-report").getAttribute("data-sign")).toBe("negative");
    expect(norm(text("hud-report"))).toContain(
      `résultat ${formatCents(-25_00)}`.replace(/\s/g, " "),
    );
  });

  it("zero result is shown without + sign and data-sign zero", () => {
    mountApp(createGame(1, 100, [{ dailyPrice: 25_00, dailyCost: 25_00 }]));
    playUntilDay(2);
    expect(byId("hud-report").getAttribute("data-sign")).toBe("zero");
    expect(reportText()).not.toContain("+");
    assertClean();
  });

  it("dismissing the banner removes it", () => {
    mountApp();
    clickId("buy-compact");
    // The close control is an icon button: same accessible name, no visible text.
    const close = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Fermer",
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
    mountApp(roomy(createGame(1)));
    const expected = Math.floor(50_000_00 / CAR_MODELS.used.purchasePrice);
    for (let i = 0; i < 40; i++) clickId("buy-used");
    expect(container.querySelectorAll('[data-testid^="car-row-"]')).toHaveLength(expected);
    expect((byId("buy-used") as HTMLButtonElement).disabled).toBe(true);
    expect(maybeId("error-banner")).toBeNull();
    assertClean();
  });

  it("reaching 50 cars one purchase at a time, then the 51st is impossible via UI", () => {
    mountApp(roomy(createGame(1, 10 ** 12)));
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

describe("App: days go by", () => {
  it("IDLE fleet: cash goes negative, data-negative, negative report", () => {
    mountApp(createGame(1, 0, IDLE));
    playUntilDay(2);
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

  it("30 days at x10 with 50 cars: Jour 31, one toast at a time, still clean", () => {
    const fleet = Array.from({ length: MAX_FLEET_SIZE }, () => ({
      dailyPrice: 100_00,
      dailyCost: 1_00,
    }));
    mountApp(createGame(1, 0, fleet));
    clickId("speed-10");
    let maxToasts = 0;
    runUntil((c) => {
      maxToasts = Math.max(
        maxToasts,
        container.querySelectorAll('[data-testid="day-banner"]').length,
      );
      return c.startsWith("Jour 31 ");
    }, 100);
    expect(maxToasts).toBe(1);
    expect(container.querySelectorAll('[data-testid="day-banner"]')).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="agency-view"]')?.getAttribute("data-car-sprites"),
    ).toBe(String(MAX_FLEET_SIZE));
    assertClean();
  }, 20_000); // ~2160 committed frames rendering the full HUD: slow under jsdom

  it("a long hung frame at x10 never skips a closing: the report is still consistent", () => {
    mountApp(createGame(1, 0, IDLE));
    clickId("speed-10");
    for (let i = 0; i < 40; i++) driver.frames(1, 5_000);
    const m = /^Jour (\d+) · /.exec(text("hud-clock"));
    expect(m).not.toBeNull();
    const day = Number(m?.[1]) - 1;
    expect(cashText()).toBe(norm(formatCents(-50_00 * day)));
    assertClean();
  });

  it("overflow edge: one error banner, game unchanged, time paused", () => {
    mountApp(createGame(1, Number.MAX_SAFE_INTEGER, [{ dailyPrice: 100_00, dailyCost: 1_00 }]));
    const cashBefore = cashText();
    clickId("speed-10");
    driver.frames(30);
    const banners = container.querySelectorAll('[data-testid="error-banner"]');
    expect(banners).toHaveLength(1);
    expect(banners[0]?.getAttribute("role")).toBe("alert");
    expect(banners[0]?.textContent).toContain("limite numérique");
    expect(text("hud-clock")).toBe("Jour 1 · 09:00");
    expect(cashText()).toBe(cashBefore);
    expect(text("speed-pause")).toBe("Reprendre");
    expect(byId("speed-pause").getAttribute("aria-pressed")).toBe("true");
    // BUG (useGameClock): the commit that triggers the pause runs inside the frame callback, so
    // the cleanup finds no frame to cancel and the loop then reschedules itself.
    expect(driver.scheduled()).toBe(0);
    assertClean();
  });

  it("an extreme cash renders formatted, not as exponent or NaN", () => {
    mountApp(createGame(1, Number.MAX_SAFE_INTEGER));
    assertClean();
    expect(text("hud-cash")).not.toMatch(/e\+/i);
  });
});

describe("App: speed controls", () => {
  it("a group with a label; every button is a pressed-toggle", () => {
    mountApp();
    const group = container.querySelector('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe("Vitesse du temps");
    for (const id of ["speed-pause", "speed-1", "speed-2", "speed-4", "speed-10"]) {
      expect(["true", "false"]).toContain(byId(id).getAttribute("aria-pressed"));
    }
  });

  it("choosing a speed resumes, marks it pressed, un-marks the others, drops the highlight", () => {
    mountApp();
    clickId("speed-4");
    expect(byId("speed-4").getAttribute("aria-pressed")).toBe("true");
    for (const id of ["speed-1", "speed-2", "speed-10"]) {
      expect(byId(id).getAttribute("aria-pressed")).toBe("false");
    }
    expect(text("speed-pause")).toBe("Pause");
    expect(byId("speed-pause").getAttribute("aria-pressed")).toBe("false");
    expect(byId("speed-pause").getAttribute("data-highlight")).toBe("false");
  });

  it("pause keeps the chosen speed pressed; tapping the active speed resumes", () => {
    mountApp();
    clickId("speed-2");
    clickId("speed-pause");
    expect(byId("speed-2").getAttribute("aria-pressed")).toBe("true");
    expect(text("speed-pause")).toBe("Reprendre");
    expect(byId("speed-pause").getAttribute("data-highlight")).toBe("false"); // time has run
    clickId("speed-2");
    expect(text("speed-pause")).toBe("Pause");
  });

  it("hammering the buttons never breaks the clock or the page", () => {
    mountApp();
    for (let i = 0; i < 200; i++) {
      clickId(["speed-1", "speed-2", "speed-4", "speed-10", "speed-pause"][i % 5] as string);
      if (i % 7 === 0) driver.frames(1);
    }
    assertClean();
    expect(text("hud-clock")).toMatch(/^Jour \d+ · \d\d:\d\d$/);
  });

  it("every speed button is at least a button element with an accessible name", () => {
    mountApp();
    for (const id of ["speed-pause", "speed-1", "speed-2", "speed-4", "speed-10"]) {
      const b = byId(id);
      expect(b.tagName).toBe("BUTTON");
      expect((b.textContent ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("App: hidden page and unmount", () => {
  function setVisibility(state: "hidden" | "visible"): void {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }
  afterEach(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("hiding the page pauses, and the game stays paused when the page comes back", () => {
    mountApp();
    clickId("speed-1");
    driver.frames(5);
    const before = text("hud-clock");
    setVisibility("hidden");
    expect(text("speed-pause")).toBe("Reprendre");
    setVisibility("visible");
    expect(text("speed-pause")).toBe("Reprendre");
    driver.frames(20);
    expect(text("hud-clock")).toBe(before);
  });

  it("pagehide pauses too, and hiding while already paused changes nothing", () => {
    mountApp();
    setVisibility("hidden");
    expect(text("speed-pause")).toBe("Reprendre");
    expect(byId("speed-pause").getAttribute("data-highlight")).toBe("true");
    clickId("speed-1");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(text("speed-pause")).toBe("Reprendre");
  });

  it("unmounting (also under StrictMode) leaves no scheduled frame and no canvas", () => {
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    mount(
      <StrictMode>
        <App clockDriver={driver} storage={memoryStorage()} newSeed={() => 1} />
      </StrictMode>,
    );
    clickId("speed-10");
    driver.frames(3);
    expect(driver.scheduled()).toBe(1);
    act(() => {
      root.unmount();
    });
    expect(driver.scheduled()).toBe(0);
    expect(container.querySelector("canvas")).toBeNull();
    root = createRoot(container);
  });

  it("pausing cancels the pending frame", () => {
    mountApp();
    clickId("speed-1");
    driver.frames(2);
    expect(driver.scheduled()).toBe(1);
    clickId("speed-pause");
    expect(driver.scheduled()).toBe(0);
  });

  it("switching speed does not leave two loops running", () => {
    mountApp();
    for (const id of ["speed-1", "speed-2", "speed-4", "speed-10", "speed-1"]) clickId(id);
    expect(driver.scheduled()).toBe(1);
  });
});

describe("App: drawer and view", () => {
  it("opens at launch; the handle collapses and expands it and hides the content", () => {
    mountApp();
    const toggle = byId("drawer-toggle");
    const content = container.querySelector<HTMLElement>("#drawer-content");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(content?.hidden).toBe(false);
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(content?.hidden).toBe(true);
    expect(byId("drawer").getAttribute("data-state")).toBe("peek");
    expect(toggle.textContent).toContain(`Flotte 0/${BASE_PARKING_SPOTS}`);
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("the fleet counter in the handle follows purchases while collapsed", () => {
    mountApp();
    clickId("buy-used");
    click(byId("drawer-toggle"));
    expect(byId("drawer-toggle").textContent).toContain(`Flotte 1/${BASE_PARKING_SPOTS}`);
  });

  function pointer(el: HTMLElement, type: string, clientY: number): void {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, { clientY, pointerId: 1, pointerType: "touch" });
    act(() => {
      el.dispatchEvent(ev);
    });
  }

  it("dragging the handle down by more than 40 px collapses; 30 px does nothing", () => {
    mountApp();
    const toggle = byId("drawer-toggle");
    pointer(toggle, "pointerdown", 100);
    pointer(toggle, "pointerup", 130);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    pointer(toggle, "pointerdown", 100);
    pointer(toggle, "pointerup", 150);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    pointer(toggle, "pointerdown", 150);
    pointer(toggle, "pointerup", 90);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("without WebGL (jsdom) the fallback replaces the view, time keeps running, panels still work", () => {
    mountApp();
    const view = byId("agency-view");
    expect(view.getAttribute("data-state")).toBe("fallback");
    expect(text("agency-fallback")).toBe(
      "Vue de l'agence indisponible sur cet appareil. Utilisez le panneau « Gérer l'agence ».",
    );
    expect(container.querySelector("canvas")).toBeNull();
    expect(maybeId("camera-reset")).toBeNull();
    clickId("buy-used");
    clickId("speed-10");
    driver.frames(5);
    expect(text("hud-clock")).not.toBe("Jour 1 · 09:00");
    expect(view.getAttribute("data-car-sprites")).toBe("1");
    assertClean();
  });

  it("data-car-sprites depends only on the fleet size, never on time", () => {
    mountApp(createGame(1, 0, IDLE));
    clickId("speed-10");
    for (let i = 0; i < 50; i++) {
      driver.frames(1);
      expect(byId("agency-view").getAttribute("data-car-sprites")).toBe("2");
    }
  });
});

describe("App: new-day toast", () => {
  it("disappears by itself", () => {
    vi.useFakeTimers();
    try {
      mountApp(createGame(1, 0, IDLE));
      playUntilDay(2, "speed-10");
      expect(maybeId("day-banner")).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(maybeId("day-banner")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes with a tap", () => {
    mountApp(createGame(1, 0, IDLE));
    playUntilDay(2, "speed-10");
    click(byId("day-banner"));
    expect(maybeId("day-banner")).toBeNull();
  });

  it("a new closing replaces the text, and does not touch the error banner or notice", () => {
    mountApp(createGame(1, 10_000_00, IDLE));
    clickId("buy-used"); // sets a notice
    const notice = text("notice");
    playUntilDay(2, "speed-10");
    const first = text("day-banner");
    expect(text("notice")).toBe(notice);
    runUntil((c) => c.startsWith("Jour 3 "), 100);
    expect(container.querySelectorAll('[data-testid="day-banner"]')).toHaveLength(1);
    expect(text("day-banner")).not.toBe(first);
    expect(text("day-banner")).toContain("Jour 3 : l'agence ouvre !");
    expect(text("notice")).toBe(notice);
  });

  it("is not shown at launch, nor after a mid-day commit", () => {
    mountApp();
    expect(maybeId("day-banner")).toBeNull();
    clickId("speed-1");
    driver.frames(10);
    expect(maybeId("day-banner")).toBeNull();
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
        <App initialGame={poisoned} storage={memoryStorage()} />
      </ErrorBoundary>,
    );
    expect(container.innerHTML).not.toBe("");
    expect(container.textContent).not.toBe("");
  });
});
