/**
 * Render quality tiers and frame-time adaptation (spec 2.6). Pure: no three, no DOM.
 * The tier only ever goes down during a session.
 */

export type QualityTier = "high" | "medium" | "low";

export interface TierSettings {
  readonly pixelRatioCap: number;
  readonly shadowMapSize: number;
  readonly softShadows: boolean;
  readonly trafficMax: number;
  readonly trafficMin: number;
  readonly lampPools: boolean;
  readonly propShadows: boolean;
}

export const TIER_SETTINGS: Readonly<Record<QualityTier, TierSettings>> = Object.freeze({
  // Fill rate dominates on phones and laptops: past 1.5x the gain is invisible on a low-poly
  // scene, and PCF soft shadows cost several texture taps per pixel for a barely visible blur.
  high: Object.freeze({
    pixelRatioCap: 1.5,
    shadowMapSize: 2048,
    softShadows: false,
    trafficMax: 24,
    trafficMin: 8,
    lampPools: true,
    propShadows: true,
  }),
  medium: Object.freeze({
    pixelRatioCap: 1.25,
    shadowMapSize: 1024,
    softShadows: false,
    trafficMax: 14,
    trafficMin: 5,
    lampPools: true,
    propShadows: true,
  }),
  low: Object.freeze({
    pixelRatioCap: 1,
    shadowMapSize: 1024,
    softShadows: false,
    trafficMax: 6,
    trafficMin: 2,
    lampPools: false,
    propShadows: false,
  }),
});

export interface DeviceHints {
  readonly hardwareConcurrency?: unknown;
  readonly deviceMemory?: unknown;
  readonly maxTextureSize?: unknown;
}

/** A usable hint: a finite number above 0. Anything else is ignored. */
function hint(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function initialTier(h: DeviceHints): QualityTier {
  const cores = hint(h.hardwareConcurrency);
  const memory = hint(h.deviceMemory);
  const texture = hint(h.maxTextureSize);
  if ((cores !== null && cores <= 2) || (memory !== null && memory <= 2)) return "low";
  if (texture !== null && texture < 4096) return "low";
  if (cores !== null && memory !== null && cores <= 4 && memory <= 4) return "medium";
  return "high";
}

export interface FrameMonitor {
  readonly sum: number;
  readonly count: number;
  readonly slowWindows: number;
  readonly lastChangeMs: number;
}

export const INITIAL_MONITOR: FrameMonitor = Object.freeze({
  sum: 0,
  count: 0,
  slowWindows: 0,
  lastChangeMs: Number.NEGATIVE_INFINITY,
});

export const FRAME_WINDOW = 60,
  SLOW_FRAME_MS = 20,
  SLOW_WINDOWS = 2,
  TIER_COOLDOWN_MS = 5000;

/** Frames longer than this are tab switches or pauses, not load. */
const MAX_FRAME_MS = 250;

function lower(tier: QualityTier): QualityTier {
  return tier === "high" ? "medium" : "low";
}

/**
 * Feeds one frame time. Only call it while time advances. Windows of FRAME_WINDOW frames whose mean
 * exceeds SLOW_FRAME_MS are slow; after SLOW_WINDOWS slow windows in a row the tier drops one step,
 * at most once every TIER_COOLDOWN_MS. Invalid or over-long frame times are ignored.
 */
export function observeFrame(
  m: FrameMonitor,
  tier: QualityTier,
  dtMs: number,
  nowMs: number,
): { readonly monitor: FrameMonitor; readonly tier: QualityTier } {
  if (typeof dtMs !== "number" || !Number.isFinite(dtMs) || dtMs < 0 || dtMs > MAX_FRAME_MS) {
    return { monitor: m, tier };
  }
  const sum = m.sum + dtMs;
  const count = m.count + 1;
  if (count < FRAME_WINDOW) return { monitor: { ...m, sum, count }, tier };

  const slow = sum / count > SLOW_FRAME_MS;
  let slowWindows = slow ? m.slowWindows + 1 : 0;
  let lastChangeMs = m.lastChangeMs;
  let next = tier;
  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : null;
  if (
    slowWindows >= SLOW_WINDOWS &&
    tier !== "low" &&
    now !== null &&
    now - m.lastChangeMs >= TIER_COOLDOWN_MS
  ) {
    next = lower(tier);
    slowWindows = 0;
    lastChangeMs = now;
  }
  return { monitor: { sum: 0, count: 0, slowWindows, lastChangeMs }, tier: next };
}
