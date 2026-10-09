import { useEffect, useState } from "react";
import { Icon, type IconName } from "../ui/icons.js";

/** The menus reachable from the side rail (side-menu.md). */
export type PanelId = "missions" | "cars" | "upgrades" | "staff" | "settings";

interface RailItem {
  readonly id: PanelId | "shop";
  readonly icon: IconName;
  readonly label: string;
}

const ITEMS: readonly RailItem[] = [
  { id: "missions", icon: "check-circle", label: "Missions" },
  { id: "cars", icon: "car", label: "Voitures" },
  { id: "upgrades", icon: "wrench", label: "Agence" },
  { id: "staff", icon: "key", label: "Employés" },
  { id: "shop", icon: "shop", label: "Boutique" },
  { id: "settings", icon: "settings", label: "Réglages" },
];

interface SideRailProps {
  readonly active: PanelId | null;
  /** Rewards waiting on the missions button. */
  readonly missionsBadge: number;
  readonly gems: number;
  readonly boosted: boolean;
  readonly onOpen: (panel: PanelId) => void;
  readonly onOpenShop: () => void;
  /** Vertical position: top of the free area under the HUD (px). */
  readonly top: number;
}

/** Mobile-game style column of round icon buttons on the right edge (side-menu.md). */
export function SideRail({
  active,
  missionsBadge,
  gems,
  boosted,
  onOpen,
  onOpenShop,
  top,
}: SideRailProps) {
  // "Aéroport": a locked zone under construction (showcase only, no game mechanics).
  const [soon, setSoon] = useState(false);
  useEffect(() => {
    if (!soon) return undefined;
    const t = setTimeout(() => {
      setSoon(false);
    }, 2500);
    return () => {
      clearTimeout(t);
    };
  }, [soon]);
  return (
    <nav
      className="side-rail"
      aria-label="Menus"
      data-testid="side-rail"
      style={{ top: `calc(${String(top)}px + var(--space-3))` }}
    >
      {ITEMS.map((item) => {
        const isShop = item.id === "shop";
        return (
          <button
            key={item.id}
            type="button"
            className="rail-btn"
            data-kind={isShop ? "shop" : "menu"}
            data-active={String(item.id === active)}
            data-testid={isShop ? "shop-open" : `rail-${item.id}`}
            {...(isShop ? {} : { "data-tutorial": `rail-${item.id}` })}
            aria-label={isShop ? `${item.label}, ${String(gems)} diamants` : item.label}
            onClick={() => {
              if (item.id === "shop") onOpenShop();
              else onOpen(item.id);
            }}
          >
            <span className="rail-circle" aria-hidden="true">
              <Icon name={item.icon} size={24} />
              {item.id === "missions" && missionsBadge > 0 && (
                <span className="rail-badge" data-testid="rail-badge">
                  {missionsBadge}
                </span>
              )}
              {isShop && boosted && (
                <span className="rail-badge" data-kind="boost">
                  ×2
                </span>
              )}
            </span>
            <span className="rail-label" aria-hidden="true">
              {isShop ? (
                <>
                  <Icon name="gem" size={16} />
                  {gems}
                </>
              ) : (
                item.label
              )}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className="rail-btn"
        data-kind="locked"
        data-testid="rail-airport"
        aria-label="Aéroport : en chantier"
        onClick={() => {
          setSoon(true);
        }}
      >
        <span className="rail-circle" aria-hidden="true">
          <Icon name="construction" size={24} />
          <span className="rail-lock">
            <Icon name="lock" size={16} />
          </span>
        </span>
        <span className="rail-label" aria-hidden="true">
          Aéroport
        </span>
      </button>
      {soon && (
        <p className="rail-soon" role="status" data-testid="airport-soon">
          En chantier, revenez plus tard !
        </p>
      )}
    </nav>
  );
}
