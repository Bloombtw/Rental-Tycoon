import type { JSX } from "react";

/**
 * Inline SVG icons: one 24 x 24 grid, 2.25 px rounded strokes in `currentColor`, with a soft
 * duotone fill (`currentColor` at 20 %) for volume. No file, no font. Decorative: aria-hidden.
 */

export type IconName =
  | "coin"
  | "play"
  | "pause"
  | "speed"
  | "sun"
  | "sunset"
  | "moon"
  | "car"
  | "tag"
  | "wrench"
  | "sparkle"
  | "cart"
  | "key"
  | "parking"
  | "fleet"
  | "settings"
  | "restart"
  | "recenter"
  | "chevron-up"
  | "close"
  | "check-circle"
  | "alert"
  | "lock"
  | "trend-up"
  | "trend-down";

export type IconSize = 16 | 20 | 24 | 32 | 40 | 48;

const SIZES: readonly number[] = [16, 20, 24, 32, 40, 48];

/** Duotone fill: the stroke colour at 20 % opacity. */
const SOFT = { fill: "currentColor", fillOpacity: 0.2 } as const;
const SOLID = { fill: "currentColor", stroke: "none" } as const;

function glyph(name: IconName): JSX.Element {
  switch (name) {
    case "coin":
      return (
        <>
          <circle
            cx="12"
            cy="12"
            r="9.5"
            style={{ fill: "var(--c-gold-500)", stroke: "var(--c-gold-700)" }}
          />
          <circle
            cx="12"
            cy="12"
            r="6"
            style={{ fill: "var(--c-gold-300)", stroke: "var(--c-gold-700)" }}
            strokeWidth="1.75"
          />
          <path d="M10.2 12h3.6" style={{ stroke: "var(--c-gold-700)" }} strokeWidth="2" />
        </>
      );
    case "play":
      return (
        <path
          d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"
          {...SOLID}
        />
      );
    case "pause":
      return (
        <>
          <rect x="6" y="4.5" width="4.4" height="15" rx="1.6" {...SOLID} />
          <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.6" {...SOLID} />
        </>
      );
    case "speed":
      return (
        <>
          <path d="M5 6.5l6 5.5-6 5.5" />
          <path d="M13 6.5l6 5.5-6 5.5" />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="4.2" {...SOFT} />
          <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
        </>
      );
    case "sunset":
      return (
        <>
          <path d="M6.6 16.5a5.4 5.4 0 0 1 10.8 0z" {...SOFT} />
          <path d="M12 6.4v2.2M4.9 9.3l1.6 1.6M19.1 9.3l-1.6 1.6M2.8 16.5h18.4M7 20.5h10" />
        </>
      );
    case "moon":
      return <path d="M20.2 14.6A8.4 8.4 0 1 1 9.4 3.8a6.7 6.7 0 0 0 10.8 10.8z" {...SOFT} />;
    case "car":
      return (
        <>
          <path
            d="M3.2 16.2v-3.1a2.2 2.2 0 0 1 .3-1.1l1.7-3.6A2.2 2.2 0 0 1 7.2 7.1h9.6a2.2 2.2 0 0 1 2 1.3l1.7 3.6a2.2 2.2 0 0 1 .3 1.1v3.1a.9.9 0 0 1-.9.9H4.1a.9.9 0 0 1-.9-.9z"
            {...SOFT}
          />
          <path d="M5.4 12h13.2" />
          <circle cx="7.6" cy="17.2" r="2" style={{ fill: "var(--c-surface)" }} />
          <circle cx="16.4" cy="17.2" r="2" style={{ fill: "var(--c-surface)" }} />
        </>
      );
    case "tag":
      return (
        <>
          <path
            d="M3.2 12.1V5a1.8 1.8 0 0 1 1.8-1.8h7.1a1.8 1.8 0 0 1 1.3.5l7.5 7.5a1.8 1.8 0 0 1 0 2.5l-6.9 6.9a1.8 1.8 0 0 1-2.5 0l-7.5-7.5a1.8 1.8 0 0 1-.8-1.5z"
            {...SOFT}
          />
          <circle cx="8.2" cy="8.2" r="1.4" {...SOLID} />
        </>
      );
    case "wrench":
      return (
        <path
          d="M14.6 3.9a5 5 0 0 0-4.8 6.6l-6 6a2.2 2.2 0 0 0 3.1 3.1l6-6a5 5 0 0 0 6.6-4.8l-3 1.2-2.4-.7-.7-2.4 1.2-3-0.001 0z"
          {...SOFT}
        />
      );
    case "sparkle":
      return (
        <>
          <path
            d="M11 3.2c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7z"
            style={{ fill: "var(--c-gold-300)", stroke: "var(--c-gold-700)" }}
          />
          <path
            d="M18.2 14.6c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8z"
            style={{ fill: "var(--c-gold-500)", stroke: "var(--c-gold-700)" }}
            strokeWidth="1.5"
          />
        </>
      );
    case "cart":
      return (
        <>
          <path d="M2.8 4.2h2.5l2.2 10.6h10.1l2-7.9H6.2" {...SOFT} />
          <circle cx="9.2" cy="19" r="1.5" {...SOLID} />
          <circle cx="16.6" cy="19" r="1.5" {...SOLID} />
        </>
      );
    case "key":
      return (
        <>
          <circle cx="8" cy="15.4" r="4.3" {...SOFT} />
          <path d="M11.1 12.3L20.4 3M16.4 7l2.6 2.6M18.6 4.8l1.8 1.8" />
        </>
      );
    case "parking":
      return (
        <>
          <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" {...SOFT} />
          <path d="M10 17V7.4h3.1a3.1 3.1 0 0 1 0 6.2H10" />
        </>
      );
    case "fleet":
      return (
        <>
          <path d="M3 10.6L12 4l9 6.6V20H3z" {...SOFT} />
          <path d="M7 20v-7.2h10V20M7 16.4h10" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M3.5 7.5h9M18.5 7.5h2M3.5 16.5h2M11.5 16.5h9" />
          <circle cx="15.5" cy="7.5" r="2.6" {...SOFT} />
          <circle cx="8.5" cy="16.5" r="2.6" {...SOFT} />
        </>
      );
    case "restart":
      return (
        <>
          <path d="M20 12a8 8 0 1 1-2.5-5.8" />
          <path d="M20.2 3.6v4.8h-4.8" />
        </>
      );
    case "recenter":
      return (
        <>
          <circle cx="12" cy="12" r="6.4" {...SOFT} />
          <circle cx="12" cy="12" r="1.3" {...SOLID} />
          <path d="M12 2.8v3.2M12 18v3.2M2.8 12H6M18 12h3.2" />
        </>
      );
    case "chevron-up":
      return <path d="M6 14.8l6-6 6 6" />;
    case "close":
      return <path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" />;
    case "check-circle":
      return (
        <>
          <circle cx="12" cy="12" r="9.2" {...SOFT} />
          <path d="M7.8 12.4l2.9 2.9 5.6-6" />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M12 3.5l9.2 15.9a1.1 1.1 0 0 1-.95 1.6H3.75a1.1 1.1 0 0 1-.95-1.6z" {...SOFT} />
          <path d="M12 9.6v4.2M12 17.1h.01" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="4.8" y="10.4" width="14.4" height="10" rx="3" {...SOFT} />
          <path d="M8 10.4V8a4 4 0 0 1 8 0v2.4" />
        </>
      );
    case "trend-up":
      return <path d="M3.5 17l6-6 4 4 7-7.5M15.5 7.5h5v5" />;
    case "trend-down":
      return <path d="M3.5 7l6 6 4-4 7 7.5M15.5 16.5h5v-5" />;
  }
}

interface IconProps {
  readonly name: IconName;
  readonly size?: IconSize;
  readonly className?: string;
}

export function Icon({ name, size = 24, className }: IconProps): JSX.Element {
  const px = SIZES.includes(size) ? size : 24;
  return (
    <svg
      className={className === undefined ? "icon" : `icon ${className}`}
      data-icon={name}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph(name)}
    </svg>
  );
}

export type CarTint = "used" | "compact" | "hybrid" | "unknown";

/**
 * A drawn three-quarter car (160 x 120), nose to the left like the 3D thumbnails. The body colour
 * comes from the `--c-model-*` tokens through the `data-tint` attribute (see app.css).
 */
export function CarIllustration({
  tint,
  className,
}: {
  readonly tint: CarTint;
  readonly className?: string;
}): JSX.Element {
  return (
    <svg
      className={className === undefined ? "car-illu" : `car-illu ${className}`}
      data-tint={tint}
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="car-illu-shadow" cx="80" cy="101" rx="58" ry="9" />
      <g transform="translate(160 0) scale(-1 1)">
        {/* body */}
        <path
          className="car-illu-body"
          d="M18 80c0-9 5-14 13-16l16-4 12-17c3-4 7-6 12-6h30c6 0 11 2 15 7l12 15 12 4c9 2 14 7 14 16v10c0 4-3 7-7 7H25c-4 0-7-3-7-7z"
        />
        {/* shade under the belt line */}
        <path className="car-illu-shade" d="M18 84h132v6c0 4-3 7-7 7H25c-4 0-7-3-7-7z" />
        {/* windows */}
        <path className="car-illu-glass" d="M58 60l10-14c2-3 4-4 8-4h26c4 0 7 1 9 4l10 14z" />
        <path className="car-illu-pillar" d="M91 42v18" />
        {/* shine */}
        <path className="car-illu-shine" d="M34 68c4-3 9-4 15-5l8-1c-6 2-12 4-23 6z" />
        {/* lights */}
        <rect className="car-illu-lamp" x="140" y="72" width="11" height="7" rx="3" />
        <rect className="car-illu-tail" x="17" y="72" width="8" height="7" rx="3" />
        {/* wheels */}
        <circle className="car-illu-tyre" cx="50" cy="96" r="14" />
        <circle className="car-illu-rim" cx="50" cy="96" r="7" />
        <circle className="car-illu-tyre" cx="122" cy="96" r="14" />
        <circle className="car-illu-rim" cx="122" cy="96" r="7" />
      </g>
    </svg>
  );
}
