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
    </nav>
  );
}
