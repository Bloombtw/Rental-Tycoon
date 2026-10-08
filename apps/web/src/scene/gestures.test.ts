import { describe, expect, it } from "vitest";
import {
  INITIAL_GESTURE,
  pinchStep,
  reduceGesture,
  TAP_MAX_MS,
  TAP_SLOP_PX,
  type GestureEffect,
  type GestureState,
  type PointerInput,
} from "./gestures";

type Kind = PointerInput["kind"];

function ev(
  kind: Kind,
  id: number,
  x: number,
  y: number,
  t: number,
  pointerType = "touch",
  buttons = kind === "up" || kind === "cancel" ? 0 : 1,
): PointerInput {
  return { kind, id, x, y, t, pointerType, buttons };
}

function run(events: readonly PointerInput[], start: GestureState = INITIAL_GESTURE) {
  let state = start;
  const effects: GestureEffect[] = [];
  for (const e of events) {
    const r = reduceGesture(state, e);
    state = r.state;
    effects.push(r.effect);
  }
  return { state, effects, last: effects[effects.length - 1] };
}

const types = (effects: readonly GestureEffect[]) => effects.map((e) => e.type);

describe("tap", () => {
  it("down + up at the same place is a tap at the up position", () => {
    const { last } = run([ev("down", 1, 50, 60, 0), ev("up", 1, 50, 60, 100)]);
    expect(last).toEqual({ type: "tap", x: 50, y: 60 });
  });

  it("exactly TAP_SLOP_PX away is still a tap, a hair more is not", () => {
    expect(run([ev("down", 1, 0, 0, 0), ev("up", 1, TAP_SLOP_PX, 0, 10)]).last?.type).toBe("tap");
    expect(run([ev("down", 1, 0, 0, 0), ev("up", 1, TAP_SLOP_PX + 0.01, 0, 10)]).last?.type).toBe(
      "none",
    );
  });

  it("slop is Euclidean: (7,7) is 9.9px (tap), (8,8) is 11.3px (not)", () => {
    expect(run([ev("down", 1, 0, 0, 0), ev("up", 1, 7, 7, 10)]).last?.type).toBe("tap");
    expect(run([ev("down", 1, 0, 0, 0), ev("up", 1, 8, 8, 10)]).last?.type).toBe("none");
  });

  it("exactly TAP_MAX_MS is a tap, one more ms is not", () => {
    expect(run([ev("down", 1, 5, 5, 1000), ev("up", 1, 5, 5, 1000 + TAP_MAX_MS)]).last?.type).toBe(
      "tap",
    );
    expect(
      run([ev("down", 1, 5, 5, 1000), ev("up", 1, 5, 5, 1000 + TAP_MAX_MS + 1)]).last?.type,
    ).toBe("none");
  });

  it("a time going backwards or NaN time never yields a tap from garbage", () => {
    expect(run([ev("down", 1, 0, 0, 100), ev("up", 1, 0, 0, NaN)]).last?.type).toBe("none");
  });

  it("small jitter inside the slop emits no pan, and still taps", () => {
    const { effects, last } = run([
      ev("down", 1, 100, 100, 0),
      ev("move", 1, 103, 100, 10),
      ev("move", 1, 100, 104, 20),
      ev("up", 1, 101, 101, 30),
    ]);
    expect(types(effects.slice(1, 3))).toEqual(["none", "none"]);
    expect(last?.type).toBe("tap");
  });

  it("returns to idle after a tap and a second tap works", () => {
    const first = run([ev("down", 1, 0, 0, 0), ev("up", 1, 0, 0, 5)]);
    expect(first.state).toBe(INITIAL_GESTURE);
    const second = run([ev("down", 2, 9, 9, 100), ev("up", 2, 9, 9, 120)], first.state);
    expect(second.last).toEqual({ type: "tap", x: 9, y: 9 });
  });

  it("a double-tap (same id, quick) gives two taps", () => {
    const { effects } = run([
      ev("down", 1, 5, 5, 0),
      ev("up", 1, 5, 5, 20),
      ev("down", 1, 5, 5, 40),
      ev("up", 1, 5, 5, 60),
    ]);
    expect(types(effects).filter((t) => t === "tap")).toHaveLength(2);
  });
});

describe("pan", () => {
  it("crossing the slop starts a pan with the delta of that move", () => {
    const { effects } = run([ev("down", 1, 0, 0, 0), ev("move", 1, 30, 40, 10)]);
    expect(effects[1]).toEqual({ type: "pan", dx: 30, dy: 40 });
  });

  it("subsequent moves pan by their own delta; total equals displacement", () => {
    const { effects } = run([
      ev("down", 1, 0, 0, 0),
      ev("move", 1, 20, 0, 10),
      ev("move", 1, 25, 5, 20),
      ev("move", 1, 10, -5, 30),
    ]);
    let sx = 0;
    let sy = 0;
    for (const e of effects) {
      if (e.type === "pan") {
        sx += e.dx;
        sy += e.dy;
      }
    }
    expect([sx, sy]).toEqual([10, -5]);
  });

  it("slow drift (6px, then 6px) cumulates past the slop and becomes a pan", () => {
    const { effects } = run([
      ev("down", 1, 0, 0, 0),
      ev("move", 1, 6, 0, 10),
      ev("move", 1, 12, 0, 20),
    ]);
    expect(effects[2]?.type).toBe("pan");
  });

  it("dragging out and back to the origin is not a tap", () => {
    const { last } = run([
      ev("down", 1, 0, 0, 0),
      ev("move", 1, 50, 0, 10),
      ev("move", 1, 0, 0, 20),
      ev("up", 1, 0, 0, 30),
    ]);
    expect(last?.type).toBe("none");
  });

  it("a long press without motion is not a tap", () => {
    expect(run([ev("down", 1, 0, 0, 0), ev("up", 1, 0, 0, 5000)]).last?.type).toBe("none");
  });
});

describe("pinch", () => {
  const start = [ev("down", 1, 100, 100, 0), ev("down", 2, 200, 100, 5)];

  it("two pointers enter a pinch; spreading doubles the factor", () => {
    const { last } = run([...start, ev("move", 2, 300, 100, 10)]);
    expect(last).toEqual({
      type: "pinch",
      factor: 2,
      anchor: { x: 200, y: 100 },
      dx: 50,
      dy: 0,
    });
  });

  it("moving both fingers together (same distance) is factor 1 with a displacement", () => {
    const { last } = run([...start, ev("move", 1, 110, 130, 10)]);
    expect(last?.type).toBe("pinch");
    if (last?.type === "pinch") expect(last.factor).not.toBe(1); // only one finger moved: distance changed
    const both = run([...start, ev("move", 1, 110, 130, 10), ev("move", 2, 210, 130, 11)]);
    // translating both fingers by the same vector: the factors multiply back to 1
    let product = 1;
    for (const e of both.effects) if (e.type === "pinch") product *= e.factor;
    expect(product).toBeCloseTo(1, 9);
  });

  it("a pinch never emits a tap, even when both fingers lift quickly without moving", () => {
    const { effects } = run([...start, ev("up", 2, 200, 100, 20), ev("up", 1, 100, 100, 30)]);
    expect(types(effects)).not.toContain("tap");
  });

  it("lifting one finger mid-pinch continues as a pan with the other, with no tap", () => {
    const { effects, state } = run([
      ...start,
      ev("move", 2, 250, 100, 10),
      ev("up", 2, 250, 100, 20),
      ev("move", 1, 130, 110, 30),
      ev("up", 1, 130, 110, 40),
    ]);
    expect(effects[4]).toEqual({ type: "pan", dx: 30, dy: 10 });
    expect(types(effects)).not.toContain("tap");
    expect(state).toBe(INITIAL_GESTURE);
  });

  it("lifting the first finger keeps the second one panning", () => {
    const { effects } = run([
      ...start,
      ev("up", 1, 100, 100, 10),
      ev("move", 2, 210, 120, 20),
      ev("up", 2, 210, 120, 25),
    ]);
    expect(effects[3]).toEqual({ type: "pan", dx: 10, dy: 20 });
    expect(types(effects)).not.toContain("tap");
  });

  it("a finger lifted mid-pinch and put back down returns to pinching", () => {
    const { state, effects } = run([
      ...start,
      ev("up", 2, 200, 100, 10),
      ev("down", 3, 300, 100, 20),
      ev("move", 3, 340, 100, 30),
    ]);
    expect(state.mode).toBe("pinch");
    expect(effects[4]?.type).toBe("pinch");
  });

  it("a third pointer is ignored: its down, moves and up change nothing", () => {
    const two = run(start);
    const r = run(
      [ev("down", 3, 5, 5, 6), ev("move", 3, 50, 50, 7), ev("up", 3, 50, 50, 8)],
      two.state,
    );
    expect(types(r.effects)).toEqual(["none", "none", "none"]);
    expect(r.state).toEqual(two.state);
  });

  it("cancel of one finger mid-pinch behaves like a lift (no tap)", () => {
    const { effects } = run([...start, ev("cancel", 2, 200, 100, 10), ev("up", 1, 100, 100, 20)]);
    expect(types(effects)).not.toContain("tap");
  });

  it("pointers moving onto the same spot (distance 0) give factor 1, not Infinity/NaN", () => {
    const { last } = run([...start, ev("move", 2, 100, 100, 10)]);
    expect(last?.type).toBe("pinch");
    if (last?.type === "pinch") {
      expect(last.factor).toBe(1);
      expect(Number.isFinite(last.dx) && Number.isFinite(last.dy)).toBe(true);
    }
  });
});

describe("pinchStep", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it("identity", () => {
    expect(pinchStep([a, b], [a, b])).toEqual({ factor: 1, anchor: { x: 50, y: 0 }, dx: 0, dy: 0 });
  });

  it("ratio of distances, anchor is the new midpoint, d is the midpoint motion", () => {
    const r = pinchStep(
      [a, b],
      [
        { x: -50, y: 10 },
        { x: 150, y: 10 },
      ],
    );
    expect(r.factor).toBe(2);
    expect(r.anchor).toEqual({ x: 50, y: 10 });
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(10);
  });

  it("zero previous or new distance gives factor 1", () => {
    expect(pinchStep([a, a], [a, b]).factor).toBe(1);
    expect(pinchStep([a, b], [b, b]).factor).toBe(1);
  });

  it("NaN / Infinity inputs give finite output", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const r = pinchStep([a, b], [{ x: bad, y: 0 }, b]);
      for (const n of [r.factor, r.anchor.x, r.anchor.y, r.dx, r.dy]) {
        expect(Number.isFinite(n)).toBe(true);
      }
      expect(r.factor).toBeGreaterThan(0);
    }
  });
});

describe("mouse and hover", () => {
  it("a mouse move without buttons while idle is a hover", () => {
    const r = reduceGesture(INITIAL_GESTURE, ev("move", 1, 12, 34, 0, "mouse", 0));
    expect(r.effect).toEqual({ type: "hover", x: 12, y: 34 });
    expect(r.state).toBe(INITIAL_GESTURE);
  });

  it("touch and pen moves without a press are not hovers", () => {
    for (const pt of ["touch", "pen"]) {
      expect(reduceGesture(INITIAL_GESTURE, ev("move", 1, 1, 1, 0, pt, 0)).effect.type).toBe(
        "none",
      );
    }
  });

  it("left click is a tap; drag pans", () => {
    expect(
      run([ev("down", 1, 5, 5, 0, "mouse", 1), ev("up", 1, 5, 5, 50, "mouse", 0)]).last?.type,
    ).toBe("tap");
    expect(
      run([ev("down", 1, 5, 5, 0, "mouse", 1), ev("move", 1, 55, 5, 10, "mouse", 1)]).last?.type,
    ).toBe("pan");
  });

  it("right and middle buttons never start a gesture", () => {
    for (const buttons of [2, 4, 0]) {
      const r = reduceGesture(INITIAL_GESTURE, ev("down", 1, 5, 5, 0, "mouse", buttons));
      expect(r.state).toBe(INITIAL_GESTURE);
    }
  });

  it("a mouse that moves with no button after a lost 'up' drops the gesture", () => {
    const { state, last } = run([
      ev("down", 1, 0, 0, 0, "mouse", 1),
      ev("move", 1, 40, 0, 10, "mouse", 0),
    ]);
    expect(state).toBe(INITIAL_GESTURE);
    expect(last?.type).toBe("none");
  });

  it("no hover while a drag is in progress", () => {
    const { last } = run([
      ev("down", 1, 0, 0, 0, "mouse", 1),
      ev("move", 9, 50, 50, 5, "mouse", 0),
    ]);
    expect(last?.type).not.toBe("hover");
  });
});

describe("noise and robustness", () => {
  it.each([NaN, Infinity, -Infinity])("non-finite coordinates (%s) are ignored", (bad) => {
    const mid = run([ev("down", 1, 0, 0, 0)]);
    for (const e of [
      ev("move", 1, bad, 0, 5),
      ev("move", 1, 0, bad, 5),
      ev("up", 1, bad, bad, 5),
    ]) {
      const r = reduceGesture(mid.state, e);
      expect(r.state).toBe(mid.state);
      expect(r.effect.type).toBe("none");
    }
  });

  it("a non-finite pointer id is ignored", () => {
    expect(reduceGesture(INITIAL_GESTURE, ev("down", NaN, 0, 0, 0)).state).toBe(INITIAL_GESTURE);
  });

  it("events for unknown ids (up, move, cancel) change nothing", () => {
    const mid = run([ev("down", 1, 0, 0, 0)]);
    for (const k of ["up", "move", "cancel"] as const) {
      const r = reduceGesture(mid.state, ev(k, 99, 5, 5, 5));
      expect(r.state).toEqual(mid.state);
      expect(r.effect.type).toBe("none");
    }
  });

  it("up / move / cancel from idle are harmless", () => {
    for (const k of ["up", "move", "cancel"] as const) {
      const r = reduceGesture(INITIAL_GESTURE, ev(k, 1, 5, 5, 5));
      expect(r.state).toEqual(INITIAL_GESTURE);
      expect(r.effect.type).toBe("none");
    }
  });

  it("a duplicate down for a tracked id does not start a pinch", () => {
    const mid = run([ev("down", 1, 0, 0, 0), ev("down", 1, 0, 0, 1)]);
    expect(mid.state.mode).toBe("press");
  });

  it("cancel of the only pointer returns to idle without a tap", () => {
    const { state, last } = run([ev("down", 1, 0, 0, 0), ev("cancel", 1, 0, 0, 10)]);
    expect(state).toBe(INITIAL_GESTURE);
    expect(last?.type).not.toBe("tap");
  });

  it("is immutable: frozen states never throw and are never mutated", () => {
    const deepFreeze = <T>(v: T): T => {
      if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
        Object.freeze(v);
        for (const k of Object.keys(v)) deepFreeze(Reflect.get(v, k));
      }
      return v;
    };
    let state: GestureState = INITIAL_GESTURE;
    const seq = [
      ev("down", 1, 0, 0, 0),
      ev("down", 2, 100, 0, 1),
      ev("move", 2, 150, 0, 2),
      ev("up", 1, 0, 0, 3),
      ev("move", 2, 160, 10, 4),
      ev("up", 2, 160, 10, 5),
    ];
    for (const e of seq) {
      state = deepFreeze(reduceGesture(state, deepFreeze(e)).state);
    }
    expect(state.mode).toBe("idle");
  });

  it("random event soup never throws, never emits NaN, and a lone down+up afterwards still taps", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const kinds: Kind[] = ["down", "move", "up", "cancel"];
    let state: GestureState = INITIAL_GESTURE;
    for (let i = 0; i < 5000; i++) {
      const kind = kinds[Math.floor(rnd() * 4)] ?? "move";
      const e = ev(
        kind,
        Math.floor(rnd() * 4),
        rnd() * 400,
        rnd() * 800,
        i * 7,
        rnd() < 0.3 ? "mouse" : "touch",
        Math.floor(rnd() * 3),
      );
      const r = reduceGesture(state, e);
      state = r.state;
      const eff = r.effect;
      if (eff.type === "pan") expect(Number.isFinite(eff.dx + eff.dy)).toBe(true);
      if (eff.type === "pinch") {
        expect(Number.isFinite(eff.factor + eff.dx + eff.dy + eff.anchor.x + eff.anchor.y)).toBe(
          true,
        );
        expect(eff.factor).toBeGreaterThan(0);
      }
      expect(state.pointers.length).toBeLessThanOrEqual(2);
    }
    // release everything, then a clean tap must still work
    for (let id = 0; id < 4; id++) state = reduceGesture(state, ev("cancel", id, 0, 0, 1e6)).state;
    const fresh = run([ev("down", 7, 1, 1, 2e6), ev("up", 7, 1, 1, 2e6 + 10)], state);
    expect(fresh.last?.type).toBe("tap");
  });
});
