import type { Speed } from "../game/clock.js";
import type { EventKind } from "@rt/sim";
import type { IconName } from "../ui/icons.js";
import { DayBanner } from "./DayBanner.js";

export const EVENT_ICONS: Readonly<Record<EventKind, IconName>> = Object.freeze({
  holidays: "event-holidays",
  carShow: "event-show",
  strike: "event-strike",
  storm: "event-storm",
});

interface EventBannerProps {
  readonly text: string;
  readonly kind: EventKind | null;
  readonly speed: Speed;
  readonly onDismiss: () => void;
}

/** "Event started" toast: same look and timing as the day toast, the App stacks it just below it. */
export function EventBanner({ text, kind, speed, onDismiss }: EventBannerProps) {
  return (
    <DayBanner
      text={text}
      speed={speed}
      onDismiss={onDismiss}
      icon={kind === null ? "sparkle" : EVENT_ICONS[kind]}
      testId="event-banner"
    />
  );
}
