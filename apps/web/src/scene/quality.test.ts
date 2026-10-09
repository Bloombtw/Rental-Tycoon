import { describe, expect, it } from "vitest";
import {
  FRAME_WINDOW,
  INITIAL_MONITOR,
  SLOW_FRAME_MS,
  SLOW_WINDOWS,
  TIER_COOLDOWN_MS,
  TIER_SETTINGS,
  initialTier,
  observeFrame,
  type FrameMonitor,
  type QualityTier,
} from "./quality";

const T0 = 1_000_000;

/** Feeds `frames` frames of `dt` ms, `nowMs` advancing by dt each frame. Returns the final state. */
function feed(
  state: { m: FrameMonitor; tier: QualityTier; now: number },
  frames: number,
  dt: number,
  onChange?: (tier: QualityTier, now: number) => void,
): void {
  for (let i = 0; i < frames; i++) {
    state.now += Math.max(0, Number.isFinite(dt) ? dt : 16);
    const r = observeFrame(state.m, state.tier, dt, state.now);
    if (r.tier !== state.tier) onChange?.(r.tier, state.now);
    state.m = r.monitor;
    state.tier = r.tier;
  }
}
const fresh = (tier: QualityTier = "high") => ({ m: INITIAL_MONITOR, tier, now: T0 });

describe("constants and tier table (spec 2.6)", () => {
  it("match the spec", () => {
    expect([FRAME_WINDOW, SLOW_FRAME_MS, SLOW_WINDOWS, TIER_COOLDOWN_MS]).toEqual([
      60, 20, 2, 5000,
    ]);
    expect(TIER_SETTINGS).toEqual({
      high: {
        pixelRatioCap: 1.5,
        shadowMapSize: 2048,
        softShadows: false,
        trafficMax: 24,
        trafficMin: 8,
        lampPools: true,
        propShadows: true,
      },
      medium: {
        pixelRatioCap: 1.25,
        shadowMapSize: 1024,
        softShadows: false,
        trafficMax: 14,
        trafficMin: 5,
        lampPools: true,
        propShadows: true,
      },
      low: {
        pixelRatioCap: 1,
        shadowMapSize: 1024,
        softShadows: false,
        trafficMax: 6,
        trafficMin: 2,
        lampPools: false,
        propShadows: false,
      },
    });
  });
});

describe("initialTier", () => {
  it.each([
    [{}, "high"],
    [{ hardwareConcurrency: 8, deviceMemory: 8, maxTextureSize: 16384 }, "high"],
    [{ hardwareConcurrency: 2 }, "low"],
    [{ hardwareConcurrency: 1 }, "low"],
    [{ deviceMemory: 2 }, "low"],
    [{ deviceMemory: 0.5 }, "low"],
    [{ maxTextureSize: 4095 }, "low"],
    [{ maxTextureSize: 4096 }, "high"],
    [{ hardwareConcurrency: 4, deviceMemory: 4 }, "medium"],
    [{ hardwareConcurrency: 3, deviceMemory: 3 }, "medium"],
    [{ hardwareConcurrency: 4 }, "high"],
    [{ deviceMemory: 4 }, "high"],
    [{ hardwareConcurrency: 8, deviceMemory: 4 }, "high"],
    [{ hardwareConcurrency: 4, deviceMemory: 8 }, "high"],
    [{ hardwareConcurrency: 4, deviceMemory: 4, maxTextureSize: 2048 }, "low"],
    [{ hardwareConcurrency: 2, deviceMemory: 8, maxTextureSize: 16384 }, "low"],
  ] as [Parameters<typeof initialTier>[0], QualityTier][])("%j -> %s", (hints, tier) => {
    expect(initialTier(hints)).toBe(tier);
  });

  it.each([NaN, Infinity, -Infinity, "2", "abc", null, undefined, {}, [], true, 10n])(
    "ignores the non numeric hint %s",
    (bad) => {
      expect(initialTier({ hardwareConcurrency: bad })).toBe("high");
      expect(initialTier({ deviceMemory: bad })).toBe("high");
      expect(initialTier({ maxTextureSize: bad })).toBe("high");
      expect(
        initialTier({ hardwareConcurrency: bad, deviceMemory: bad, maxTextureSize: bad }),
      ).toBe("high");
    },
  );

  it("a hostile hint does not hide a real low-end signal", () => {
    expect(initialTier({ hardwareConcurrency: NaN, deviceMemory: 2 })).toBe("low");
    expect(initialTier({ hardwareConcurrency: "x", maxTextureSize: 2048 })).toBe("low");
  });
});

describe("observeFrame", () => {
  it("starts empty", () => {
    expect(INITIAL_MONITOR).toMatchObject({ sum: 0, count: 0, slowWindows: 0 });
  });

  it("steps down only after two slow windows (119 slow frames are not enough)", () => {
    const s = fresh();
    feed(s, 119, 30);
    expect(s.tier).toBe("high");
    feed(s, 1, 30);
    expect(s.tier).toBe("medium");
  });

  it("one slow window followed by a fast one resets the count", () => {
    const s = fresh();
    feed(s, 60, 30);
    feed(s, 60, 10);
    feed(s, 60, 30);
    expect(s.tier).toBe("high");
    feed(s, 60, 30);
    expect(s.tier).toBe("medium");
  });

  it("a window averaging exactly 20 ms is not slow, 20.5 ms is", () => {
    const a = fresh();
    feed(a, 600, 20);
    expect(a.tier).toBe("high");
    const b = fresh();
    feed(b, 120, 20.5);
    expect(b.tier).toBe("medium");
  });

  it("one long hitch among fast frames does not trigger a step", () => {
    const s = fresh();
    for (let w = 0; w < 10; w++) {
      feed(s, 59, 10);
      feed(s, 1, 250);
    }
    expect(s.tier).toBe("high");
  });

  it("ignores dt > 250, NaN and infinite: nothing is counted", () => {
    for (const dt of [251, 300, 1e9, NaN, Infinity, -Infinity]) {
      const s = fresh();
      for (let i = 0; i < 400; i++) {
        const r = observeFrame(s.m, s.tier, dt, T0 + i * 40);
        s.m = r.monitor;
        s.tier = r.tier;
      }
      expect(s.tier).toBe("high");
      expect(s.m.count).toBe(0);
      expect(s.m.sum).toBe(0);
    }
  });

  it("dt of exactly 250 ms counts", () => {
    const s = fresh();
    feed(s, 120, 250);
    expect(s.tier).toBe("medium");
  });

  it("negative dt never poisons the monitor nor steps down", () => {
    const s = fresh();
    feed(s, 500, -16);
    expect(s.tier).toBe("high");
    for (const v of [s.m.sum, s.m.count, s.m.slowWindows]) expect(Number.isFinite(v)).toBe(true);
    // a negative frame must not let later slow frames hide in the average either
    feed(s, 119, 30);
    expect(s.tier).toBe("high");
    feed(s, 10, 30);
    expect(s.tier).toBe("medium");
  });

  it("never steps up, whatever follows", () => {
    for (const tier of ["high", "medium", "low"] as const) {
      const s = fresh(tier);
      feed(s, 6000, 4);
      expect(s.tier).toBe(tier);
    }
    const s = fresh();
    feed(s, 120, 30);
    expect(s.tier).toBe("medium");
    feed(s, 6000, 4);
    expect(s.tier).toBe("medium");
  });

  it("goes high -> medium -> low, waits for the cooldown, and stops at low", () => {
    const s = fresh();
    const changes: [QualityTier, number][] = [];
    feed(s, 3000, 30, (t, n) => changes.push([t, n]));
    expect(changes.map((c) => c[0])).toEqual(["medium", "low"]);
    const [first, second] = changes;
    expect((second?.[1] ?? 0) - (first?.[1] ?? 0)).toBeGreaterThanOrEqual(TIER_COOLDOWN_MS);
    expect(s.tier).toBe("low");
  });

  it("a low tier stays low under any load", () => {
    const s = fresh("low");
    feed(s, 3000, 100);
    expect(s.tier).toBe("low");
  });

  it("a non finite clock cannot crash or step down by accident", () => {
    const s = fresh();
    for (let i = 0; i < 240; i++) {
      const r = observeFrame(s.m, s.tier, 30, NaN);
      s.m = r.monitor;
      s.tier = r.tier;
    }
    for (const v of [s.m.sum, s.m.count, s.m.slowWindows]) expect(Number.isFinite(v)).toBe(true);
    expect(["high", "medium"]).toContain(s.tier);
  });

  it("does not mutate the monitor it is given", () => {
    const m = Object.freeze({ ...INITIAL_MONITOR });
    expect(() => observeFrame(m, "high", 16, T0)).not.toThrow();
    expect(m).toEqual(INITIAL_MONITOR);
  });
});
