import { createGame, type GameState } from "@rt/sim";
import { formatClock, type Speed } from "./clock.js";
import { gameReducer, initUiState, settleUi, type UiState } from "./gameReducer.js";
import type { TutorialStep } from "./tutorial.js";
import { resumeNotice, SAVE_CORRUPT_ERROR, SAVE_NEWER_ERROR } from "./messages.js";
import { decodeSave, encodeSave, REJECTED_SAVE_KEY, SAVE_KEY } from "./saveFormat.js";
import type { SaveStorage } from "./saveStorage.js";

export type SaveStatus = "ok" | "unavailable" | "failed";

export interface InitResult {
  ui: UiState;
  status: SaveStatus;
  /** Rejected raw text whose backup to REJECTED_SAVE_KEY failed and must be retried. */
  pendingBackup?: string;
}

/** Copies a rejected save to the backup slot. Never throws. */
export function backupRejected(storage: SaveStorage, raw: string): boolean {
  try {
    storage.setItem(REJECTED_SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/** Starting state at launch (spec 2.5). Never throws. */
export function loadInitialState(o: {
  storage: SaveStorage | null;
  newSeed: () => number;
  initialGame?: GameState;
  /** Wall clock in ms (tests). Defaults to Date.now(). */
  now?: number;
  /** false: a brand-new game skips the tutorial (tests). Defaults to true. */
  tutorial?: boolean;
}): InitResult {
  const noTutorial = (ui: UiState): UiState =>
    o.tutorial === false ? { ...ui, tutorial: "done" } : ui;
  const fresh = (): UiState => noTutorial(initUiState(createGame(o.newSeed())));
  const { storage } = o;
  if (o.initialGame) {
    return { ui: noTutorial(initUiState(o.initialGame)), status: storage ? "ok" : "unavailable" };
  }
  if (!storage) return { ui: fresh(), status: "unavailable" };

  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { ui: fresh(), status: "unavailable" };
  }

  const decoded = decodeSave(raw);
  if (decoded.kind === "empty") return { ui: fresh(), status: "ok" };
  if (decoded.kind === "ok") {
    const { game, speed, savedAt } = decoded;
    const resumed: UiState = settleUi({
      ...initUiState(game),
      speed,
      tutorial: decoded.tutorial,
      tutorialReplay: decoded.tutorialReplay,
      notice: resumeNotice(formatClock(game.day, game.minute)),
    });
    // Offline earnings for the time the app was closed (a future savedAt gives nothing).
    const now = o.now ?? Date.now();
    const ui =
      savedAt === null
        ? resumed
        : gameReducer(resumed, { type: "returnAfter", elapsedMs: now - savedAt });
    return { ui, status: "ok" };
  }

  // Rejected: keep the raw text in the backup slot, then start over. If the backup fails, the
  // raw text stays pending: the autosave retries it before every write and never overwrites
  // SAVE_KEY (the only copy) until it succeeds.
  const pending = raw ?? "";
  let status: SaveStatus = "ok";
  let pendingBackup: string | null = null;
  if (backupRejected(storage, pending)) {
    try {
      storage.removeItem(SAVE_KEY);
    } catch {
      // harmless: the next write overwrites it
    }
  } else {
    status = "failed";
    pendingBackup = pending;
  }
  return {
    ...(pendingBackup !== null ? { pendingBackup } : {}),
    ui: {
      ...fresh(),
      error: decoded.reason === "newer" ? SAVE_NEWER_ERROR : SAVE_CORRUPT_ERROR,
    },
    status,
  };
}

/** Writes the whole save. Never throws. */
export function writeSave(
  storage: SaveStorage | null,
  game: GameState,
  speed: Speed,
  now: number,
  tutorial: TutorialStep = "done",
  tutorialReplay = false,
): SaveStatus {
  if (!storage) return "unavailable";
  try {
    storage.setItem(SAVE_KEY, encodeSave(game, speed, now, tutorial, tutorialReplay));
    return "ok";
  } catch {
    return "failed";
  }
}
