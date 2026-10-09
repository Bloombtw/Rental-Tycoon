import { advance, type Cents, type GameState } from "@rt/sim";

/** Real time for one game day while the app is closed or in the background (offline-earnings.md). */
export const OFFLINE_DAY_MS = 10 * 60 * 1000;
/** Offline progress stops after this long away. */
export const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000;
export const MAX_OFFLINE_DAYS = MAX_OFFLINE_MS / OFFLINE_DAY_MS;

export interface OfflineReport {
  readonly days: number;
  /** Cash difference over the absence (may be negative). */
  readonly delta: Cents;
}

/** Whole game days earned by `elapsedMs` of absence, capped. Garbage or negative input gives 0. */
export function offlineDays(elapsedMs: unknown): number {
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(
    MAX_OFFLINE_DAYS,
    Math.floor(Math.min(elapsedMs, MAX_OFFLINE_MS) / OFFLINE_DAY_MS),
  );
}

/** Plays `days` days with the sim. Null when there is nothing to play or the sim refuses. */
export function playOffline(
  game: GameState,
  days: number,
): { readonly game: GameState; readonly report: OfflineReport } | null {
  if (!Number.isSafeInteger(days) || days <= 0) return null;
  try {
    const after = advance(game, days);
    const delta = after.cash - game.cash;
    if (!Number.isSafeInteger(delta)) return null;
    return { game: after, report: { days, delta } };
  } catch {
    return null;
  }
}
