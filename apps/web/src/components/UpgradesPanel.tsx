import { memo } from "react";
import {
  ADS_BONUS_PCT,
  COUNTER_BONUS_PCT,
  UPGRADE_IDS,
  UPGRADES,
  WASH_BONUS_PCT,
  fleetCapacity,
  upgradeCost,
  type Cents,
  type UpgradeId,
  type Upgrades,
} from "@rt/sim";
import { formatCents } from "../format.js";
import { UPGRADE_LABELS } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { Icon, type IconName } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";
import { ProgressBar } from "../ui/ProgressBar.js";

const ICONS: Readonly<Record<UpgradeId, IconName>> = {
  parking: "parking",
  counter: "key",
  ads: "trend-up",
  wash: "sparkle",
};

/** Effect of `id` at `level`, in French. */
function effectText(id: UpgradeId, level: number, upgrades: Upgrades): string {
  switch (id) {
    case "parking":
      return `${String(fleetCapacity({ ...upgrades, parking: level }))} places`;
    case "counter":
      return `+${String(COUNTER_BONUS_PCT * level)} % d'acceptation`;
    case "ads":
      return `+${String(ADS_BONUS_PCT * level)} % de clients`;
    case "wash":
      return `+${String(WASH_BONUS_PCT * level)} % sur le prix conseillé`;
  }
}

interface UpgradesPanelProps {
  readonly cash: Cents;
  readonly upgrades: Upgrades;
  readonly onBuy: (upgrade: UpgradeId) => void;
}

export const UpgradesPanel = memo(function UpgradesPanel({
  cash,
  upgrades,
  onBuy,
}: UpgradesPanelProps) {
  return (
    <section className="card panel" aria-labelledby="upgrades-title">
      <PanelHeader icon="wrench" tone="primary" id="upgrades-title" title="Améliorations" />
      {UPGRADE_IDS.map((id) => {
        const spec = UPGRADES[id];
        const raw = upgrades[id];
        const level = Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, spec.maxLevel) : 0;
        const maxed = level >= spec.maxLevel;
        const cost = upgradeCost(id, level);
        const poor = !(cash >= cost);
        return (
          <div className="upgrade-card" key={id} data-testid={`upgrade-${id}`}>
            <span className="upgrade-icon" aria-hidden="true">
              <Icon name={ICONS[id]} size={24} />
            </span>
            <div className="upgrade-info">
              <h3>
                {UPGRADE_LABELS[id]}
                <span className="upgrade-level">
                  Niv. {level}/{spec.maxLevel}
                </span>
              </h3>
              <ProgressBar
                value={level}
                max={spec.maxLevel}
                label={`Niveau ${UPGRADE_LABELS[id]}`}
                tone="primary"
                thin
              />
              <p className="upgrade-effect">
                {effectText(id, level, upgrades)}
                {!maxed && (
                  <>
                    {" "}
                    <Icon name="chevron-up" size={16} className="upgrade-arrow" />{" "}
                    <strong>{effectText(id, level + 1, upgrades)}</strong>
                  </>
                )}
              </p>
              <Button
                variant={maxed ? "secondary" : "primary"}
                size="md"
                className="upgrade-btn"
                data-testid={`upgrade-buy-${id}`}
                disabled={maxed || poor}
                onClick={() => {
                  onBuy(id);
                }}
              >
                {maxed ? "Niveau max" : `Améliorer · ${formatCents(cost)}`}
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
});
