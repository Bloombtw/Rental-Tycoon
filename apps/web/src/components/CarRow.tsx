import { memo, useState } from "react";
import { createPortal } from "react-dom";
import {
  carAge,
  carCondition,
  isBroken,
  repairCost,
  resaleValue,
  serviceCost,
  type Car,
  type CarId,
  type Cents,
} from "@rt/sim";
import { formatCents } from "../format.js";
import {
  CAR_MODEL_LABELS,
  SELL_BLOCKED_REASON,
  ageText,
  carStatusLabel,
  conditionPct,
  conditionTone,
} from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { CarThumbnail } from "../ui/CarThumbnail.js";
import { Icon } from "../ui/icons.js";
import { ProgressBar } from "../ui/ProgressBar.js";
import { usePop } from "../ui/usePop.js";
import { PriceEditor } from "./PriceEditor.js";
import { SellCarDialog } from "./SellCarDialog.js";

interface CarRowProps {
  readonly car: Car;
  /** False while the car is out on a rental (canSellNow). */
  readonly sellable: boolean;
  readonly onSetPrice: (carId: CarId, dailyPrice: Cents) => void;
  readonly onRepair: (carId: CarId) => void;
  readonly onService: (carId: CarId) => void;
  readonly onSell: (carId: CarId) => void;
}

/** Cents from a sim helper; a corrupted car never prints NaN or throws. */
function safeCents(read: () => Cents): Cents {
  try {
    const v = read();
    return Number.isSafeInteger(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

function safeNumber(read: () => number, fallback: number): number {
  try {
    const v = read();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeFlag(read: () => boolean): boolean {
  try {
    return read() === true;
  } catch {
    return false;
  }
}

export const CarRow = memo(function CarRow({
  car,
  sellable,
  onSetPrice,
  onRepair,
  onService,
  onSell,
}: CarRowProps) {
  const [sellOpen, setSellOpen] = useState(false);
  const label =
    car.model !== undefined && Object.hasOwn(CAR_MODEL_LABELS, car.model)
      ? ` · ${CAR_MODEL_LABELS[car.model]}`
      : "";
  const no = Number.isSafeInteger(car.id) ? String(car.id) : "—";
  const title = `Voiture n°${no}${label}`;
  const status = car.rented ? "rented" : "parked";
  const statusPop = usePop(status);
  const pricePop = usePop(car.dailyPrice);

  const broken = safeFlag(() => isBroken(car));
  const condition = conditionPct(safeNumber(() => carCondition(car), 100));
  const age = safeNumber(() => carAge(car), 0);
  const repairPrice = safeCents(() => repairCost(car));
  const servicePrice = safeCents(() => serviceCost(car));
  const salePrice = safeCents(() => resaleValue(car));
  const tone = conditionTone(condition);
  const canService = condition < 100 && !broken;
  const conditionPop = usePop(condition);

  return (
    <li className="car-row" data-testid={`car-row-${car.id}`} data-broken={String(broken)}>
      <div className="car-row-top">
        <CarThumbnail model={car.model} size="sm" alt={title} />
        <div className="car-row-info">
          <h3>
            Voiture n°{no}
            {label}
          </h3>
          <div className="car-badges">
            <span
              className="badge"
              key={statusPop}
              data-status={status}
              data-pop={String(statusPop > 0)}
              title="Statut du dernier jour simulé"
            >
              <Icon name={car.rented ? "key" : "parking"} size={16} />
              {carStatusLabel({ rented: car.rented, outcome: car.outcome, broken: car.broken })}
            </span>
            {broken && (
              <span className="badge" data-status="broken" data-testid={`car-broken-${car.id}`}>
                <Icon name="alert" size={16} />
                En panne
              </span>
            )}
          </div>
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
        <span className="chip" data-testid={`car-age-${car.id}`}>
          <Icon name="sun" size={16} />
          {ageText(age)}
        </span>
      </div>
      <div
        className="car-condition"
        data-tone={tone}
        data-pop={String(conditionPop > 0)}
        key={conditionPop}
        data-testid={`car-condition-${car.id}`}
      >
        <span className="car-condition-label">
          État <strong>{String(condition)} %</strong>
        </span>
        <ProgressBar
          value={condition}
          max={100}
          label={`État de la voiture n°${no}`}
          tone={tone === "good" ? "money" : tone === "warn" ? "warn" : "danger"}
        />
      </div>
      <div className="car-actions">
        {broken && (
          <Button
            variant="primary"
            size="md"
            icon="wrench"
            className="car-action"
            data-testid={`car-repair-${car.id}`}
            onClick={() => {
              onRepair(car.id);
            }}
          >
            {`Réparer · ${formatCents(repairPrice)}`}
          </Button>
        )}
        {canService && (
          <Button
            variant="secondary"
            size="md"
            icon="sparkle"
            className="car-action"
            data-testid={`car-service-${car.id}`}
            onClick={() => {
              onService(car.id);
            }}
          >
            {`Entretien · ${formatCents(servicePrice)}`}
          </Button>
        )}
        <Button
          variant="money"
          size="md"
          icon="coin"
          className="car-action"
          data-testid={`car-sell-${car.id}`}
          disabled={!sellable}
          aria-describedby={sellable ? undefined : `car-sell-reason-${String(car.id)}`}
          onClick={() => {
            setSellOpen(true);
          }}
        >
          {`Vendre · ${formatCents(salePrice)}`}
        </Button>
      </div>
      {!sellable && (
        <p className="car-action-hint" id={`car-sell-reason-${String(car.id)}`}>
          {SELL_BLOCKED_REASON}
        </p>
      )}
      <PriceEditor
        carId={car.id}
        dailyPrice={car.dailyPrice}
        onSubmit={(dailyPrice) => {
          onSetPrice(car.id, dailyPrice);
        }}
      />
      {sellOpen &&
        createPortal(
          <SellCarDialog
            carId={car.id}
            value={salePrice}
            sellable={sellable}
            onCancel={() => {
              setSellOpen(false);
            }}
            onConfirm={() => {
              setSellOpen(false);
              onSell(car.id);
            }}
          />,
          document.body,
        )}
    </li>
  );
});
