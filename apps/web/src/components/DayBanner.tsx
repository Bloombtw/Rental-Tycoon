import { useEffect, useRef, useState } from "react";
import { dayBannerDurationMs, type Speed } from "../game/clock.js";
import { Icon } from "../ui/icons.js";

interface DayBannerProps {
  readonly text: string;
  readonly speed: Speed;
  readonly onDismiss: () => void;
}

/** "New day" toast. Fixed duration chosen when it appears; a new text restarts the timer. */
export function DayBanner({ text, speed, onDismiss }: DayBannerProps) {
  const speedRef = useRef(speed);
  const dismissRef = useRef(onDismiss);
  // The bar's length is frozen when the text arrives (like the timer): a later speed change
  // must not make it jump.
  const [frozen, setFrozen] = useState({ text, ms: dayBannerDurationMs(speed) });
  if (frozen.text !== text) setFrozen({ text, ms: dayBannerDurationMs(speed) });
  useEffect(() => {
    speedRef.current = speed;
    dismissRef.current = onDismiss;
  });
  useEffect(() => {
    const id = setTimeout(() => {
      dismissRef.current();
    }, dayBannerDurationMs(speedRef.current));
    return () => {
      clearTimeout(id);
    };
  }, [text]);
  return (
    <div className="day-banner-slot">
      <button
        type="button"
        className="day-banner glass-dark"
        data-testid="day-banner"
        role="status"
        onClick={onDismiss}
      >
        <Icon name="sun" size={20} className="day-banner-icon" />
        <span className="day-banner-text">{text}</span>
        <span
          key={frozen.text}
          className="day-banner-bar"
          aria-hidden="true"
          style={{ animationDuration: `${String(frozen.ms)}ms` }}
        />
      </button>
    </div>
  );
}
