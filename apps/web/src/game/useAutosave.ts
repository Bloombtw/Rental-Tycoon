import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@rt/sim";
import type { Speed } from "./clock.js";
import type { TutorialStep } from "./tutorial.js";
import { backupRejected, writeSave, type SaveStatus } from "./persistence.js";
import { SAVE_THROTTLE_MS } from "./saveFormat.js";
import type { SaveStorage } from "./saveStorage.js";

export interface AutosaveOptions {
  storage: SaveStorage | null;
  game: GameState;
  speed: Speed;
  paused: boolean;
  /** Tutorial step and replay flag: a change is saved like an action. */
  tutorial?: TutorialStep;
  tutorialReplay?: boolean;
  initialStatus: SaveStatus;
  pendingBackup?: string | undefined;
  now?: () => number;
}

export interface AutosaveApi {
  status: SaveStatus;
  warningVisible: boolean;
  dismissWarning(): void;
  /** Synchronous write of the current state if it changed (visibilitychange, pagehide). */
  flush(): void;
}

/**
 * Autosave policy (spec 2.4, 2.6): write only when game or speed changed since the last
 * successful write; throttled while time runs, immediate for actions, day closes, pauses.
 */
export function useAutosave(o: AutosaveOptions): AutosaveApi {
  const { storage, game, speed, paused, initialStatus } = o;
  const tutorial: TutorialStep = o.tutorial ?? "done";
  const tutorialReplay = o.tutorialReplay ?? false;
  const clock = o.now ?? Date.now;
  const [status, setStatus] = useState<SaveStatus>(initialStatus);
  const [warningVisible, setWarningVisible] = useState(initialStatus !== "ok");

  const latest = useRef({ storage, game, speed, clock, tutorial, tutorialReplay });
  latest.current = { storage, game, speed, clock, tutorial, tutorialReplay };
  const saved = useRef<{
    game: GameState;
    speed: Speed;
    tutorial: TutorialStep;
    tutorialReplay: boolean;
  }>({ game, speed, tutorial, tutorialReplay });
  const statusRef = useRef<SaveStatus>(initialStatus);
  const lastAttemptAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prev = useRef({ game, paused });
  const prevSpeed = useRef(speed);
  const prevTutorial = useRef({ tutorial, tutorialReplay });
  const pendingBackup = useRef<string | null>(o.pendingBackup ?? null);

  const clearTimer = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const save = useCallback((): void => {
    clearTimer();
    const cur = latest.current;
    if (
      cur.game === saved.current.game &&
      cur.speed === saved.current.speed &&
      cur.tutorial === saved.current.tutorial &&
      cur.tutorialReplay === saved.current.tutorialReplay
    ) {
      return;
    }
    if (!cur.storage) return; // already reported as "unavailable"
    const at = cur.clock();
    lastAttemptAt.current = at;
    // A rejected save whose backup failed is still the only copy: retry the backup first and
    // refuse to write over it until that succeeds.
    if (pendingBackup.current !== null) {
      if (backupRejected(cur.storage, pendingBackup.current)) pendingBackup.current = null;
    }
    const result: SaveStatus =
      pendingBackup.current !== null
        ? "failed"
        : writeSave(cur.storage, cur.game, cur.speed, at, cur.tutorial, cur.tutorialReplay);
    if (result === "ok") {
      saved.current = {
        game: cur.game,
        speed: cur.speed,
        tutorial: cur.tutorial,
        tutorialReplay: cur.tutorialReplay,
      };
      if (statusRef.current !== "ok") {
        statusRef.current = "ok";
        setStatus("ok");
        setWarningVisible(false);
      }
    } else if (statusRef.current === "ok") {
      // First failure of an episode: warn once.
      statusRef.current = result;
      setStatus(result);
      setWarningVisible(true);
    }
  }, [clearTimer]);

  useEffect(() => {
    const before = prev.current;
    prev.current = { game, paused };
    const speedChanged = speed !== prevSpeed.current;
    prevSpeed.current = speed;
    const tutorialChanged =
      tutorial !== prevTutorial.current.tutorial ||
      tutorialReplay !== prevTutorial.current.tutorialReplay;
    prevTutorial.current = { tutorial, tutorialReplay };
    const changed =
      game !== saved.current.game ||
      speed !== saved.current.speed ||
      tutorial !== saved.current.tutorial ||
      tutorialReplay !== saved.current.tutorialReplay;
    if (!changed) return;

    const timeAdvanced =
      game !== before.game && (game.day !== before.game.day || game.minute !== before.game.minute);
    const dayClosed = game.day !== before.game.day;
    const justPaused = paused && !before.paused;
    const action = game !== before.game && !timeAdvanced;
    const immediate =
      dayClosed || justPaused || action || tutorialChanged || (paused && game !== before.game);

    const since = lastAttemptAt.current === null ? Infinity : clock() - lastAttemptAt.current;
    if (immediate || speedChanged || since >= SAVE_THROTTLE_MS) {
      save();
    } else if (timer.current === null) {
      timer.current = setTimeout(save, Math.max(0, SAVE_THROTTLE_MS - since));
    }
  }, [game, speed, paused, tutorial, tutorialReplay, save]);

  useEffect(() => clearTimer, [clearTimer]);

  const dismissWarning = useCallback((): void => {
    setWarningVisible(false);
  }, []);

  return { status, warningVisible, dismissWarning, flush: save };
}
