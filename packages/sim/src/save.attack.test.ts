import { describe, expect, it } from "vitest";
import {
  CAR_MODEL_IDS,
  InvalidGameStateError,
  advance,
  advanceMinutes,
  buyCar,
  createGame,
  setCarPrice,
  validateGameState,
  type GameState,
} from "./index.js";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("save attacks", () => {
  it("every state reachable by the sim survives JSON round-trip + validation", () => {
    for (let n = 0; n < 150; n++) {
      const r = lcg(n * 7919 + 1);
      let s: GameState = createGame(Math.floor(r() * 2 ** 32));
      for (let step = 0; step < 25; step++) {
        const k = Math.floor(r() * 5);
        try {
          if (k === 0)
            s = buyCar(s, CAR_MODEL_IDS[Math.floor(r() * CAR_MODEL_IDS.length)] ?? "used");
          else if (k === 1 && s.fleet.length > 0)
            s = setCarPrice(
              s,
              s.fleet[Math.floor(r() * s.fleet.length)]?.id ?? 1,
              Math.floor(r() * 300_00),
            );
          else if (k === 2) s = advanceMinutes(s, Math.floor(r() * 1500));
          else if (k === 3) s = advance(s, Math.floor(r() * 30));
          else s = advanceMinutes(s, 1);
        } catch {
          /* refused action */
        }
        const copy = validateGameState(JSON.parse(JSON.stringify(s)));
        expect(copy).toEqual(s);
      }
    }
  });

  it("rejects __proto__ model, prototype-polluting keys do not leak", () => {
    const s = JSON.parse(JSON.stringify(buyCar(createGame(1), "used"))) as Record<string, unknown>;
    const fleet = s["fleet"] as Record<string, unknown>[];
    fleet[0] = { ...fleet[0], model: "__proto__" };
    expect(() => validateGameState(s)).toThrow(InvalidGameStateError);
    const extra = JSON.parse(
      '{"__proto__":{"polluted":1},"seed":1,"rngState":1,"day":0,"minute":0,"cash":1,"todayRevenue":0,"customersLeft":0,"upgrades":{"parking":0,"counter":0,"ads":0,"wash":0},"xp":0,"managers":{"sales":false,"pricing":false},"fleet":[],"lastDay":null}',
    ) as unknown;
    const out = validateGameState(extra) as unknown as Record<string, unknown>;
    expect(out["polluted"]).toBeUndefined();
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
