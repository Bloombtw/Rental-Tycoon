import { memo } from "react";
import {
  MANAGER_IDS,
  MANAGERS,
  SALES_BONUS_PCT,
  levelForXp,
  type Cents,
  type ManagerId,
  type Managers,
} from "@rt/sim";
import { formatCents } from "../format.js";
import { Button } from "../ui/Button.js";
import { Icon, type IconName } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";

const TEXT: Readonly<Record<ManagerId, { name: string; role: string; icon: IconName }>> = {
  sales: {
    name: "Commercial",
    role: `Démarche des clients : +${String(SALES_BONUS_PCT)} % de demande chaque jour.`,
    icon: "trend-up",
  },
  pricing: {
    name: "Gérant",
    role: "Fixe chaque matin le prix le plus rentable de chaque voiture.",
    icon: "tag",
  },
  mechanic: {
    name: "Mécanicien",
    role: "Répare les pannes à moitié prix et entretient les voitures usées.",
    icon: "wrench",
  },
};

interface ManagersPanelProps {
  readonly cash: Cents;
  readonly xp: number;
  readonly managers: Managers;
  readonly onHire: (id: ManagerId) => void;
  readonly onFire: (id: ManagerId) => void;
}

/** Staff that automates the agency (managers.md). */
export const ManagersPanel = memo(function ManagersPanel({
  cash,
  xp,
  managers,
  onHire,
  onFire,
}: ManagersPanelProps) {
  const level = levelForXp(xp);
  return (
    <section className="card panel" aria-labelledby="managers-title">
      <PanelHeader icon="key" tone="neutral" id="managers-title" title="Employés" />
      {MANAGER_IDS.map((id) => {
        const spec = MANAGERS[id];
        const text = TEXT[id];
        const hired = managers[id] === true;
        const locked = level < spec.unlockLevel;
        const poor = !(cash >= spec.hireCost);
        return (
          <div className="upgrade-card" key={id} data-testid={`manager-${id}`}>
            <span className="upgrade-icon" aria-hidden="true">
              <Icon name={text.icon} size={24} />
            </span>
            <div className="upgrade-info">
              <h3>
                {text.name}
                <span className="upgrade-level">
                  {hired ? "En poste" : `${formatCents(spec.dailySalary)}/jour`}
                </span>
              </h3>
              <p className="upgrade-effect">{text.role}</p>
              {hired ? (
                <Button
                  variant="danger-quiet"
                  size="md"
                  className="upgrade-btn"
                  data-testid={`manager-fire-${id}`}
                  onClick={() => {
                    onFire(id);
                  }}
                >
                  Licencier
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  {...(locked ? { icon: "lock" as const } : {})}
                  className="upgrade-btn"
                  data-testid={`manager-hire-${id}`}
                  disabled={locked || poor}
                  onClick={() => {
                    onHire(id);
                  }}
                >
                  {locked
                    ? `Niveau ${String(spec.unlockLevel)} requis`
                    : `Embaucher · ${formatCents(spec.hireCost)}`}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
});
