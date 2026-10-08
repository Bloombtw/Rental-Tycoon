import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, type GameState } from "@rt/sim";
import { AgencyView } from "./AgencyView.js";
import { AgencyScene3D } from "../scene/AgencyScene3D.js";
import { planeToScreen, type Camera, type ScreenRect } from "../scene/camera.js";
import { carPoseAt, type CarPose } from "../scene/carMotion.js";
import { toViewPlane } from "../scene/iso.js";
import type { AgencyLayout } from "../scene/layout.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeInstance {
  updates: { game: GameState; timeOfDay: number; layout: AgencyLayout }[];
  cameras: { cam: Camera; view: ScreenRect }[];
  highlights: (number | null)[];
  reduced: boolean[];
  renders: number;
  destroys: number;
  afterDestroy: number;
  failureCb: (() => void) | null;
  renderThrows: boolean;
  poses: () => CarPose[];
}

const ctl = vi.hoisted(() => ({
  webgl: true,
  createOptions: [] as Record<string, unknown>[],
  pending: [] as { resolve: () => void; reject: (e: Error) => void }[],
  instances: [] as FakeInstance[],
}));

vi.mock("../scene/webgl.js", () => ({ detectWebGL: () => ctl.webgl }));

class FakeScene {
  readonly inst: FakeInstance;
  private layout: AgencyLayout | null = null;
  private count = 0;
  constructor() {
    this.inst = {
      updates: [],
      cameras: [],
      highlights: [],
      reduced: [],
      renders: 0,
      destroys: 0,
      afterDestroy: 0,
      failureCb: null,
      renderThrows: false,
      poses: () => this.posesNow(),
    };
  }
  static create(_host: HTMLElement, o: Record<string, unknown>): Promise<FakeScene> {
    ctl.createOptions.push(o);
    return new Promise((resolve, reject) => {
      ctl.pending.push({
        resolve: () => {
          const s = new FakeScene();
          ctl.instances.push(s.inst);
          resolve(s);
        },
        reject,
      });
    });
  }
  private touch(): void {
    if (this.inst.destroys > 0) this.inst.afterDestroy++;
  }
  update(game: GameState, timeOfDay: number, layout: AgencyLayout): void {
    this.touch();
    this.inst.updates.push({ game, timeOfDay, layout });
    this.layout = layout;
    this.count = game.fleet.length;
  }
  setCamera(cam: Camera, view: ScreenRect): void {
    this.touch();
    this.inst.cameras.push({ cam, view });
  }
  setHighlight(index: number | null): void {
    this.inst.highlights.push(index);
  }
  setReducedMotion(value: boolean): void {
    this.inst.reduced.push(value);
  }
  posesNow(): CarPose[] {
    const l = this.layout;
    if (!l) return [];
    return Array.from({ length: Math.min(this.count, l.spots.length) }, (_, i) =>
      carPoseAt(l, i, false, 0, false),
    );
  }
  render(): void {
    this.touch();
    if (this.inst.renderThrows) throw new Error("render boom");
    this.inst.renders++;
  }
  onFailure(cb: () => void): void {
    this.inst.failureCb = cb;
  }
  destroy(): void {
    this.inst.destroys++;
  }
}

let container: HTMLElement;
let root: Root;
const pendingRef = { current: 0 };

function game(cars = 3): GameState {
  return createGame(
    1,
    1_000_000,
    Array.from({ length: cars }, () => ({ dailyPrice: 100_00, dailyCost: 10_00 })),
  );
}

function render(node: ReactNode): void {
  act(() => {
    root.render(node);
  });
}
function view(g: GameState, paused = true) {
  return <AgencyView game={g} paused={paused} pendingRef={pendingRef} />;
}
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function resolveNext(): Promise<FakeInstance> {
  const p = ctl.pending.shift();
  if (!p) throw new Error("no pending create");
  p.resolve();
  await flush();
  const inst = ctl.instances[ctl.instances.length - 1];
  if (!inst) throw new Error("no instance");
  return inst;
}
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const state = () => q("agency-view")?.getAttribute("data-state");

function stubRect(width: number, height: number): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
}
function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "touch",
    buttons: 0,
    ...extra,
  });
  act(() => {
    (q("agency-view") as HTMLElement).dispatchEvent(ev);
  });
}
function screenOfCar(inst: FakeInstance, i: number): { x: number; y: number } {
  const last = inst.cameras[inst.cameras.length - 1];
  const pose = inst.poses()[i];
  if (!last || !pose) throw new Error("no camera or pose");
  const s = planeToScreen(last.cam, last.view, toViewPlane({ x: pose.x, y: 0, z: pose.z }));
  return s;
}
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

beforeEach(() => {
  // The real class only carries the factory: it is replaced, no WebGL renderer is ever built.
  vi.spyOn(AgencyScene3D, "create").mockImplementation(
    (host, o) =>
      FakeScene.create(
        host,
        o as unknown as Record<string, unknown>,
      ) as unknown as Promise<AgencyScene3D>,
  );
  ctl.webgl = true;
  ctl.createOptions.length = 0;
  ctl.pending.length = 0;
  ctl.instances.length = 0;
  pendingRef.current = 0;
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
  Reflect.deleteProperty(window, "matchMedia");
});

describe("AgencyView: states", () => {
  it("without WebGL it starts in fallback and never loads the scene", async () => {
    ctl.webgl = false;
    render(view(game()));
    await flush();
    expect(state()).toBe("fallback");
    expect(q("agency-fallback")?.textContent).toContain("Vue de l'agence indisponible");
    expect(q("agency-loading")).toBeNull();
    expect(ctl.createOptions).toHaveLength(0);
    expect(q("camera-reset")).toBeNull();
  });

  it("shows the loading message while create is pending, then the ready view", async () => {
    render(view(game()));
    await flush();
    expect(state()).toBe("loading");
    expect(q("agency-loading")?.textContent).toBe("Chargement de la ville…");
    expect(q("agency-fallback")).toBeNull();
    expect(q("camera-reset")).toBeNull();
    await resolveNext();
    expect(state()).toBe("ready");
    expect(q("agency-loading")).toBeNull();
    expect(q("camera-reset")).not.toBeNull();
  });

  it("create options carry the base url, a size of at least 1 px and a live cancel flag", async () => {
    render(view(game()));
    await flush();
    const o = ctl.createOptions[0] as {
      baseUrl: unknown;
      size: { width: number; height: number };
      isCancelled: () => boolean;
      reducedMotion: boolean;
    };
    expect(typeof o.baseUrl).toBe("string");
    expect(o.size.width).toBeGreaterThanOrEqual(1);
    expect(o.size.height).toBeGreaterThanOrEqual(1);
    expect(o.reducedMotion).toBe(false);
    expect(o.isCancelled()).toBe(false);
    act(() => {
      root.unmount();
    });
    expect(o.isCancelled()).toBe(true);
    root = createRoot(container);
  });

  it("a rejected create falls back and the page stays usable", async () => {
    render(view(game()));
    await flush();
    await act(async () => {
      ctl.pending.shift()?.reject(new Error("glb 404"));
      await Promise.resolve();
    });
    await flush();
    expect(state()).toBe("fallback");
    expect(q("agency-fallback")).not.toBeNull();
    expect(q("agency-loading")).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|\[object/);
  });

  it("onFailure after ready falls back and destroys the scene exactly once", async () => {
    render(view(game()));
    await flush();
    const inst = await resolveNext();
    act(() => {
      inst.failureCb?.();
    });
    expect(state()).toBe("fallback");
    expect(inst.destroys).toBe(1);
    act(() => {
      inst.failureCb?.();
    });
    expect(inst.destroys).toBe(1);
    act(() => {
      root.unmount();
    });
    expect(inst.destroys).toBe(1);
    root = createRoot(container);
  });

  it("a render that throws falls back and destroys once", async () => {
    render(view(game()));
    await flush();
    const inst = await resolveNext();
    inst.renderThrows = true;
    render(view(game(4)));
    expect(state()).toBe("fallback");
    expect(inst.destroys).toBe(1);
  });
});

describe("AgencyView: lifetime", () => {
  it("unmount destroys the scene exactly once and nothing is touched afterwards", async () => {
    render(view(game(), false));
    await flush();
    const inst = await resolveNext();
    await wait(60);
    expect(inst.renders).toBeGreaterThan(1); // running: frame loop
    act(() => {
      root.unmount();
    });
    expect(inst.destroys).toBe(1);
    const renders = inst.renders;
    await wait(60);
    expect(inst.renders).toBe(renders);
    expect(inst.afterDestroy).toBe(0);
    root = createRoot(container);
  });

  it("unmount before create resolves: the late scene is destroyed once and never used", async () => {
    render(view(game()));
    await flush();
    act(() => {
      root.unmount();
    });
    const inst = await resolveNext();
    expect(inst.destroys).toBe(1);
    expect(inst.updates).toHaveLength(0);
    expect(inst.renders).toBe(0);
    expect(inst.failureCb).toBeNull();
    root = createRoot(container);
  });

  it("StrictMode double mount: every created scene is destroyed once, the live one stays", async () => {
    render(<StrictMode>{view(game())}</StrictMode>);
    await flush();
    expect(ctl.pending.length).toBe(2);
    await resolveNext();
    await resolveNext();
    expect(ctl.instances).toHaveLength(2);
    const [first, second] = ctl.instances as [FakeInstance, FakeInstance];
    expect(first.destroys).toBe(1);
    expect(first.updates).toHaveLength(0);
    expect(second.destroys).toBe(0);
    expect(state()).toBe("ready");
    act(() => {
      root.unmount();
    });
    expect(first.destroys).toBe(1);
    expect(second.destroys).toBe(1);
    root = createRoot(container);
  });

  it("StrictMode with a rejected first create does not break the second", async () => {
    render(<StrictMode>{view(game())}</StrictMode>);
    await flush();
    await act(async () => {
      ctl.pending.shift()?.reject(new Error("cancelled"));
      await Promise.resolve();
    });
    await resolveNext();
    expect(state()).toBe("ready");
  });

  it("repeated mount / unmount cycles leak no scene", async () => {
    for (let i = 0; i < 5; i++) {
      render(view(game()));
      await flush();
      await resolveNext();
      act(() => {
        root.unmount();
      });
      root = createRoot(container);
    }
    expect(ctl.instances).toHaveLength(5);
    expect(ctl.instances.every((s) => s.destroys === 1)).toBe(true);
  });
});

describe("AgencyView: data flow", () => {
  it("update and setCamera receive finite values, even with a 0 x 0 host", async () => {
    render(view(game(7)));
    await flush();
    const inst = await resolveNext();
    expect(inst.updates.length).toBeGreaterThan(0);
    for (const u of inst.updates) {
      expect(Number.isFinite(u.timeOfDay)).toBe(true);
      expect(u.layout.spots).toHaveLength(7);
    }
    for (const c of inst.cameras) {
      for (const v of [c.cam.zoom, c.cam.centerX, c.cam.centerY, c.view.width, c.view.height]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(c.cam.zoom).toBeGreaterThan(0);
      expect(c.view.width).toBeGreaterThanOrEqual(1);
      expect(c.view.height).toBeGreaterThanOrEqual(1);
    }
    expect(q("agency-view")?.getAttribute("data-car-sprites")).toBe("7");
  });

  it("uses the host size and renders once per change when paused", async () => {
    stubRect(390, 650);
    render(view(game(7)));
    await flush();
    const inst = await resolveNext();
    const last = inst.cameras[inst.cameras.length - 1];
    expect(last?.view).toMatchObject({ width: 390, height: 650 });
    const before = inst.renders;
    await wait(60);
    expect(inst.renders).toBe(before); // paused: no frame without a change
    render(view(game(8)));
    expect(inst.renders).toBeGreaterThan(before);
    expect(inst.updates[inst.updates.length - 1]?.layout.spots).toHaveLength(8);
    expect(q("agency-view")?.getAttribute("data-car-sprites")).toBe("8");
  });

  it("a fleet of 0 and of 50 both render without NaN", async () => {
    stubRect(390, 650);
    render(view(game(0)));
    await flush();
    const inst = await resolveNext();
    render(view(game(50)));
    for (const c of inst.cameras) expect(Number.isFinite(c.cam.zoom)).toBe(true);
    expect(q("agency-view")?.getAttribute("data-car-sprites")).toBe("50");
  });

  it("resuming starts the frame loop, pausing stops it", async () => {
    render(view(game(), true));
    await flush();
    const inst = await resolveNext();
    render(view(game(), false));
    const a = inst.renders;
    await wait(60);
    expect(inst.renders).toBeGreaterThan(a);
    render(view(game(), true));
    const b = inst.renders;
    await wait(60);
    expect(inst.renders).toBe(b);
  });
});

describe("AgencyView: reduced motion", () => {
  function stubMotion(matches: boolean) {
    const listeners: (() => void)[] = [];
    const mq = {
      matches,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: (_: string, cb: () => void) => {
        listeners.splice(listeners.indexOf(cb), 1);
      },
    };
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => mq });
    return { mq, listeners };
  }

  it("is forwarded at creation", async () => {
    stubMotion(true);
    render(view(game()));
    await flush();
    expect((ctl.createOptions[0] as { reducedMotion: boolean }).reducedMotion).toBe(true);
  });

  it("changes are forwarded live and the listener is removed on unmount", async () => {
    const { mq, listeners } = stubMotion(false);
    render(view(game()));
    await flush();
    const inst = await resolveNext();
    expect(listeners).toHaveLength(1);
    mq.matches = true;
    act(() => {
      listeners.forEach((cb) => {
        cb();
      });
    });
    expect(inst.reduced).toEqual([true]);
    act(() => {
      root.unmount();
    });
    expect(listeners).toHaveLength(0);
    root = createRoot(container);
  });
});

describe("AgencyView: touch", () => {
  beforeEach(() => {
    stubRect(390, 650);
  });

  it("hovering a car with the mouse opens its tooltip and moving away closes it", async () => {
    render(view(game(5)));
    await flush();
    const inst = await resolveNext();
    const s = screenOfCar(inst, 2);
    pointer("pointermove", s.x, s.y, { pointerType: "mouse", buttons: 0 });
    expect(q("car-tooltip")).not.toBeNull();
    expect(inst.highlights[inst.highlights.length - 1]).toBe(2);
    pointer("pointermove", 1, 1, { pointerType: "mouse", buttons: 0 });
    expect(q("car-tooltip")).toBeNull();
    expect(inst.highlights[inst.highlights.length - 1]).toBeNull();
  });

  it("tapping a car opens the tooltip; tapping it again or an empty area closes it", async () => {
    render(view(game(5)));
    await flush();
    const inst = await resolveNext();
    const s = screenOfCar(inst, 3);
    pointer("pointerdown", s.x, s.y);
    pointer("pointerup", s.x, s.y);
    expect(q("car-tooltip")).not.toBeNull();
    expect(q("car-tooltip")?.textContent).not.toMatch(/NaN|undefined|\[object/);
    expect(inst.highlights[inst.highlights.length - 1]).toBe(3);
    pointer("pointerdown", s.x, s.y);
    pointer("pointerup", s.x, s.y);
    expect(q("car-tooltip")).toBeNull();
    pointer("pointerdown", s.x, s.y);
    pointer("pointerup", s.x, s.y);
    expect(q("car-tooltip")).not.toBeNull();
    pointer("pointerdown", 2, 2);
    pointer("pointerup", 2, 2);
    expect(q("car-tooltip")).toBeNull();
  });

  it("dragging does not open a tooltip and the camera stays finite", async () => {
    render(view(game(5)));
    await flush();
    const inst = await resolveNext();
    const s = screenOfCar(inst, 1);
    pointer("pointerdown", s.x, s.y);
    pointer("pointermove", s.x + 60, s.y + 40);
    pointer("pointerup", s.x + 60, s.y + 40);
    expect(q("car-tooltip")).toBeNull();
    for (const c of inst.cameras) expect(Number.isFinite(c.cam.centerX)).toBe(true);
  });

  it("the recenter button resets a moved camera and closes the tooltip", async () => {
    render(view(game(5)));
    await flush();
    const inst = await resolveNext();
    const s = screenOfCar(inst, 0);
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 160, 130);
    pointer("pointerup", 160, 130);
    pointer("pointerdown", s.x, s.y);
    pointer("pointerup", s.x, s.y);
    act(() => {
      q("camera-reset")?.click();
    });
    expect(q("car-tooltip")).toBeNull();
    const first = inst.cameras[0];
    const last = inst.cameras[inst.cameras.length - 1];
    expect(last?.cam.centerX).toBeCloseTo(first?.cam.centerX ?? NaN, 6);
    expect(last?.cam.zoom).toBeCloseTo(first?.cam.zoom ?? NaN, 6);
  });

  it("a tooltip disappears when its car leaves the fleet", async () => {
    render(view(game(5)));
    await flush();
    const inst = await resolveNext();
    const s = screenOfCar(inst, 4);
    pointer("pointerdown", s.x, s.y);
    pointer("pointerup", s.x, s.y);
    expect(q("car-tooltip")).not.toBeNull();
    render(view(game(2)));
    expect(q("car-tooltip")).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|\[object/);
  });

  it("gestures while loading or in fallback do nothing and do not throw", async () => {
    render(view(game(5)));
    await flush();
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 150, 150);
    pointer("pointerup", 150, 150);
    expect(q("car-tooltip")).toBeNull();
    expect(state()).toBe("loading");
  });

  it("a wheel with a NaN delta is ignored; a normal wheel zooms within bounds", async () => {
    render(view(game(5)));
    await flush();
    const inst = await resolveNext();
    const n = inst.cameras.length;
    const host = q("agency-view") as HTMLElement;
    const wheel = (deltaY: number) => {
      const ev = new Event("wheel", { bubbles: true, cancelable: true });
      Object.assign(ev, { deltaY, deltaMode: 0, clientX: 200, clientY: 300 });
      act(() => {
        host.dispatchEvent(ev);
      });
    };
    wheel(NaN);
    expect(inst.cameras.length).toBe(n);
    for (let i = 0; i < 40; i++) wheel(-500);
    const last = inst.cameras[inst.cameras.length - 1];
    expect(last?.cam.zoom).toBeLessThanOrEqual(40 + 1e-9);
    expect(Number.isFinite(last?.cam.zoom ?? NaN)).toBe(true);
  });
});
