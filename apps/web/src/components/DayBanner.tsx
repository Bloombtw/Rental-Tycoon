import { useEffect, useRef } from "react";
import { dayBannerDurationMs, type Speed } from "../game/clock.js";

interface DayBannerProps {
  readonly text: string;
  readonly speed: Speed;
  readonly onDismiss: () => void;
}

/** "New day" toast. Fixed duration chosen when it appears; a new text restarts the timer. */
export function DayBanner({ text, speed, onDismiss }: DayBannerProps) {
  const speedRef = useRef(speed);
  const dismissRef = useRef(onDismiss);
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
        className="day-banner"
        data-testid="day-banner"
        role="status"
        onClick={onDismiss}
      >
        {text}
      </button>
    </div>
  );
}
