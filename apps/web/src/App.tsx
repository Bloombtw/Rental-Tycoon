import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { type CarId, type CarModelId, type Cents, type GameState } from "@rt/sim";
import { AgencyFallback, AgencyView } from "./components/AgencyView.js";
import { BuyCarPanel } from "./components/BuyCarPanel.js";
import { DayBanner } from "./components/DayBanner.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { FleetPanel } from "./components/FleetPanel.js";
import { Hud } from "./components/Hud.js";
import { ManageDrawer } from "./components/ManageDrawer.js";
import { MessageBanner } from "./components/MessageBanner.js";
import type { Speed } from "./game/clock.js";
import { NewGameButton } from "./components/NewGameButton.js";
import { NewGameDialog } from "./components/NewGameDialog.js";
import { OfflineDialog } from "./components/OfflineDialog.js";
import { SaveWarning } from "./components/SaveWarning.js";
import { gameReducer } from "./game/gameReducer.js";
import { loadInitialState } from "./game/persistence.js";
import { newSeed } from "./game/seed.js";
import { browserSaveStorage, type SaveStorage } from "./game/saveStorage.js";
import { deviceHints } from "./game/deviceHints.js";
import { useAutosave } from "./game/useAutosave.js";
import { useObscuredInsets } from "./game/useObscuredInsets.js";
import { initialTier, type QualityTier } from "./scene/quality.js";
import { browserClockDriver, useGameClock, type ClockDriver } from "./game/useGameClock.js";

export function App(props: {
  initialGame?: GameState;
  clockDriver?: ClockDriver;
  storage?: SaveStorage | null;
  newSeed?: () => number;
}) {
  // Storage and the saved game are read once, synchronously, before the first render.
  const [storage] = useState<SaveStorage | null>(() =>
    props.storage !== undefined ? props.storage : browserSaveStorage(),
  );
  // StrictMode runs this initializer twice in development and keeps one result. That is safe:
  // the read is idempotent (the first run copies a rejected save to the backup slot and removes
  // it, the second then sees no save and would start a new game, but its result is discarded
  // in favour of the first). Only the kept result reaches the reducer and the autosave.
  const [loaded] = useState(() =>
    loadInitialState({
      storage,
      newSeed: props.newSeed ?? newSeed,
      ...(props.initialGame ? { initialGame: props.initialGame } : {}),
    }),
  );
  const [ui, dispatch] = useReducer(gameReducer, loaded.ui);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Quality tier of the scene: it decides how much of the glass is blurred (see app.css).
  const [quality, setQuality] = useState<QualityTier>(() => initialTier(deviceHints()));
  const appRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const insets = useObscuredInsets({ hud: topRef, drawer: drawerRef });
  const { game } = ui;

  // The side panel (wide screens) starts under the HUD, whatever toasts are showing below it.
  useEffect(() => {
    const hud = hudRef.current;
    const app = appRef.current;
    if (!hud || !app) return undefined;
    const apply = (): void => {
      const bottom = hud.getBoundingClientRect().bottom;
      if (Number.isFinite(bottom) && bottom > 0) {
        app.style.setProperty("--hud-bottom", `${String(Math.round(bottom))}px`);
      }
    };
    apply();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    observer?.observe(hud);
    window.addEventListener("resize", apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const autosave = useAutosave({
    storage,
    game,
    speed: ui.speed,
    paused: ui.paused,
    initialStatus: loaded.status,
    pendingBackup: loaded.pendingBackup,
  });
  const { flush } = autosave;

  // Whole minutes are committed in batches (at most 10 per second). flushSync keeps the
  // committed state and the pending fraction consistent for the scene's next frame.
  const onCommit = useCallback((minutes: number) => {
    flushSync(() => {
      dispatch({ type: "advanceTime", minutes });
    });
  }, []);
  const { pendingRef } = useGameClock({
    speed: ui.speed,
    paused: ui.paused,
    driver: props.clockDriver ?? browserClockDriver,
    onCommit,
  });

  // Hidden page -> pause, and stay paused on return. The time away earns offline days.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const pause = (): void => {
      dispatch({ type: "pause" });
      flush();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        hiddenAt ??= Date.now();
        pause();
      } else if (hiddenAt !== null) {
        const elapsedMs = Date.now() - hiddenAt;
        hiddenAt = null;
        dispatch({ type: "returnAfter", elapsedMs });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
    };
  }, [flush]);

  const onClaimOffline = useCallback(() => {
    dispatch({ type: "claimOffline" });
  }, []);

  const makeSeed = props.newSeed ?? newSeed;
  const onAskNewGame = useCallback(() => {
    dispatch({ type: "pause" });
    setConfirmOpen(true);
  }, []);
  const onCancelNewGame = useCallback(() => {
    setConfirmOpen(false);
  }, []);
  const onConfirmNewGame = useCallback(() => {
    dispatch({ type: "newGame", seed: makeSeed() });
    setConfirmOpen(false);
  }, [makeSeed]);

  const onSetSpeed = useCallback((speed: Speed) => {
    dispatch({ type: "setSpeed", speed });
  }, []);
  const onTogglePause = useCallback(() => {
    dispatch({ type: "togglePause" });
  }, []);
  const onSetPrice = useCallback((carId: CarId, dailyPrice: Cents) => {
    dispatch({ type: "setCarPrice", carId, dailyPrice });
  }, []);
  const onBuy = useCallback((model: CarModelId) => {
    dispatch({ type: "buyCar", model });
  }, []);
  const onDismissMessage = useCallback(() => {
    dispatch({ type: "dismissMessage" });
  }, []);
  const onDismissBanner = useCallback(() => {
    dispatch({ type: "dismissDayBanner" });
  }, []);

  return (
    <main
      ref={appRef}
      className="app"
      data-drawer={drawerOpen ? "open" : "peek"}
      data-quality={quality}
      style={{ "--inset-top": `${String(insets.top)}px` } as CSSProperties}
    >
      {/* The scene fills the screen; everything else floats above it. */}
      <div className="top-layer" ref={topRef}>
        <Hud
          ref={hudRef}
          game={game}
          speed={ui.speed}
          paused={ui.paused}
          hasRun={ui.hasRun}
          onSetSpeed={onSetSpeed}
          onTogglePause={onTogglePause}
        />
        <SaveWarning
          status={autosave.status}
          visible={autosave.warningVisible}
          onDismiss={autosave.dismissWarning}
        />
        <MessageBanner error={ui.error} notice={ui.notice} onDismiss={onDismissMessage} />
      </div>
      <div className="stage">
        <ErrorBoundary fallback={<AgencyFallback />}>
          <AgencyView
            game={game}
            paused={ui.paused}
            speed={ui.speed}
            pendingRef={pendingRef}
            insets={insets}
            onQualityChange={setQuality}
          />
        </ErrorBoundary>
        {ui.dayBanner !== null && (
          <DayBanner text={ui.dayBanner} speed={ui.speed} onDismiss={onDismissBanner} />
        )}
      </div>
      <ManageDrawer
        ref={drawerRef}
        open={drawerOpen}
        fleetSize={game.fleet.length}
        onSetOpen={setDrawerOpen}
      >
        <FleetPanel fleet={game.fleet} onSetPrice={onSetPrice} />
        <BuyCarPanel
          cash={game.cash}
          fleetSize={game.fleet.length}
          highlight={game.fleet.length === 0}
          onBuy={onBuy}
        />
        <NewGameButton onClick={onAskNewGame} />
      </ManageDrawer>
      {confirmOpen && (
        <NewGameDialog game={game} onCancel={onCancelNewGame} onConfirm={onConfirmNewGame} />
      )}
      {ui.offline !== null && !confirmOpen && (
        <OfflineDialog report={ui.offline} onClaim={onClaimOffline} />
      )}
    </main>
  );
}
