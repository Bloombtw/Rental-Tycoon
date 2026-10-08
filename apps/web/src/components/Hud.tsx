import { MAX_FLEET_SIZE, type GameState } from "@rt/sim";
import { formatCents } from "../format.js";

interface HudProps {
  readonly game: GameState;
  readonly onNextDay: () => void;
}

function safeInt(value: number): string {
  return Number.isSafeInteger(value) ? String(value) : "—";
}

function Report({ game }: { readonly game: GameState }) {
  const report = game.lastDay;
  if (report === null) {
    return (
      <p className="hud-report" data-testid="hud-report">
        Aucune journée écoulée.
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
    </p>
  );
}

export function Hud({ game, onNextDay }: HudProps) {
  const negative = game.cash < 0;
  return (
    <header className="hud">
      <div className="hud-main">
        <strong data-testid="hud-day">Jour {safeInt(game.day + 1)}</strong>
        <span>
          Caisse{" "}
          <span className="hud-cash" data-testid="hud-cash" data-negative={String(negative)}>
            {formatCents(game.cash)}
          </span>
        </span>
        <span>
          Flotte {safeInt(game.fleet.length)}/{MAX_FLEET_SIZE}
        </span>
        <button type="button" className="btn spacer" data-testid="next-day" onClick={onNextDay}>
          Jour suivant
        </button>
      </div>
      <Report game={game} />
    </header>
  );
}
