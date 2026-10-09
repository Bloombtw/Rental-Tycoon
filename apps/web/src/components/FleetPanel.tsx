import { memo } from "react";
import type { Car, CarId, Cents } from "@rt/sim";
import { Icon } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";
import { CarRow } from "./CarRow.js";

interface FleetPanelProps {
  readonly fleet: readonly Car[];
  readonly onSetPrice: (carId: CarId, dailyPrice: Cents) => void;
}

export const FleetPanel = memo(function FleetPanel({ fleet, onSetPrice }: FleetPanelProps) {
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
              onSetPrice={(dailyPrice) => {
                onSetPrice(car.id, dailyPrice);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
});
