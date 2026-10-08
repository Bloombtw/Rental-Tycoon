import { LIGHT_COLORS } from "./palette";
import type { Point3 } from "./iso";

/**
 * Light cycle from 09:00 to 21:00 as a pure function of the time of day (spec 2.4).
 * No three, no DOM. Colours are 0xRRGGBB numbers.
 */

export type LightKey = "morning" | "noon" | "afternoon" | "golden" | "sunset" | "dusk" | "late";

export interface LightKeyframe {
  /** Minutes since 09:00. */
  readonly minute: number;
  readonly key: LightKey;
  /** From the north (-z), clockwise towards the east (+x). */
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly sunIntensity: number;
  readonly hemiIntensity: number;
  readonly ambientIntensity: number;
}

export const LIGHT_KEYFRAMES: readonly LightKeyframe[] = Object.freeze([
  kf(0, "morning", 115, 30, 2.2, 0.9, 0.15),
  kf(150, "noon", 160, 55, 2.6, 0.95, 0.15),
  kf(360, "afternoon", 220, 48, 2.5, 0.95, 0.15),
  kf(510, "golden", 250, 30, 2.2, 0.85, 0.12),
  kf(600, "sunset", 262, 18, 1.7, 0.7, 0.1),
  kf(660, "dusk", 272, 13, 1.1, 0.6, 0.1),
  kf(720, "late", 280, 12, 0.6, 0.5, 0.12),
]);

function kf(
  minute: number,
  key: LightKey,
  azimuthDeg: number,
  elevationDeg: number,
  sunIntensity: number,
  hemiIntensity: number,
  ambientIntensity: number,
): LightKeyframe {
  return Object.freeze({
    minute,
    key,
    azimuthDeg,
    elevationDeg,
    sunIntensity,
    hemiIntensity,
    ambientIntensity,
  });
}

export const MIN_SUN_ELEVATION_DEG = 12,
  LAMPS_ON_MINUTE = 570,
  LAMPS_FULL_MINUTE = 585,
  HEADLIGHTS_ON_MINUTE = 585;

const LAST_MINUTE = 720;

export interface LightState {
  /** Unit vector from the ground towards the sun. */
  readonly sunDir: Point3;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly ambientIntensity: number;
  readonly sky: number;
  /** 0 before 18:30, 1 from 18:45. */
  readonly lampGlow: number;
  readonly lampsOn: boolean;
  readonly headlightsOn: boolean;
}

const RGB_MASK = (1 << 24) - 1;

function channel(color: number, shift: number): number {
  return Math.min(255, Math.max(0, Math.round((color >> shift) & 0xff)));
}

/** Channel-by-channel sRGB blend; t is clamped to [0, 1] (non-finite -> 0). Result is a 24-bit colour. */
export function lerpColor(a: number, b: number, t: number): number {
  const ca = typeof a === "number" && Number.isFinite(a) ? Math.trunc(a) & RGB_MASK : 0;
  const cb = typeof b === "number" && Number.isFinite(b) ? Math.trunc(b) & RGB_MASK : 0;
  const k = typeof t === "number" && Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const x = channel(ca, shift);
    const y = channel(cb, shift);
    out = (out << 8) | Math.min(255, Math.max(0, Math.round(x + (y - x) * k)));
  }
  return out >>> 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Unit vector towards the sun for an azimuth from the north (clockwise) and an elevation. */
function sunDirection(azimuthDeg: number, elevationDeg: number): Point3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (Math.max(MIN_SUN_ELEVATION_DEG, elevationDeg) * Math.PI) / 180;
  return {
    x: Math.sin(az) * Math.cos(el),
    y: Math.sin(el),
    z: -Math.cos(az) * Math.cos(el),
  };
}

const FIRST = LIGHT_KEYFRAMES[0] as LightKeyframe;
const LAST = LIGHT_KEYFRAMES[LIGHT_KEYFRAMES.length - 1] as LightKeyframe;

/** `timeOfDay` in minutes since 09:00, bounded to [0, 720]; a non-finite value counts as 0. */
export function lightAt(timeOfDay: number): LightState {
  const t =
    typeof timeOfDay === "number" && Number.isFinite(timeOfDay)
      ? Math.min(LAST_MINUTE, Math.max(0, timeOfDay))
      : 0;
  let from = FIRST;
  let to = LAST;
  for (let i = 0; i + 1 < LIGHT_KEYFRAMES.length; i++) {
    const a = LIGHT_KEYFRAMES[i];
    const b = LIGHT_KEYFRAMES[i + 1];
    if (a && b && t >= a.minute && t <= b.minute) {
      from = a;
      to = b;
      break;
    }
  }
  const span = to.minute - from.minute;
  const k = span > 0 ? (t - from.minute) / span : 0;
  const ca = LIGHT_COLORS[from.key];
  const cb = LIGHT_COLORS[to.key];
  return {
    sunDir: sunDirection(
      lerp(from.azimuthDeg, to.azimuthDeg, k),
      lerp(from.elevationDeg, to.elevationDeg, k),
    ),
    sunColor: lerpColor(ca.sun, cb.sun, k),
    sunIntensity: lerp(from.sunIntensity, to.sunIntensity, k),
    hemiSky: lerpColor(ca.hemiSky, cb.hemiSky, k),
    hemiGround: lerpColor(ca.hemiGround, cb.hemiGround, k),
    hemiIntensity: lerp(from.hemiIntensity, to.hemiIntensity, k),
    ambientIntensity: lerp(from.ambientIntensity, to.ambientIntensity, k),
    sky: lerpColor(ca.sky, cb.sky, k),
    lampGlow: Math.min(
      1,
      Math.max(0, (t - LAMPS_ON_MINUTE) / (LAMPS_FULL_MINUTE - LAMPS_ON_MINUTE)),
    ),
    lampsOn: t >= LAMPS_ON_MINUTE,
    headlightsOn: t >= HEADLIGHTS_ON_MINUTE,
  };
}
