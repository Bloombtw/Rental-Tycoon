import { memo, useId } from "react";
import {
  CAR_MODELS,
  CAR_MODEL_IDS,
  LEVEL_XP,
  MAX_AGENCY_LEVEL,
  MAX_FLEET_SIZE,
  levelForXp,
  type CarModelId,
  type Cents,
} from "@rt/sim";
import { formatCents } from "../format.js";
import { CAR_MODEL_LABELS } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { CarThumbnail } from "../ui/CarThumbnail.js";
import { Icon } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";
import { ProgressBar } from "../ui/ProgressBar.js";

interface BuyCarPanelProps {
  readonly cash: Cents;
  readonly fleetSize: number;
  /** Places in the parking (upgrades.md). */
  readonly capacity: number;
  /** Agency experience (agency-level.md). Defaults to 0. */
  readonly xp?: number;
  readonly highlight: boolean;
  readonly onBuy: (model: CarModelId) => void;
}

const xpFormat = new Intl.NumberFormat("fr-FR");

/** Level, XP towards the next level, and the next model it unlocks. */
function LevelProgress({ xp }: { readonly xp: number }) {
  const level = levelForXp(xp);
  const next = level < MAX_AGENCY_LEVEL ? (LEVEL_XP[level] ?? null) : null;
  const from = LEVEL_XP[level - 1] ?? 0;
  const unlock = CAR_MODEL_IDS.find((id) => CAR_MODELS[id].unlockLevel === level + 1);
  return (
    <div className="level-progress" data-testid="level-progress">
      <span>
        <strong>Niveau {level}</strong>
        {next !== null
          ? ` · ${xpFormat.format(xp)} / ${xpFormat.format(next)} XP`
          : " · niveau max"}
      </span>
      {next !== null && (
        <ProgressBar
          value={xp - from}
          max={next - from}
          label="Expérience de l'agence"
          tone="primary"
          thin
        />
      )}
      {unlock !== undefined && (
        <span className="buy-hint">
          Prochain modèle au niveau {level + 1} : {CAR_MODEL_LABELS[unlock]}
        </span>
      )}
    </div>
  );
}

export const BuyCarPanel = memo(function BuyCarPanel({
  cash,
  fleetSize,
  capacity,
  xp = 0,
  highlight,
  onBuy,
}: BuyCarPanelProps) {
  const baseId = useId();
  const full = fleetSize >= capacity;
  const safeXp = Number.isSafeInteger(xp) && xp > 0 ? xp : 0;
  const level = levelForXp(safeXp);
  // Unlocked models, then the next locked one as a teaser.
  const firstLocked = CAR_MODEL_IDS.find((id) => CAR_MODELS[id].unlockLevel > level);
  const shown = CAR_MODEL_IDS.filter(
    (id) => CAR_MODELS[id].unlockLevel <= level || id === firstLocked,
  );
  return (
    <section className="card panel" data-highlight={String(highlight)} aria-labelledby="buy-title">
      <PanelHeader icon="cart" tone="money" id="buy-title" title="Acheter une voiture" />
      <LevelProgress xp={safeXp} />
      {shown.map((id) => {
        const model = CAR_MODELS[id];
        const locked = model.unlockLevel > level;
        const poor = !(cash >= model.purchasePrice);
        const reason = locked
          ? `Débloqué au niveau ${String(model.unlockLevel)}`
          : full
            ? capacity >= MAX_FLEET_SIZE
              ? `Flotte complète (${MAX_FLEET_SIZE}/${MAX_FLEET_SIZE})`
              : `Parking plein (${fleetSize}/${capacity}) : agrandissez le parking`
            : poor
              ? "Fonds insuffisants"
              : null;
        return (
          <div className="buy-card" key={id} data-locked={String(locked)}>
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
                icon={locked ? "lock" : "cart"}
                className="buy-btn"
                data-testid={`buy-${id}`}
                {...(id === "used" ? { "data-tutorial": "buy-used" } : {})}
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
