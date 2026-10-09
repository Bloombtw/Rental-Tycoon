import {
  GAME_STATE_VERSION,
  UnsupportedGameStateVersionError,
  restoreGameState,
  type GameState,
} from "@rt/sim";
import { isSpeed, type Speed } from "./clock.js";
import { isTutorialStep, type TutorialStep } from "./tutorial.js";

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
  /** Tutorial step (tutorial.md). Missing in saves from before the tutorial: counts as "done". */
  tutorial?: TutorialStep;
  /** Present (true) while the tutorial is replayed on an advanced game. */
  tutorialReplay?: boolean;
}

export type DecodeResult =
  | { kind: "empty" }
  | {
      kind: "ok";
      game: GameState;
      speed: Speed;
      savedAt: number | null;
      tutorial: TutorialStep;
      tutorialReplay: boolean;
    }
  | { kind: "rejected"; reason: "corrupt" | "newer" };

export function encodeSave(
  game: GameState,
  speed: Speed,
  savedAt: number,
  tutorial: TutorialStep = "done",
  tutorialReplay = false,
): string {
  const envelope: SaveEnvelope = {
    kind: "rental-tycoon-save",
    version: SAVE_FORMAT_VERSION,
    stateVersion: GAME_STATE_VERSION,
    savedAt: Number.isSafeInteger(savedAt) && savedAt >= 0 ? savedAt : null,
    speed: isSpeed(speed) ? speed : 1,
    game,
    tutorial: isTutorialStep(tutorial) ? tutorial : "done",
    ...(tutorialReplay === true && tutorial !== "done" ? { tutorialReplay: true } : {}),
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
    const step = env["tutorial"];
    // A missing (old save) or unknown step never traps the player in a tutorial.
    const tutorial: TutorialStep = isTutorialStep(step) ? step : "done";
    return {
      kind: "ok",
      game,
      speed: isSpeed(speed) ? speed : 1,
      savedAt: typeof at === "number" && Number.isSafeInteger(at) && at >= 0 ? at : null,
      tutorial,
      tutorialReplay: tutorial !== "done" && env["tutorialReplay"] === true,
    };
  } catch (err) {
    if (err instanceof UnsupportedGameStateVersionError && err.newer) {
      return { kind: "rejected", reason: "newer" };
    }
    return { kind: "rejected", reason: "corrupt" };
  }
}
