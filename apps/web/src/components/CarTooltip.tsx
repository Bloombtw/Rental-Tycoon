import type { CarTooltipContent } from "../scene/tooltip.js";

const WIDTH = 220;
const HEIGHT = 84;
const MARGIN = 8;
const GAP = 14;

interface CarTooltipProps {
  readonly content: CarTooltipContent;
  /** Touch point, relative to the view. */
  readonly x: number;
  readonly y: number;
  /** Size of the usable area the tooltip must stay inside. */
  readonly bounds: { readonly width: number; readonly height: number };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

export function CarTooltip({ content, x, y, bounds }: CarTooltipProps) {
  const px = Number.isFinite(x) ? x : 0;
  const py = Number.isFinite(y) ? y : 0;
  const left = clamp(px - WIDTH / 2, MARGIN, bounds.width - WIDTH - MARGIN);
  const above = py - HEIGHT - GAP;
  const top = clamp(above >= MARGIN ? above : py + GAP, MARGIN, bounds.height - HEIGHT - MARGIN);
  return (
    <div
      className="car-tooltip"
      data-testid="car-tooltip"
      style={{ left, top, width: WIDTH, minHeight: HEIGHT }}
    >
      <strong>{content.title}</strong>
      <span>{content.status}</span>
      <span>{content.price}</span>
    </div>
  );
}
