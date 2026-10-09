import type { ObscuredInsets } from "../scene/camera.js";
import type { CarTooltipContent } from "../scene/tooltip.js";
import { CarThumbnail } from "../ui/CarThumbnail.js";
import { Icon } from "../ui/icons.js";

const WIDTH = 220;
const HEIGHT = 84;
const MARGIN = 8;
const GAP = 14;

interface CarTooltipProps {
  readonly content: CarTooltipContent;
  /** Touch point, relative to the view. */
  readonly x: number;
  readonly y: number;
  /** Size of the view the tooltip lives in. */
  readonly bounds: { readonly width: number; readonly height: number };
  /** Parts of the view hidden under the HUD and the sheet: the tooltip stays in the free area. */
  readonly insets?: ObscuredInsets;
  /** Car model, for the thumbnail. */
  readonly model?: unknown;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

export function CarTooltip({ content, x, y, bounds, insets, model }: CarTooltipProps) {
  const px = Number.isFinite(x) ? x : 0;
  const py = Number.isFinite(y) ? y : 0;
  const top0 = insets?.top ?? 0;
  const left0 = insets?.left ?? 0;
  const right0 = insets?.right ?? 0;
  const bottom0 = insets?.bottom ?? 0;
  const leftMin = left0 + MARGIN;
  const topMin = top0 + MARGIN;
  const left = clamp(px - WIDTH / 2, leftMin, bounds.width - right0 - WIDTH - MARGIN);
  const above = py - HEIGHT - GAP;
  const top = clamp(
    above >= topMin ? above : py + GAP,
    topMin,
    bounds.height - bottom0 - HEIGHT - MARGIN,
  );
  return (
    <div
      className="car-tooltip"
      data-testid="car-tooltip"
      style={{ left, top, width: WIDTH, minHeight: HEIGHT }}
    >
      <CarThumbnail model={model} size="sm" alt={content.title} />
      <div className="car-tooltip-text">
        <strong>{content.title}</strong>
        <span className="car-tooltip-status" data-rented={String(content.rented)}>
          <span className="status-dot" aria-hidden="true" />
          {content.status}
        </span>
        <span className="car-tooltip-price">
          <Icon name="tag" size={16} />
          {content.price}
        </span>
      </div>
    </div>
  );
}
