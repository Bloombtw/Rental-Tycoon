import type { CSSProperties } from "react";
import { SPEEDS, type Speed } from "../game/clock.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface SpeedControlsProps {
  readonly speed: Speed;
  readonly paused: boolean;
  readonly hasRun: boolean;
  readonly onSetSpeed: (speed: Speed) => void;
  readonly onTogglePause: () => void;
}

export function SpeedControls({
  speed,
  paused,
  hasRun,
  onSetSpeed,
  onTogglePause,
}: SpeedControlsProps) {
  const index = Math.max(0, SPEEDS.indexOf(speed));
  return (
    <div className="speed-controls" role="group" aria-label="Vitesse du temps">
      <Button
        size="lg"
        variant="primary"
        icon={paused ? "play" : "pause"}
        className="speed-pause"
        data-testid="speed-pause"
        data-highlight={String(paused && !hasRun)}
        aria-pressed={paused}
        onClick={onTogglePause}
      >
        {paused ? "Reprendre" : "Pause"}
      </Button>
      <div
        className="speed-segmented"
        style={{ "--seg-index": index, "--seg-count": SPEEDS.length } as CSSProperties}
      >
        <span className="speed-thumb" aria-hidden="true" />
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className="speed-seg"
            data-testid={`speed-${s}`}
            data-active={String(s === speed)}
            aria-pressed={s === speed}
            onClick={() => {
              onSetSpeed(s);
            }}
          >
            {s === 1 && <Icon name="speed" size={16} className="speed-seg-icon" />}x{s}
          </button>
        ))}
      </div>
    </div>
  );
}
