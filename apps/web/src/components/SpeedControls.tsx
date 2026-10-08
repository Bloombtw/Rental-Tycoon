import { SPEEDS, type Speed } from "../game/clock.js";

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
  return (
    <div className="speed-controls" role="group" aria-label="Vitesse du temps">
      <button
        type="button"
        className="btn speed-pause"
        data-testid="speed-pause"
        data-highlight={String(paused && !hasRun)}
        aria-pressed={paused}
        onClick={onTogglePause}
      >
        {paused ? "Reprendre" : "Pause"}
      </button>
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          className="btn speed-btn"
          data-testid={`speed-${s}`}
          data-active={String(s === speed)}
          aria-pressed={s === speed}
          onClick={() => {
            onSetSpeed(s);
          }}
        >
          x{s}
        </button>
      ))}
    </div>
  );
}
