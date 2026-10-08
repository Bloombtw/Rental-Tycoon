import { useRef, type ReactNode } from "react";
import { MAX_FLEET_SIZE } from "@rt/sim";

/** Vertical drag (px) on the handle that collapses / expands the sheet. */
const DRAG_THRESHOLD_PX = 40;
/** Movement beyond this is a drag, not a tap: the click that follows is ignored. */
const TAP_SLOP_PX = 10;

interface ManageDrawerProps {
  readonly open: boolean;
  readonly fleetSize: number;
  readonly onSetOpen: (open: boolean) => void;
  readonly children: ReactNode;
}

/** Bottom sheet on phones, side panel on wide landscape screens. */
export function ManageDrawer({ open, fleetSize, onSetOpen, children }: ManageDrawerProps) {
  const startY = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const size = Number.isSafeInteger(fleetSize) && fleetSize >= 0 ? fleetSize : 0;
  return (
    <aside className="drawer" data-state={open ? "open" : "peek"} data-testid="drawer">
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
          Gérer l'agence · Flotte {size}/{MAX_FLEET_SIZE}
        </span>
        <span className="drawer-chevron" aria-hidden="true">
          {open ? "▾" : "▴"}
        </span>
      </button>
      <div className="drawer-content" id="drawer-content" hidden={!open}>
        {children}
      </div>
    </aside>
  );
}
