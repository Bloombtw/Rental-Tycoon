import { forwardRef, useRef, type ReactNode } from "react";
import { MAX_FLEET_SIZE } from "@rt/sim";
import { Icon } from "../ui/icons.js";
import { ProgressBar } from "../ui/ProgressBar.js";

/** Vertical drag (px) on the handle that collapses / expands the sheet. */
const DRAG_THRESHOLD_PX = 40;
/** Movement beyond this is a drag, not a tap: the click that follows is ignored. */
const TAP_SLOP_PX = 10;

interface ManageDrawerProps {
  readonly open: boolean;
  readonly fleetSize: number;
  /** Places in the parking (upgrades.md). Defaults to MAX_FLEET_SIZE. */
  readonly capacity?: number;
  readonly onSetOpen: (open: boolean) => void;
  readonly children: ReactNode;
}

/** Floating glass bottom sheet on phones, floating side panel on wide landscape screens. */
export const ManageDrawer = forwardRef<HTMLElement, ManageDrawerProps>(function ManageDrawer(
  { open, fleetSize, capacity = MAX_FLEET_SIZE, onSetOpen, children },
  ref,
) {
  const startY = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const size = Number.isSafeInteger(fleetSize) && fleetSize >= 0 ? fleetSize : 0;
  const max = Number.isSafeInteger(capacity) && capacity > 0 ? capacity : MAX_FLEET_SIZE;
  return (
    <aside
      ref={ref}
      className="drawer glass-light"
      data-state={open ? "open" : "peek"}
      data-testid="drawer"
    >
      <button
        type="button"
        className="drawer-handle"
        data-testid="drawer-toggle"
        aria-expanded={open}
        aria-controls="drawer-content"
        onPointerDown={(e) => {
          startY.current = e.clientY;
          suppressClick.current = false;
        }}
        onPointerUp={(e) => {
          if (startY.current === null) return;
          const dy = e.clientY - startY.current;
          startY.current = null;
          if (Math.abs(dy) > TAP_SLOP_PX) suppressClick.current = true;
          if (dy > DRAG_THRESHOLD_PX) onSetOpen(false);
          else if (dy < -DRAG_THRESHOLD_PX) onSetOpen(true);
        }}
        onPointerCancel={() => {
          startY.current = null;
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onSetOpen(!open);
        }}
      >
        <span className="drawer-grip" aria-hidden="true" />
        <span className="drawer-title">
          <Icon name="fleet" size={20} className="drawer-title-icon" />
          <span className="drawer-title-text">
            Gérer l'agence · Flotte {size}/{max}
          </span>
          <span className="drawer-fleet-bar" aria-hidden="true">
            <ProgressBar
              value={size}
              max={max}
              label="Remplissage de la flotte"
              tone="money"
              thin
            />
          </span>
        </span>
        <span className="drawer-chevron" aria-hidden="true">
          <Icon name="chevron-up" size={24} />
        </span>
      </button>
      <div className="drawer-content" id="drawer-content" hidden={!open}>
        {children}
      </div>
    </aside>
  );
});
