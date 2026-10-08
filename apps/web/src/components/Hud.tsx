import type { GameState } from "@rt/sim";
import { formatCents } from "../format.js";
import { formatClock, type Speed } from "../game/clock.js";
import { SpeedControls } from "./SpeedControls.js";

interface HudProps {
  readonly game: GameState;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly hasRun: boolean;
  readonly onSetSpeed: (speed: Speed) => void;
  readonly onTogglePause: () => void;
}

function Report({ game }: { readonly game: GameState }) {
  const report = game.lastDay;
  const today = Number.isSafeInteger(game.todayRevenue) ? game.todayRevenue : 0;
  const todayText = `Aujourd'hui : +${formatCents(today)}`;
  if (report === null) {
    return (
      <p className="hud-report" data-testid="hud-report">
        Aucune journée écoulée.
        <span className="hud-today" data-testid="hud-today">
          {" · "}
          {todayText}
        </span>
      </p>
    );
  }
  const net = report.revenue - report.costs;
  const sign = net > 0 ? "positive" : net < 0 ? "negative" : "zero";
  const netText = `${net > 0 ? "+" : ""}${formatCents(net)}`;
  return (
    <p className="hud-report" data-testid="hud-report" data-sign={sign}>
      Hier : recettes {formatCents(report.revenue)} · charges {formatCents(report.costs)} · résultat{" "}
      {netText}
      <span className="hud-today" data-testid="hud-today">
        {" · "}
        {todayText}
      </span>
    </p>
  );
}

export function Hud({ game, speed, paused, hasRun, onSetSpeed, onTogglePause }: HudProps) {
  const negative = game.cash < 0;
  return (
    <header className="hud">
      <div className="hud-main">
        <strong data-testid="hud-clock">{formatClock(game.day, game.minute)}</strong>
        <span className="hud-cash-wrap">
          Caisse{" "}
          <span className="hud-cash" data-testid="hud-cash" data-negative={String(negative)}>
            {formatCents(game.cash)}
          </span>
        </span>
      </div>
      <SpeedControls
        speed={speed}
        paused={paused}
        hasRun={hasRun}
        onSetSpeed={onSetSpeed}
        onTogglePause={onTogglePause}
      />
      <Report game={game} />
    </header>
  );
}
