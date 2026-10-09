import type { Car, Cents } from "@rt/sim";
import { formatCents } from "../format.js";
import { CAR_MODEL_LABELS } from "../game/messages.js";
import { CarThumbnail } from "../ui/CarThumbnail.js";
import { Icon } from "../ui/icons.js";
import { usePop } from "../ui/usePop.js";
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
  const title = `Voiture n°${Number.isSafeInteger(car.id) ? String(car.id) : "—"}${label}`;
  const status = car.rented ? "rented" : "parked";
  const statusPop = usePop(status);
  const pricePop = usePop(car.dailyPrice);
  return (
    <li className="car-row" data-testid={`car-row-${car.id}`}>
      <div className="car-row-top">
        <CarThumbnail model={car.model} size="sm" alt={title} />
        <div className="car-row-info">
          <h3>
            Voiture n°{Number.isSafeInteger(car.id) ? car.id : "—"}
            {label}
          </h3>
          <span
            className="badge"
            key={statusPop}
            data-status={status}
            data-pop={String(statusPop > 0)}
            title="Statut du dernier jour simulé"
          >
            <Icon name={car.rented ? "key" : "parking"} size={16} />
            {car.rented ? "Louée" : "Au parking"}
          </span>
        </div>
      </div>
      <div className="car-meta">
        <span className="chip chip-price" key={pricePop} data-pop={String(pricePop > 0)}>
          <Icon name="tag" size={16} />
          Prix : {formatCents(car.dailyPrice)}/jour
        </span>
        <span className="chip">
          <Icon name="wrench" size={16} />
          Coût : {formatCents(car.dailyCost)}/jour
        </span>
      </div>
      <PriceEditor carId={car.id} dailyPrice={car.dailyPrice} onSubmit={onSetPrice} />
    </li>
  );
}
