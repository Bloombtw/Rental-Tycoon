import type { Car, Cents } from "@rt/sim";
import { formatCents } from "../format.js";
import { CAR_MODEL_LABELS } from "../game/messages.js";
import { PriceEditor } from "./PriceEditor.js";

interface CarRowProps {
  readonly car: Car;
  readonly onSetPrice: (dailyPrice: Cents) => void;
}

export function CarRow({ car, onSetPrice }: CarRowProps) {
  const label =
    car.model !== undefined && Object.hasOwn(CAR_MODEL_LABELS, car.model)
      ? ` · ${CAR_MODEL_LABELS[car.model]}`
      : "";
  return (
    <li className="car-row" data-testid={`car-row-${car.id}`}>
      <h3>
        Voiture n°{Number.isSafeInteger(car.id) ? car.id : "—"}
        {label}
      </h3>
      <div className="car-meta">
        <span
          className="badge"
          data-status={car.rented ? "rented" : "parked"}
          title="Statut du dernier jour simulé"
        >
          {car.rented ? "Louée" : "Au parking"}
        </span>
        <span>Prix : {formatCents(car.dailyPrice)}/jour</span>
        <span>Coût : {formatCents(car.dailyCost)}/jour</span>
      </div>
      <PriceEditor carId={car.id} dailyPrice={car.dailyPrice} onSubmit={onSetPrice} />
    </li>
  );
}
