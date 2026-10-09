import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorialScript, TutorialStep } from "../../game/tutorial.js";
import { failRenePortrait, publishRenePortrait, resetRenePortrait } from "../../ui/reneStore.js";
import { TutorialOverlay } from "./TutorialOverlay.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
let extras: HTMLElement[];

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const px = (el: HTMLElement | null, prop: "left" | "top" | "width" | "height") =>
  Number.parseFloat(el?.style[prop] ?? "NaN");

function script(over: Partial<TutorialScript> = {}): TutorialScript {
  return {
    lines: ["Bonjour, je suis René.", "Voici l'agence."],
    target: { kind: "none" },
    waitsFor: "tap",
    blocksTime: true,
    ...over,
  };
}

interface Props {
  step?: Exclude<TutorialStep, "done">;
  script?: TutorialScript;
  carTarget?: { x: number; y: number } | null;
  canSkip?: boolean;
  onTap?: () => void;
  onSkip?: () => void;
}

function show(p: Props = {}): void {
  act(() => {
    root.render(
      <TutorialOverlay
        step={p.step ?? "welcome"}
        script={p.script ?? script()}
        carTarget={p.carTarget ?? null}
        canSkip={p.canSkip ?? false}
        onTap={p.onTap ?? (() => undefined)}
        onSkip={p.onSkip ?? (() => undefined)}
      />,
    );
  });
}

/** Adds an element carrying data-tutorial="id" at a mocked viewport rectangle. */
function addTarget(id: string, rect: { x: number; y: number; w: number; h: number }): HTMLElement {
  const el = document.createElement("button");
  el.dataset["tutorial"] = id;
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: rect.x,
    y: rect.y,
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
    toJSON: () => ({}),
  });
  document.body.appendChild(el);
  extras.push(el);
  return el;
}

function click(el: HTMLElement | null): void {
  act(() => {
    el?.click();
  });
}

function typeAll(): void {
  act(() => {
    vi.advanceTimersByTime(4000);
  });
}

function stubMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMotion(false);
  extras = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resetRenePortrait();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  for (const el of extras) el.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("typewriter and taps", () => {
  it("types the line letter by letter, the full text stays readable for screen readers", () => {
    show();
    expect(q("tutorial-line-full")?.textContent).toBe("Bonjour, je suis René.");
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("");
    act(() => {
      vi.advanceTimersByTime(28 * 7 + 1);
    });
    const typed = q("tutorial-line")?.firstElementChild?.textContent ?? "";
    expect(typed.length).toBeGreaterThan(3);
    expect(typed.length).toBeLessThan("Bonjour, je suis René.".length);
    expect("Bonjour, je suis René.".startsWith(typed)).toBe(true);
    typeAll();
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("Bonjour, je suis René.");
  });

  it("first tap shows the whole line, second tap goes to the next one", () => {
    const onTap = vi.fn();
    show({ onTap });
    click(q("tutorial-bubble"));
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("Bonjour, je suis René.");
    expect(q("tutorial-bubble")?.dataset["typing"]).toBe("false");
    click(q("tutorial-bubble"));
    expect(q("tutorial-line-full")?.textContent).toBe("Voici l'agence.");
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("");
    expect(onTap).not.toHaveBeenCalled();
  });

  it("calls onTap only after the last line, when the step waits for a tap", () => {
    const onTap = vi.fn();
    show({ onTap });
    click(q("tutorial-bubble")); // shows line 1
    click(q("tutorial-bubble")); // line 2
    click(q("tutorial-bubble")); // shows all of line 2
    expect(onTap).not.toHaveBeenCalled();
    click(q("tutorial-bubble"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("any tap on the dark layer advances René too", () => {
    const onTap = vi.fn();
    show({ onTap, script: script({ lines: ["Une seule bulle."] }) });
    click(q("tutorial-block"));
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("Une seule bulle.");
    expect(onTap).not.toHaveBeenCalled();
    click(q("tutorial-block"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("never calls onTap when the step waits for an action", () => {
    const onTap = vi.fn();
    addTarget("rail-cars", { x: 300, y: 200, w: 56, h: 56 });
    show({
      onTap,
      step: "openCars",
      script: script({
        lines: ["Ouvre le garage."],
        target: { kind: "dom", id: "rail-cars" },
        waitsFor: "action",
      }),
    });
    click(q("tutorial-bubble"));
    click(q("tutorial-bubble"));
    click(q("tutorial-bubble"));
    expect(onTap).not.toHaveBeenCalled();
    // The bubble stays on screen.
    expect(q("tutorial-line-full")?.textContent).toBe("Ouvre le garage.");
  });

  it("restarts the typing when the lines of the step change", () => {
    show({ script: script({ lines: ["Regarde."], waitsFor: "action" }) });
    typeAll();
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("Regarde.");
    show({ script: script({ lines: ["Tu as gagné 120 €."], waitsFor: "action" }) });
    expect(q("tutorial-line-full")?.textContent).toBe("Tu as gagné 120 €.");
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("");
  });

  it("survives an empty script without crashing or printing undefined", () => {
    show({ script: script({ lines: [] }) });
    expect(q("tutorial-bubble")).not.toBeNull();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
    click(q("tutorial-bubble"));
    click(q("tutorial-bubble"));
  });

  it("shows the text at once with reduced motion", () => {
    stubMotion(true);
    show();
    expect(q("tutorial-line")?.firstElementChild?.textContent).toBe("Bonjour, je suis René.");
    expect(q("tutorial-bubble")?.dataset["typing"]).toBe("false");
  });
});

describe("blocking layer and spotlight", () => {
  const actionScript = (id: string): TutorialScript =>
    script({
      lines: ["Appuie ici."],
      target: { kind: "dom", id },
      waitsFor: "action",
    });

  it("blocks the whole screen while there is no action to do", () => {
    show();
    const block = q("tutorial-block");
    expect(block).not.toBeNull();
    expect(block?.dataset["dim"]).toBe("true");
    expect(q("tutorial-hole")).toBeNull();
    expect(q("tutorial-arrow")).toBeNull();
    expect(q("tutorial-overlay")?.dataset["mode"]).toBe("catch");
  });

  it("puts the hole and the arrow on the target and lets taps through the hole only", () => {
    addTarget("rail-cars", { x: 100, y: 300, w: 60, h: 60 });
    show({ step: "openCars", script: actionScript("rail-cars") });
    // Single line, action: still typing counts as the last line, so the hole is open.
    const hole = q("tutorial-hole");
    expect(px(hole, "left")).toBe(94);
    expect(px(hole, "top")).toBe(294);
    expect(px(hole, "width")).toBe(72);
    expect(px(hole, "height")).toBe(72);
    expect(q("tutorial-overlay")?.dataset["mode"]).toBe("spot");
    // Four blockers frame the hole; none covers it.
    expect(px(q("tutorial-block-top"), "height")).toBe(294);
    expect(px(q("tutorial-block-left"), "width")).toBe(94);
    expect(px(q("tutorial-block-left"), "top")).toBe(294);
    expect(px(q("tutorial-block-right"), "left")).toBe(166);
    expect(px(q("tutorial-block-bottom"), "top")).toBe(366);
    expect(q("tutorial-block")).toBeNull();
    // The arrow sits next to the hole (above: the target is in the upper half, so below).
    const arrow = q("tutorial-arrow");
    expect(arrow).not.toBeNull();
    expect(arrow?.dataset["side"]).toBe("below");
    expect(px(arrow, "left")).toBe(100 + 30 - 32);
    expect(px(arrow, "top")).toBeGreaterThanOrEqual(366);
  });

  it("points from the left at a target stuck to the right edge, from above in the lower half", () => {
    addTarget("rail-missions", { x: 340, y: 120, w: 44, h: 44 });
    show({ step: "missions", script: actionScript("rail-missions") });
    expect(q("tutorial-arrow")?.dataset["side"]).toBe("left");
    addTarget("drawer-handle", { x: 20, y: 700, w: 300, h: 60 });
    show({ step: "openFleet", script: actionScript("drawer-handle") });
    expect(q("tutorial-arrow")?.dataset["side"]).toBe("above");
    // The bar moves away from a target in the lower half.
    expect(q("tutorial-bar")?.dataset["side"]).toBe("top");
  });

  it("follows the target when it moves", () => {
    const el = addTarget("speed-pause", { x: 20, y: 80, w: 120, h: 50 });
    show({ step: "startTime", script: actionScript("speed-pause") });
    expect(px(q("tutorial-hole"), "left")).toBe(14);
    vi.mocked(el.getBoundingClientRect).mockReturnValue({
      x: 200,
      y: 80,
      left: 200,
      top: 80,
      width: 120,
      height: 50,
      right: 320,
      bottom: 130,
      toJSON: () => ({}),
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(px(q("tutorial-hole"), "left")).toBe(194);
  });

  it("highlights the departing car with a round hole", () => {
    show({
      step: "watchCar",
      script: script({
        lines: ["Regarde."],
        target: { kind: "car" },
        waitsFor: "action",
        blocksTime: false,
      }),
      carTarget: { x: 200, y: 400 },
    });
    const hole = q("tutorial-hole");
    expect(px(hole, "left")).toBe(154);
    expect(px(hole, "top")).toBe(354);
    expect(px(hole, "width")).toBe(92);
    expect(q("tutorial-arrow")).not.toBeNull();
  });

  it("only blocks the menus while a step just waits for time (no target yet)", () => {
    const rail = document.createElement("nav");
    rail.setAttribute("data-testid", "side-rail");
    vi.spyOn(rail, "getBoundingClientRect").mockReturnValue({
      x: 330,
      y: 100,
      left: 330,
      top: 100,
      width: 56,
      height: 400,
      right: 386,
      bottom: 500,
      toJSON: () => ({}),
    });
    document.body.appendChild(rail);
    extras.push(rail);
    show({
      step: "watchCar",
      script: script({
        lines: ["Regarde."],
        target: { kind: "car" },
        waitsFor: "action",
        blocksTime: false,
      }),
      carTarget: null,
    });
    expect(q("tutorial-hole")).toBeNull();
    expect(q("tutorial-block")).toBeNull();
    expect(q("tutorial-overlay")?.dataset["mode"]).toBe("light");
    // The side rail is covered by an invisible blocker.
    const blocker = q("tutorial-menu-block");
    expect(blocker).not.toBeNull();
    expect(px(blocker, "left")).toBe(330);
    expect(px(blocker, "height")).toBe(400);
  });

  it("does not highlight anything when the target element is missing", () => {
    show({ step: "openCars", script: actionScript("rail-cars") });
    expect(q("tutorial-hole")).toBeNull();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it("ignores an id that could not be a selector", () => {
    show({ step: "openCars", script: actionScript('x"],body[data-tutorial="') });
    expect(q("tutorial-hole")).toBeNull();
  });

  it("keeps the whole game blocked on earlier lines of an action step", () => {
    addTarget("rail-cars", { x: 100, y: 300, w: 60, h: 60 });
    show({
      step: "openCars",
      script: script({
        lines: ["Première bulle.", "Deuxième bulle."],
        target: { kind: "dom", id: "rail-cars" },
        waitsFor: "action",
      }),
    });
    expect(q("tutorial-overlay")?.dataset["mode"]).toBe("catch");
    expect(q("tutorial-block-top")).toBeNull();
    // The spotlight is already visible, the arrow waits for the last line.
    expect(q("tutorial-hole")).not.toBeNull();
    expect(q("tutorial-arrow")).toBeNull();
    click(q("tutorial-block")); // all of line 1
    click(q("tutorial-block")); // line 2
    expect(q("tutorial-overlay")?.dataset["mode"]).toBe("spot");
    expect(q("tutorial-arrow")).not.toBeNull();
  });
});

describe("skip button and portrait", () => {
  it("shows « Passer le tutoriel » only when allowed", () => {
    const onSkip = vi.fn();
    show({ canSkip: false, onSkip });
    expect(q("tutorial-skip")).toBeNull();
    show({ canSkip: true, onSkip });
    const skip = q("tutorial-skip");
    expect(skip?.textContent).toBe("Passer le tutoriel");
    click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("draws the SVG portrait until the 3D one exists, then the image", () => {
    show();
    expect(q("rene-avatar")).not.toBeNull();
    act(() => {
      publishRenePortrait("data:image/png;base64,AAAA");
    });
    expect(q("rene-avatar")).toBeNull();
    expect(container.querySelector("img.tut-portrait-img")?.getAttribute("src")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("falls back to the SVG when the render failed or the image is garbage", () => {
    act(() => {
      failRenePortrait();
    });
    show();
    expect(q("rene-avatar")).not.toBeNull();
    resetRenePortrait();
    act(() => {
      publishRenePortrait("javascript:alert(1)");
    });
    expect(q("rene-avatar")).not.toBeNull();
  });

  it("nods while the text is typing and stops afterwards", () => {
    show();
    const portrait = () => container.querySelector<HTMLElement>(".tut-portrait");
    expect(portrait()?.dataset["talking"]).toBe("true");
    typeAll();
    expect(portrait()?.dataset["talking"]).toBe("false");
  });
});
