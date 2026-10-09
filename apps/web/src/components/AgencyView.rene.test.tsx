import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, type GameState } from "@rt/sim";
import { AgencyView, type ReneMode } from "./AgencyView.js";
import { AgencyScene3D } from "../scene/AgencyScene3D.js";
import type { CarPose } from "../scene/carMotion.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../scene/webgl.js", () => ({ detectWebGL: () => true }));

const rec = vi.hoisted(() => ({
  rene: [] as string[],
  poses: [] as unknown[],
  active: false,
  throwOnRene: false,
}));

/** Minimal scene double with René's API. */
class Fake {
  static create(): Promise<Fake> {
    return Promise.resolve(new Fake());
  }
  quality(): string {
    return "high";
  }
  update(): void {}
  setQuality(): void {}
  stats() {
    return { calls: 1, triangles: 1, traffic: 1 };
  }
  setCamera(): void {}
  setHighlight(): void {}
  setReducedMotion(): void {}
  posesNow(): unknown[] {
    return rec.poses;
  }
  render(): void {}
  onFailure(): void {}
  destroy(): void {}
  setRene(mode: string): void {
    if (rec.throwOnRene) throw new Error("boom");
    rec.rene.push(mode);
  }
  reneActive(): boolean {
    return rec.active;
  }
}

let container: HTMLElement;
let root: Root;
let frames: Map<number, FrameRequestCallback>;
let nextId: number;
const pendingRef = { current: 0 };
const game = (): GameState => createGame(1, 1_000_000, [{ dailyPrice: 100_00, dailyCost: 10_00 }]);

function mount(props: {
  paused: boolean;
  rene?: ReneMode;
  onDepartingCar?: (p: { x: number; y: number } | null) => void;
}): void {
  act(() => {
    root.render(
      <AgencyView
        game={game()}
        paused={props.paused}
        speed={1}
        pendingRef={pendingRef}
        {...(props.rene ? { rene: props.rene } : {})}
        {...(props.onDepartingCar ? { onDepartingCar: props.onDepartingCar } : {})}
      />,
    );
  });
}
async function ready(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}
function tick(t: number): void {
  const batch = [...frames.values()];
  frames.clear();
  act(() => {
    for (const cb of batch) cb(t);
  });
}

beforeEach(() => {
  vi.spyOn(AgencyScene3D, "create").mockImplementation(
    () => Fake.create() as unknown as Promise<AgencyScene3D>,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    width: 390,
    height: 700,
    right: 400,
    bottom: 720,
    toJSON: () => ({}),
  });
  rec.rene.length = 0;
  rec.poses = [];
  rec.active = false;
  rec.throwOnRene = false;
  frames = new Map();
  nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const departing = (x: number, z: number): CarPose => ({
  x,
  z,
  heading: 0,
  wheelRotation: 0,
  alpha: 1,
  phase: "departing",
});

describe("AgencyView: René in the scene", () => {
  it("applies the initial mode once the scene exists, then follows the prop", async () => {
    mount({ paused: true, rene: "idle" });
    await ready();
    expect(rec.rene).toContain("idle");
    mount({ paused: true, rene: "cheer" });
    expect(rec.rene[rec.rene.length - 1]).toBe("cheer");
    mount({ paused: true, rene: "leave" });
    expect(rec.rene[rec.rene.length - 1]).toBe("leave");
  });

  it("does not touch René when the prop is absent (hidden)", async () => {
    mount({ paused: true });
    await ready();
    expect(rec.rene.every((m) => m === "hidden")).toBe(true);
  });

  it("a scene that throws on setRene never breaks the view", async () => {
    rec.throwOnRene = true;
    mount({ paused: true, rene: "idle" });
    await ready();
    mount({ paused: true, rene: "cheer" });
    expect(container.querySelector('[data-testid="agency-view"]')?.getAttribute("data-state")).toBe(
      "ready",
    );
  });

  it("keeps drawing frames while the clock is paused as long as René is on screen", async () => {
    rec.active = true;
    mount({ paused: true, rene: "idle" });
    await ready();
    tick(1000);
    expect(frames.size).toBe(1);
    tick(1016);
    expect(frames.size).toBe(1);
    rec.active = false; // he left
    tick(1032);
    expect(frames.size).toBe(0);
  });

  it("stays still when paused without René", async () => {
    mount({ paused: true });
    await ready();
    expect(frames.size).toBe(0);
  });
});

describe("AgencyView: departing car callback", () => {
  it("reports a viewport position while a car drives out, then null", async () => {
    const onDeparting = vi.fn();
    rec.poses = [departing(12, 4)];
    mount({ paused: false, onDepartingCar: onDeparting });
    await ready();
    tick(1000);
    const first = onDeparting.mock.calls[0]?.[0] as { x: number; y: number } | null | undefined;
    expect(first).toBeTruthy();
    expect(Number.isFinite(first?.x)).toBe(true);
    expect(Number.isFinite(first?.y)).toBe(true);
    rec.poses = [{ ...departing(0, 0), phase: "parked" }];
    tick(1016);
    expect(onDeparting.mock.calls[onDeparting.mock.calls.length - 1]?.[0]).toBeNull();
  });

  it("does not call back every frame when nothing moves", async () => {
    const onDeparting = vi.fn();
    rec.poses = [departing(12, 4)];
    mount({ paused: false, onDepartingCar: onDeparting });
    await ready();
    tick(1000);
    tick(1016);
    tick(1032);
    expect(onDeparting).toHaveBeenCalledTimes(1);
  });

  it("is never called with NaN for a broken pose", async () => {
    const onDeparting = vi.fn();
    rec.poses = [departing(Number.NaN, 4)];
    mount({ paused: false, onDepartingCar: onDeparting });
    await ready();
    tick(1000);
    for (const call of onDeparting.mock.calls) expect(call[0]).toBeNull();
  });
});
