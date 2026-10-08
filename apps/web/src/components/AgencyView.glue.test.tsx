import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, type GameState } from "@rt/sim";
import { AgencyView } from "./AgencyView.js";
import { AgencyScene3D } from "../scene/AgencyScene3D.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../scene/webgl.js", () => ({ detectWebGL: () => true }));

/** Minimal scene double; `setQualityThrows` simulates a lost GPU context mid-session. */
const rec = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  ambients: [] as number[],
  tiers: [] as string[],
  renders: 0,
  setQualityThrows: false,
  hold: false,
  /** When set, the scene reports this tier instead of the requested one. */
  effectiveTier: null as string | null,
}));

class Fake {
  private requested = "high";
  static create(_h: HTMLElement, o: Record<string, unknown>): Promise<Fake> {
    rec.options.push(o);
    const f = new Fake();
    f.requested = String(o["tier"]);
    return rec.hold ? new Promise<Fake>(() => {}) : Promise.resolve(f);
  }
  quality(): string {
    return rec.effectiveTier ?? this.requested;
  }
  update(_g: GameState, _t: number, _l: unknown, ambient: number): void {
    rec.ambients.push(ambient);
  }
  setQuality(tier: string): void {
    if (rec.setQualityThrows) throw new Error("context lost");
    rec.tiers.push(tier);
  }
  stats() {
    return { calls: 1, triangles: 1, traffic: 1 };
  }
  setCamera(): void {}
  setHighlight(): void {}
  setReducedMotion(): void {}
  posesNow(): never[] {
    return [];
  }
  render(): void {
    rec.renders++;
  }
  onFailure(): void {}
  destroy(): void {}
}

let container: HTMLElement;
let root: Root;
let frames: Map<number, FrameRequestCallback>;
let nextId: number;
const pendingRef = { current: 0 };
const g = (): GameState => createGame(1, 1_000_000, [{ dailyPrice: 100_00, dailyCost: 10_00 }]);
const el = () => container.querySelector<HTMLElement>('[data-testid="agency-view"]');

function mount(paused: boolean, speed: number): void {
  act(() => {
    root.render(<AgencyView game={g()} paused={paused} speed={speed} pendingRef={pendingRef} />);
  });
}
async function ready(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}
/** Runs the pending animation frames once at timestamp `t`. Returns an escaped exception, if any. */
function tick(t: number): unknown {
  const batch = [...frames.values()];
  frames.clear();
  let error: unknown = null;
  act(() => {
    for (const cb of batch) {
      try {
        cb(t);
      } catch (e) {
        error = e;
      }
    }
  });
  return error;
}
const last = () => rec.ambients[rec.ambients.length - 1] ?? NaN;

beforeEach(() => {
  vi.spyOn(AgencyScene3D, "create").mockImplementation(
    (h, o) =>
      Fake.create(h, o as unknown as Record<string, unknown>) as unknown as Promise<AgencyScene3D>,
  );
  rec.options.length = 0;
  rec.ambients.length = 0;
  rec.tiers.length = 0;
  rec.renders = 0;
  rec.setQualityThrows = false;
  rec.effectiveTier = null;
  rec.hold = false;
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

describe("AgencyView glue: loading text", () => {
  it.each([
    [NaN, 4],
    [Infinity, Infinity],
    [1, NaN],
    [-3, 4],
    [9, 4],
    [0, 0],
    [2, 0],
  ])("onProgress(%s, %s) never renders NaN or a percentage outside 0..100", async (a, b) => {
    rec.hold = true;
    mount(true, 1);
    await ready();
    expect(container.querySelector('[data-testid="agency-loading"]')).not.toBeNull();
    const o = rec.options[0] as { onProgress: (l: number, t: number) => void };
    act(() => {
      o.onProgress(a, b);
    });
    // The Fake resolves at once, so the view may already be ready: loading text is then absent.
    const text = container.querySelector('[data-testid="agency-loading"]')?.textContent ?? "";
    expect(text).not.toMatch(/NaN|undefined|Infinity|-\d/);
    const m = /(\d+) %/.exec(text);
    if (m) expect(Number(m[1])).toBeLessThanOrEqual(100);
  });
});

describe("AgencyView glue: ambient clock", () => {
  const rate = async (speed: number) => {
    rec.ambients.length = 0;
    mount(false, speed);
    await ready();
    tick(1000);
    tick(1100);
    return last();
  };

  it("x1 advances 1 ambient second per second, x10 advances 3", async () => {
    expect(await rate(1)).toBeCloseTo(0.1, 6);
    act(() => root.unmount());
    root = createRoot(container);
    expect(await rate(10)).toBeCloseTo(0.3, 6);
  });

  it.each([0, -5, NaN, Infinity, 3, 1e9])("absurd speed %s counts as x1", async (s) => {
    expect(await rate(s)).toBeCloseTo(0.1, 6);
  });

  it("a long pause then resume does not make the ambient time jump", async () => {
    mount(false, 1);
    await ready();
    tick(1000);
    tick(1016);
    mount(true, 1);
    const frozen = last();
    tick(50_000);
    expect(last()).toBe(frozen);
    mount(false, 1);
    tick(900_000);
    tick(900_016);
    expect(last() - frozen).toBeLessThan(0.1);
  });

  it("a tab left in the background (one 10 minute frame) moves the ambient by 250 ms at most", async () => {
    mount(false, 10);
    await ready();
    tick(1000);
    const before = last();
    tick(1000 + 600_000);
    expect(last() - before).toBeLessThanOrEqual(0.75 + 1e-9);
  });
});

describe("AgencyView glue: quality", () => {
  it("sustained slow frames lower the tier medium then low, and never raise it", async () => {
    mount(false, 1);
    await ready();
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += 40;
      tick(t);
    }
    const host = el();
    expect(rec.tiers.length).toBeGreaterThan(0);
    expect(rec.tiers.length).toBeLessThanOrEqual(2);
    expect(rec.tiers[rec.tiers.length - 1]).toBe("low");
    expect(host?.dataset["quality"]).toBe("low");
  });

  it("starts from the tier the scene really uses when it lowered the requested one", async () => {
    rec.effectiveTier = "low";
    mount(false, 1);
    await ready();
    expect(el()?.dataset["quality"]).toBe("low");
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += 40;
      tick(t);
    }
    // Already at the lowest tier: slow frames cannot lower it further.
    expect(rec.tiers).toEqual([]);
    expect(el()?.dataset["quality"]).toBe("low");
  });

  it("fast frames never change the tier", async () => {
    mount(false, 1);
    await ready();
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += 8;
      tick(t);
    }
    expect(rec.tiers).toEqual([]);
  });

  it("a setQuality that throws (lost GPU context) does not kill the frame loop silently", async () => {
    rec.setQualityThrows = true;
    mount(false, 1);
    await ready();
    let t = 0;
    let escaped: unknown = null;
    for (let i = 0; i < 400 && escaped === null; i++) {
      t += 40;
      escaped = tick(t);
    }
    // Either the error is handled (fallback) or the loop keeps running; never an uncaught throw.
    expect(escaped).toBeNull();
    expect(el()?.getAttribute("data-state") === "fallback" || frames.size > 0).toBe(true);
  });
});
