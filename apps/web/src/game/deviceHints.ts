/** Device hints for the first quality tier (see scene/quality.ts initialTier). Browser only. */
export function deviceHints(): { hardwareConcurrency?: unknown; deviceMemory?: unknown } {
  if (typeof navigator === "undefined") return {};
  const nav = navigator as Navigator & { deviceMemory?: unknown };
  return { hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory };
}
