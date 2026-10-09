import { memo } from "react";
import { canSellNow, type CarId, type Cents, type GameState } from "@rt/sim";
import { Icon } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";
import { CarRow } from "./CarRow.js";

interface FleetPanelProps {
  readonly game: GameState;
  readonly onSetPrice: (carId: CarId, dailyPrice: Cents) => void;
  readonly onRepair: (carId: CarId) => void;
  readonly onService: (carId: CarId) => void;
  readonly onSell: (carId: CarId) => void;
}

function sellableNow(game: GameState, carId: CarId): boolean {
  try {
    return canSellNow(game, carId);
  } catch {
    return false;
  }
}

export const FleetPanel = memo(function FleetPanel({
  game,
  onSetPrice,
  onRepair,
  onService,
  onSell,
}: FleetPanelProps) {
  const fleet = game.fleet;
  return (
    <section className="card panel" aria-labelledby="fleet-title">
      <PanelHeader icon="car" tone="primary" id="fleet-title" title="Ma flotte" />
      {fleet.length === 0 ? (
        <div className="empty-state" data-testid="fleet-empty">
          <span className="empty-art" aria-hidden="true">
            <Icon name="parking" size={40} />
          </span>
          <p>Votre parking est vide. Achetez votre première voiture pour commencer à louer.</p>
        </div>
      ) : (
        <ul className="fleet-list">
          {fleet.map((car) => (
            <CarRow
              key={car.id}
              car={car}
              sellable={sellableNow(game, car.id)}
              onSetPrice={onSetPrice}
              onRepair={onRepair}
              onService={onService}
              onSell={onSell}
            />
          ))}
        </ul>
      )}
    </section>
  );
});
