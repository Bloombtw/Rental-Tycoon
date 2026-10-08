import {
  DAY_MINUTES,
  MAX_ADVANCE_MINUTES,
  OPENING_CLOCK_MINUTE,
  advanceMinutes,
  type DayReport,
  type GameState,
} from "@rt/sim";
import { formatCents } from "../format.js";

/** Pure clock maths. No timers, no DOM. */

export const MS_PER_GAME_MINUTE = 40;
export const MAX_FRAME_MS = 250;
export const COMMIT_INTERVAL_MS = 100;
export const DAY_BANNER_GAME_MINUTES = 90;
export const DAY_BANNER_MIN_MS = 1500;

export type Speed = 1 | 2 | 4 | 10;
export const SPEEDS: readonly Speed[] = Object.freeze([1, 2, 4, 10] as const);

export function isSpeed(value: unknown): value is Speed {
  return value === 1 || value === 2 || value === 4 || value === 10;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** How long the "new day" toast stays, in real ms. A speed outside SPEEDS counts as x1. */
export function dayBannerDurationMs(speed: Speed): number {
  const s = isSpeed(speed) ? speed : 1;
  return Math.max(DAY_BANNER_MIN_MS, (DAY_BANNER_GAME_MINUTES * MS_PER_GAME_MINUTE) / s);
}

/**
 * pending (game minutes, fractional) after one frame. Paused: unchanged. A negative or
 * non-finite dt counts as 0; a long frame counts as MAX_FRAME_MS. Never NaN.
 */
export function accumulateMinutes(
  pending: number,
  realDtMs: number,
  speed: Speed,
  paused: boolean,
): number {
  const base = finite(pending) && pending > 0 ? pending : 0;
  if (paused) return base;
  const dt = finite(realDtMs) && realDtMs > 0 ? Math.min(realDtMs, MAX_FRAME_MS) : 0;
  const s = isSpeed(speed) ? speed : 1;
  return base + (dt * s) / MS_PER_GAME_MINUTE;
}

/** Whole minutes to commit now (at most MAX_ADVANCE_MINUTES) and what stays pending. */
export function splitPending(pending: number): { whole: number; rest: number } {
  if (!finite(pending) || pending <= 0) return { whole: 0, rest: 0 };
  const whole = Math.min(Math.floor(pending), MAX_ADVANCE_MINUTES);
  return { whole, rest: pending - whole };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "HH:MM" of a minute counted from opening (09:00). "--:--" if invalid. */
export function formatTimeOfDay(minute: number): string {
  if (!finite(minute) || minute < 0) return "--:--";
  const total = (OPENING_CLOCK_MINUTE + Math.floor(minute)) % (24 * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** "Jour 3 · 14:05", or "—" if day or minute is invalid. */
export function formatClock(day: number, minute: number): string {
  if (!Number.isSafeInteger(day) || day < 0 || day >= Number.MAX_SAFE_INTEGER) return "—";
  if (!finite(minute) || minute < 0 || minute >= DAY_MINUTES) return "—";
  return `Jour ${day + 1} · ${formatTimeOfDay(minute)}`;
}

/** Toast shown when a day closes. `day` is the new (0-based) day. */
export function dayBannerText(day: number, lastDay: DayReport | null): string {
  const label = Number.isSafeInteger(day) && day >= 0 ? String(day + 1) : "—";
  const head = `Jour ${label} : l'agence ouvre !`;
  if (lastDay === null) return head;
  const net = lastDay.revenue - lastDay.costs;
  return `${head} Hier : ${net > 0 ? "+" : ""}${formatCents(net)}`;
}

/**
 * State the scene should draw: the committed game advanced by the pending whole minutes, and
 * the fractional time of day. Never throws; on any problem the committed state is shown.
 */
export function previewClock(
  game: GameState,
  pending: number,
): { game: GameState; timeOfDay: number } {
  const { whole, rest } = splitPending(pending);
  const base = finite(game.minute) ? game.minute : 0;
  try {
    const next = whole > 0 ? advanceMinutes(game, whole) : game;
    const t = Math.min(next.minute + Math.min(rest, 1), DAY_MINUTES - 0.001);
    return { game: next, timeOfDay: finite(t) && t >= 0 ? t : 0 };
  } catch {
    return { game, timeOfDay: Math.min(Math.max(base, 0), DAY_MINUTES - 0.001) };
  }
}
