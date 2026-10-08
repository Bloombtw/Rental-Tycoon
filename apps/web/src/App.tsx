import { useCallback, useEffect, useReducer, useState } from "react";
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
import { SaveWarning } from "./components/SaveWarning.js";
import { gameReducer } from "./game/gameReducer.js";
import { loadInitialState } from "./game/persistence.js";
import { newSeed } from "./game/seed.js";
import { browserSaveStorage, type SaveStorage } from "./game/saveStorage.js";
import { useAutosave } from "./game/useAutosave.js";
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
  const { game } = ui;

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

  // Hidden page -> pause, and stay paused on return.
  useEffect(() => {
    const pause = (): void => {
      dispatch({ type: "pause" });
      flush();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
    };
  }, [flush]);

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
    <main className="app" data-drawer={drawerOpen ? "open" : "peek"}>
      <Hud
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
      <div className="stage">
        <ErrorBoundary fallback={<AgencyFallback />}>
          <AgencyView game={game} paused={ui.paused} speed={ui.speed} pendingRef={pendingRef} />
        </ErrorBoundary>
        {ui.dayBanner !== null && (
          <DayBanner text={ui.dayBanner} speed={ui.speed} onDismiss={onDismissBanner} />
        )}
      </div>
      <ManageDrawer open={drawerOpen} fleetSize={game.fleet.length} onSetOpen={setDrawerOpen}>
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
    </main>
  );
}
