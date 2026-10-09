import { useEffect, useState, type RefObject } from "react";
import { NO_INSETS, clampInsets, type ObscuredInsets } from "../scene/camera.js";

/** Gap kept between the scene's free area and the floating UI. */
const TOP_GAP_PX = 8;
const SHEET_GAP_PX = 8;
const PANEL_GAP_PX = 12;
/** A drawer at least this wide (share of the viewport) is the phone's bottom sheet. */
const SHEET_MIN_WIDTH_SHARE = 0.8;

export interface InsetMeasure {
  /** Bottom edge of the HUD (and the toasts under it), viewport pixels. */
  readonly hudBottom: number;
  /** Box of the drawer, viewport pixels; null when it is not measurable yet. */
  readonly drawer: { readonly left: number; readonly top: number; readonly width: number } | null;
  readonly viewWidth: number;
  readonly viewHeight: number;
}

function fin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Pure: which parts of the view the floating UI hides. top = HUD bottom + 8; on a phone the sheet
 * hides the bottom (+ 8), on a wide screen the side panel hides the right (+ 12). Invalid or
 * negative numbers count as 0 and each side is bounded so 30 % of the scene stays free.
 */
export function computeInsets(m: InsetMeasure): ObscuredInsets {
  const view = {
    width: fin(m.viewWidth) ? Math.max(0, m.viewWidth) : 0,
    height: fin(m.viewHeight) ? Math.max(0, m.viewHeight) : 0,
  };
  let top = fin(m.hudBottom) && m.hudBottom > 0 ? m.hudBottom + TOP_GAP_PX : 0;
  let bottom = 0;
  let right = 0;
  const d = m.drawer;
  if (d && fin(d.left) && fin(d.top) && fin(d.width) && d.width > 0 && view.width > 0) {
    if (d.width >= view.width * SHEET_MIN_WIDTH_SHARE) {
      bottom = Math.max(0, view.height - d.top) + SHEET_GAP_PX;
    } else {
      right = Math.max(0, view.width - d.left) + PANEL_GAP_PX;
    }
  }
  if (!(top >= 0)) top = 0;
  const safe = clampInsets({ top, right, bottom, left: 0 }, view);
  return {
    top: Math.round(safe.top),
    right: Math.round(safe.right),
    bottom: Math.round(safe.bottom),
    left: Math.round(safe.left),
  };
}

function same(a: ObscuredInsets, b: ObscuredInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * Measures the floating HUD and sheet (ResizeObserver, window resize) and returns the insets the
 * scene must avoid. Re-renders only when a value changes.
 */
export function useObscuredInsets(refs: {
  hud: RefObject<HTMLElement | null>;
  drawer: RefObject<HTMLElement | null>;
}): ObscuredInsets {
  const [insets, setInsets] = useState<ObscuredInsets>(NO_INSETS);
  const { hud, drawer } = refs;

  useEffect(() => {
    const hudEl = hud.current;
    const drawerEl = drawer.current;
    const measure = (): void => {
      const h = hudEl?.getBoundingClientRect();
      const d = drawerEl?.getBoundingClientRect();
      const next = computeInsets({
        hudBottom: h && h.height > 0 ? h.bottom : 0,
        drawer:
          d && d.width > 0 && d.height > 0 ? { left: d.left, top: d.top, width: d.width } : null,
        viewWidth: window.innerWidth,
        viewHeight: window.innerHeight,
      });
      setInsets((prev) => (same(prev, next) ? prev : next));
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (hudEl) observer?.observe(hudEl);
    if (drawerEl) observer?.observe(drawerEl);
    window.addEventListener("resize", measure);
    // The sheet opens and closes with a transform transition, which ResizeObserver does not see.
    drawerEl?.addEventListener("transitionend", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      drawerEl?.removeEventListener("transitionend", measure);
    };
  }, [hud, drawer]);

  return insets;
}
