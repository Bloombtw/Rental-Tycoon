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
import { gameReducer, initUiState } from "./game/gameReducer.js";
import { browserClockDriver, useGameClock, type ClockDriver } from "./game/useGameClock.js";

export function App(props: { initialGame?: GameState; clockDriver?: ClockDriver }) {
  const [ui, dispatch] = useReducer(gameReducer, props.initialGame, initUiState);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const { game } = ui;

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
  }, []);

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
      <MessageBanner error={ui.error} notice={ui.notice} onDismiss={onDismissMessage} />
      <div className="stage">
        <ErrorBoundary fallback={<AgencyFallback />}>
          <AgencyView game={game} paused={ui.paused} pendingRef={pendingRef} />
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
      </ManageDrawer>
    </main>
  );
}
