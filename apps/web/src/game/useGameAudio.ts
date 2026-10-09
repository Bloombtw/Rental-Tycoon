import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@rt/sim";
import { departuresBetween } from "../scene/gains.js";
import {
  GameAudio,
  readMuted,
  readVolumes,
  writeMuted,
  writeVolumes,
  type AudioVolumes,
} from "./audio.js";
import type { SaveStorage } from "./saveStorage.js";

/** Gestures that count as user activation on iOS (any of them unlocks audio). */
const UNLOCK_EVENTS = ["pointerdown", "touchend", "click", "keydown"] as const;

/**
 * Wires the game audio (sounds.md): unlock on the first gesture, pause with the page, a cash sound
 * whenever a car leaves on a rental, and the mute preference (on by default, kept in storage).
 */
export function useGameAudio(
  game: GameState,
  storage: SaveStorage | null,
): {
  readonly muted: boolean;
  readonly toggleMute: () => void;
  readonly volumes: AudioVolumes;
  readonly setVolume: (kind: keyof AudioVolumes, value: number) => void;
} {
  const [muted, setMuted] = useState(() => readMuted(storage));
  const [volumes, setVolumes] = useState(() => readVolumes(storage));
  const volumesRef = useRef(volumes);
  const audioRef = useRef<GameAudio | null>(null);
  const mutedRef = useRef(muted);

  useEffect(() => {
    const audio = new GameAudio(import.meta.env.BASE_URL, mutedRef.current);
    audio.setVolumes(volumesRef.current);
    audioRef.current = audio;
    const unlock = (): void => {
      audio.unlock();
      for (const e of UNLOCK_EVENTS) window.removeEventListener(e, unlock, true);
    };
    for (const e of UNLOCK_EVENTS) window.addEventListener(e, unlock, true);
    const onVisibility = (): void => {
      audio.setHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      for (const e of UNLOCK_EVENTS) window.removeEventListener(e, unlock, true);
      document.removeEventListener("visibilitychange", onVisibility);
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    volumesRef.current = volumes;
    audioRef.current?.setVolumes(volumes);
  }, [volumes]);

  // A cash sound for the cars that just left on a rental (live play only, like the "+X €").
  const prevGame = useRef(game);
  useEffect(() => {
    const prev = prevGame.current;
    prevGame.current = game;
    if (prev !== game && departuresBetween(prev, game).length > 0) {
      audioRef.current?.playCash(performance.now());
    }
  }, [game]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      writeMuted(storage, !m);
      return !m;
    });
  }, [storage]);

  const setVolume = useCallback(
    (kind: keyof AudioVolumes, value: number) => {
      setVolumes((v) => {
        const next = { ...v, [kind]: Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1)) };
        writeVolumes(storage, next);
        return next;
      });
    },
    [storage],
  );

  return { muted, toggleMute, volumes, setVolume };
}
