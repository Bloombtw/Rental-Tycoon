import { useReducer } from "react";
import type { GameState } from "@rt/sim";
import { BuyCarPanel } from "./components/BuyCarPanel.js";
import { FleetPanel } from "./components/FleetPanel.js";
import { Hud } from "./components/Hud.js";
import { MessageBanner } from "./components/MessageBanner.js";
import { gameReducer, initUiState } from "./game/gameReducer.js";

export function App(props: { initialGame?: GameState }) {
  const [ui, dispatch] = useReducer(gameReducer, props.initialGame, initUiState);
  const { game } = ui;
  return (
    <main className="app">
      <Hud
        game={game}
        onNextDay={() => {
          dispatch({ type: "nextDay" });
        }}
      />
      <MessageBanner
        error={ui.error}
        notice={ui.notice}
        onDismiss={() => {
          dispatch({ type: "dismissMessage" });
        }}
      />
      <div className="columns">
        <FleetPanel
          fleet={game.fleet}
          onSetPrice={(carId, dailyPrice) => {
            dispatch({ type: "setCarPrice", carId, dailyPrice });
          }}
        />
        <BuyCarPanel
          cash={game.cash}
          fleetSize={game.fleet.length}
          highlight={game.fleet.length === 0}
          onBuy={(model) => {
            dispatch({ type: "buyCar", model });
          }}
        />
      </div>
    </main>
  );
}
