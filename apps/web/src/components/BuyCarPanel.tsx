import { memo, useId } from "react";
import { CAR_MODELS, CAR_MODEL_IDS, MAX_FLEET_SIZE, type CarModelId, type Cents } from "@rt/sim";
import { formatCents } from "../format.js";
import { CAR_MODEL_LABELS } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { CarThumbnail } from "../ui/CarThumbnail.js";
import { Icon } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";

interface BuyCarPanelProps {
  readonly cash: Cents;
  readonly fleetSize: number;
  readonly highlight: boolean;
  readonly onBuy: (model: CarModelId) => void;
}

export const BuyCarPanel = memo(function BuyCarPanel({
  cash,
  fleetSize,
  highlight,
  onBuy,
}: BuyCarPanelProps) {
  const baseId = useId();
  const full = fleetSize >= MAX_FLEET_SIZE;
  return (
    <section className="card panel" data-highlight={String(highlight)} aria-labelledby="buy-title">
      <PanelHeader icon="cart" tone="money" id="buy-title" title="Acheter une voiture" />
      {CAR_MODEL_IDS.map((id) => {
        const model = CAR_MODELS[id];
        const poor = !(cash >= model.purchasePrice);
        const reason = full
          ? `Flotte complète (${MAX_FLEET_SIZE}/${MAX_FLEET_SIZE})`
          : poor
            ? "Fonds insuffisants"
            : null;
        return (
          <div className="buy-card" key={id}>
            <div className="buy-visual">
              <CarThumbnail model={id} size="md" alt={CAR_MODEL_LABELS[id]} />
            </div>
            <div className="buy-info">
              <h3>{CAR_MODEL_LABELS[id]}</h3>
              <div className="buy-stats">
                <p>
                  <Icon name="tag" size={20} />
                  Prix d'achat {formatCents(model.purchasePrice)}
                </p>
                <p>
                  <Icon name="wrench" size={20} />
                  Coût {formatCents(model.dailyCost)}/jour
                </p>
                <p className="buy-hint">
                  <Icon name="sparkle" size={20} />
                  Prix conseillé {formatCents(model.defaultDailyPrice)}/jour
                </p>
              </div>
              <Button
                variant="money"
                size="lg"
                icon="cart"
                className="buy-btn"
                data-testid={`buy-${id}`}
                disabled={reason !== null}
                aria-describedby={reason !== null ? `${baseId}-${id}-refusal` : undefined}
                onClick={() => {
                  onBuy(id);
                }}
              >
                Acheter
              </Button>
              {reason !== null && (
                <p className="buy-refusal" id={`${baseId}-${id}-refusal`}>
                  <Icon name="lock" size={16} />
                  {reason}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
});
