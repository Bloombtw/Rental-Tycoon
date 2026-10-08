import {
  GAME_STATE_VERSION,
  UnsupportedGameStateVersionError,
  restoreGameState,
  type GameState,
} from "@rt/sim";
import { isSpeed, type Speed } from "./clock.js";

export const SAVE_KEY = "rental-tycoon/save";
export const REJECTED_SAVE_KEY = "rental-tycoon/save-rejected";
export const SAVE_FORMAT_VERSION = 1;
export const MAX_SAVE_CHARS = 200_000;
export const SAVE_THROTTLE_MS = 2000;

export interface SaveEnvelope {
  kind: "rental-tycoon-save";
  version: 1;
  stateVersion: number;
  savedAt: number | null;
  speed: Speed;
  game: GameState;
}

export type DecodeResult =
  | { kind: "empty" }
  | { kind: "ok"; game: GameState; speed: Speed; savedAt: number | null }
  | { kind: "rejected"; reason: "corrupt" | "newer" };

export function encodeSave(game: GameState, speed: Speed, savedAt: number): string {
  const envelope: SaveEnvelope = {
    kind: "rental-tycoon-save",
    version: SAVE_FORMAT_VERSION,
    stateVersion: GAME_STATE_VERSION,
    savedAt: Number.isSafeInteger(savedAt) && savedAt >= 0 ? savedAt : null,
    speed: isSpeed(speed) ? speed : 1,
    game,
  };
  return JSON.stringify(envelope);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Never throws. */
export function decodeSave(raw: string | null): DecodeResult {
  if (raw === null || raw === undefined) return { kind: "empty" };
  if (typeof raw !== "string" || raw.length > MAX_SAVE_CHARS) {
    return { kind: "rejected", reason: "corrupt" };
  }
  try {
    const env: unknown = JSON.parse(raw);
    if (!isRecord(env)) return { kind: "rejected", reason: "corrupt" };
    if (env["kind"] !== "rental-tycoon-save" || env["version"] !== SAVE_FORMAT_VERSION) {
      return { kind: "rejected", reason: "corrupt" };
    }
    const game = restoreGameState(env["game"], env["stateVersion"]);
    const at = env["savedAt"];
    const speed = env["speed"];
    return {
      kind: "ok",
      game,
      speed: isSpeed(speed) ? speed : 1,
      savedAt: typeof at === "number" && Number.isSafeInteger(at) && at >= 0 ? at : null,
    };
  } catch (err) {
    if (err instanceof UnsupportedGameStateVersionError && err.newer) {
      return { kind: "rejected", reason: "newer" };
    }
    return { kind: "rejected", reason: "corrupt" };
  }
}
