import { describe, expect, it } from "vitest";
import {
  HEADLIGHTS_ON_MINUTE,
  LAMPS_FULL_MINUTE,
  LAMPS_ON_MINUTE,
  LIGHT_KEYFRAMES,
  MIN_SUN_ELEVATION_DEG,
  lerpColor,
  lightAt,
  type LightState,
} from "./lighting";
import { LIGHT_COLORS } from "./palette";

const isColor = (c: unknown) =>
  typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 0xffffff;
const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const rad = (d: number) => (d * Math.PI) / 180;
const norm = (s: LightState) => Math.hypot(s.sunDir.x, s.sunDir.y, s.sunDir.z);
const numbers = (s: LightState) => [
  s.sunDir.x,
  s.sunDir.y,
  s.sunDir.z,
  s.sunIntensity,
  s.hemiIntensity,
  s.ambientIntensity,
  s.lampGlow,
];
const colors = (s: LightState) => [s.sunColor, s.hemiSky, s.hemiGround, s.sky];

describe("keyframes (spec 2.4 table)", () => {
  it("match the table", () => {
    expect(
      LIGHT_KEYFRAMES.map((k) => [
        k.minute,
        k.key,
        k.azimuthDeg,
        k.elevationDeg,
        k.sunIntensity,
        k.hemiIntensity,
        k.ambientIntensity,
      ]),
    ).toEqual([
      [0, "morning", 115, 30, 2.2, 0.9, 0.15],
      [150, "noon", 160, 55, 2.6, 0.95, 0.15],
      [360, "afternoon", 220, 48, 2.5, 0.95, 0.15],
      [510, "golden", 250, 30, 2.2, 0.85, 0.12],
      [600, "sunset", 262, 18, 1.7, 0.7, 0.1],
      [660, "dusk", 272, 13, 1.1, 0.6, 0.1],
      [720, "late", 280, 12, 0.6, 0.5, 0.12],
    ]);
    expect([
      MIN_SUN_ELEVATION_DEG,
      LAMPS_ON_MINUTE,
      LAMPS_FULL_MINUTE,
      HEADLIGHTS_ON_MINUTE,
    ]).toEqual([12, 570, 585, 585]);
  });

  it("every light key has valid colours, afternoon keeps the revision 6 values", () => {
    expect(Object.keys(LIGHT_COLORS).sort()).toEqual(
      ["afternoon", "dusk", "golden", "late", "morning", "noon", "sunset"].sort(),
    );
    for (const c of Object.values(LIGHT_COLORS)) {
      for (const v of Object.values(c)) expect(isColor(v)).toBe(true);
    }
    expect(LIGHT_COLORS.afternoon).toEqual({
      sky: 0xbfe3f2,
      sun: 0xfff1d6,
      hemiSky: 0xcfe8ff,
      hemiGround: 0x9bb07a,
    });
  });
});

describe("lerpColor", () => {
  it("endpoints, channel-wise rounding, clamped t", () => {
    expect(lerpColor(0x102030, 0x405060, 0)).toBe(0x102030);
    expect(lerpColor(0x102030, 0x405060, 1)).toBe(0x405060);
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(lerpColor(0x102030, 0x405060, -5)).toBe(0x102030);
    expect(lerpColor(0x102030, 0x405060, 9)).toBe(0x405060);
  });
  it.each([NaN, Infinity, -Infinity])("t = %s still yields a valid colour", (t) => {
    expect(isColor(lerpColor(0x102030, 0x405060, t))).toBe(true);
  });
});

describe("lightAt", () => {
  it("is exact at the keyframes", () => {
    for (const k of LIGHT_KEYFRAMES) {
      const s = lightAt(k.minute);
      const az = rad(k.azimuthDeg);
      const el = rad(k.elevationDeg);
      expect(s.sunDir.x).toBeCloseTo(Math.sin(az) * Math.cos(el), 9);
      expect(s.sunDir.y).toBeCloseTo(Math.sin(el), 9);
      expect(s.sunDir.z).toBeCloseTo(-Math.cos(az) * Math.cos(el), 9);
      expect(s.sunIntensity).toBeCloseTo(k.sunIntensity, 9);
      expect(s.hemiIntensity).toBeCloseTo(k.hemiIntensity, 9);
      expect(s.ambientIntensity).toBeCloseTo(k.ambientIntensity, 9);
      const c = LIGHT_COLORS[k.key];
      expect([s.sky, s.sunColor, s.hemiSky, s.hemiGround]).toEqual([
        c.sky,
        c.sun,
        c.hemiSky,
        c.hemiGround,
      ]);
    }
  });

  it("matches an independent linear interpolation between keyframes", () => {
    for (let t = 0; t <= 720; t += 7.3) {
      let i = 0;
      while (i + 2 < LIGHT_KEYFRAMES.length && t > (LIGHT_KEYFRAMES[i + 1]?.minute ?? 0)) i++;
      const a = LIGHT_KEYFRAMES[i];
      const b = LIGHT_KEYFRAMES[i + 1];
      if (!a || !b) throw new Error("keyframes");
      const k = (t - a.minute) / (b.minute - a.minute);
      const s = lightAt(t);
      expect(s.sunIntensity).toBeCloseTo(a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k, 9);
      expect(s.hemiIntensity).toBeCloseTo(
        a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * k,
        9,
      );
      expect(s.ambientIntensity).toBeCloseTo(
        a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * k,
        9,
      );
      expect(s.sunDir.y).toBeCloseTo(
        Math.sin(rad(a.elevationDeg + (b.elevationDeg - a.elevationDeg) * k)),
        9,
      );
      expect(s.sky).toBe(lerpColor(LIGHT_COLORS[a.key].sky, LIGHT_COLORS[b.key].sky, k));
    }
  });

  it("is continuous everywhere, with no jump at the keyframes", () => {
    let prev = lightAt(0);
    for (let t = 0.02; t <= 720; t += 0.02) {
      const s = lightAt(t);
      expect(Math.abs(s.sunIntensity - prev.sunIntensity)).toBeLessThan(0.001);
      expect(Math.abs(s.hemiIntensity - prev.hemiIntensity)).toBeLessThan(0.001);
      expect(Math.abs(s.ambientIntensity - prev.ambientIntensity)).toBeLessThan(0.001);
      expect(
        Math.hypot(
          s.sunDir.x - prev.sunDir.x,
          s.sunDir.y - prev.sunDir.y,
          s.sunDir.z - prev.sunDir.z,
        ),
      ).toBeLessThan(0.002);
      if (s.lampGlow < 1 && prev.lampGlow < 1) {
        expect(Math.abs(s.lampGlow - prev.lampGlow)).toBeLessThan(0.002);
      }
      colors(s).forEach((c, j) => {
        channels(c).forEach((v, ch) => {
          expect(Math.abs(v - (channels(colors(prev)[j] ?? 0)[ch] ?? 0))).toBeLessThanOrEqual(1);
        });
      });
      prev = s;
    }
  });

  it("sun is a unit vector between 12 and 60 degrees, east in the morning, west in the evening", () => {
    for (let t = 0; t <= 720; t += 1.7) {
      const s = lightAt(t);
      expect(norm(s)).toBeCloseTo(1, 9);
      const elevation = (Math.asin(s.sunDir.y) * 180) / Math.PI;
      expect(elevation).toBeGreaterThanOrEqual(MIN_SUN_ELEVATION_DEG - 1e-9);
      expect(elevation).toBeLessThanOrEqual(60 + 1e-9);
    }
    expect(lightAt(0).sunDir.x).toBeGreaterThan(0);
    expect(lightAt(720).sunDir.x).toBeLessThan(0);
  });

  it("sun intensity never rises from 15:00 to 21:00", () => {
    let prev = lightAt(360).sunIntensity;
    for (let t = 360; t <= 720; t += 0.5) {
      const v = lightAt(t).sunIntensity;
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });

  it("lamps on at 18:30, full at 18:45, headlights from 18:45", () => {
    expect(lightAt(569).lampsOn).toBe(false);
    expect(lightAt(569.99).lampsOn).toBe(false);
    expect(lightAt(570).lampsOn).toBe(true);
    expect(lightAt(569).lampGlow).toBe(0);
    expect(lightAt(570).lampGlow).toBe(0);
    expect(lightAt(577.5).lampGlow).toBeCloseTo(0.5, 9);
    expect(lightAt(585).lampGlow).toBe(1);
    expect(lightAt(720).lampGlow).toBe(1);
    expect(lightAt(584.99).headlightsOn).toBe(false);
    expect(lightAt(585).headlightsOn).toBe(true);
    expect(lightAt(300).headlightsOn).toBe(false);
    expect(lightAt(300).lampGlow).toBe(0);
  });

  it("non-finite input counts as 09:00 and out-of-range input is clamped", () => {
    const start = lightAt(0);
    const end = lightAt(720);
    for (const bad of [
      NaN,
      Infinity,
      -Infinity,
      null,
      undefined,
      "300",
      {},
    ] as unknown as number[]) {
      expect(lightAt(bad)).toEqual(start);
    }
    for (const t of [-1, -1e9, -0.001]) expect(lightAt(t)).toEqual(start);
    for (const t of [720.001, 1e9, Number.MAX_VALUE]) expect(lightAt(t)).toEqual(end);
  });

  it("everything is finite and every colour is an integer in 0..0xffffff", () => {
    for (const t of [-5, 0, 1, 149.9, 150, 569.9, 585, 719.9, 720, 800, NaN]) {
      const s = lightAt(t);
      expect(numbers(s).every(Number.isFinite)).toBe(true);
      expect(colors(s).every(isColor)).toBe(true);
    }
  });

  it("does not return a shared mutable object", () => {
    const a = lightAt(100);
    expect(lightAt(100)).toEqual(a);
    expect(lightAt(100)).not.toBe(a);
  });
});
