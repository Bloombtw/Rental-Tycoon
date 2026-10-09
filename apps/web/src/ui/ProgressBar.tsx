import type { JSX } from "react";

interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  /** Accessible name. */
  readonly label: string;
  readonly tone?: "day" | "money" | "primary";
  readonly thin?: boolean;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** A thin progress bar. Non-finite values count as 0; the value is bounded to [0, max]. */
export function ProgressBar({
  value,
  max,
  label,
  tone = "primary",
  thin = false,
}: ProgressBarProps): JSX.Element {
  const safeMax = finite(max) && max > 0 ? max : 1;
  const safeValue = finite(value) ? Math.min(safeMax, Math.max(0, value)) : 0;
  const ratio = safeValue / safeMax;
  return (
    <div
      className="progress"
      data-tone={tone}
      data-thin={String(thin)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
    >
      <span className="progress-fill" style={{ transform: `scaleX(${String(ratio)})` }} />
    </div>
  );
}
