import type { Car, CarId, Cents } from "@rt/sim";
import { CarRow } from "./CarRow.js";

interface FleetPanelProps {
  readonly fleet: readonly Car[];
  readonly onSetPrice: (carId: CarId, dailyPrice: Cents) => void;
}

export function FleetPanel({ fleet, onSetPrice }: FleetPanelProps) {
  return (
    <section className="card panel" aria-labelledby="fleet-title">
      <h2 id="fleet-title">Ma flotte</h2>
      {fleet.length === 0 ? (
        <p className="empty-state" data-testid="fleet-empty">
          Votre parking est vide. Achetez votre première voiture pour commencer à louer.
        </p>
      ) : (
        <ul className="panel" style={{ listStyle: "none", margin: 0, padding: 0 }}>
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
}
