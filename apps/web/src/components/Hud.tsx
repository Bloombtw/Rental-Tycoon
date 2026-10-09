import { forwardRef } from "react";
import { DAY_MINUTES, activeEvent, eventDaysLeft, levelForXp, type GameState } from "@rt/sim";
import { formatCents } from "../format.js";
import { formatClock, type Speed } from "../game/clock.js";
import { EVENT_LABELS, EVENT_SHORT_LABELS, eventEffectText } from "../game/messages.js";
import { AnimatedCents } from "../ui/AnimatedCents.js";
import { Icon, type IconName } from "../ui/icons.js";
import { ProgressBar } from "../ui/ProgressBar.js";
import { usePop } from "../ui/usePop.js";
import { EVENT_ICONS } from "./EventBanner.js";
import { SpeedControls } from "./SpeedControls.js";

interface HudProps {
  readonly game: GameState;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly hasRun: boolean;
  readonly onSetSpeed: (speed: Speed) => void;
  readonly onTogglePause: () => void;
  /** Sound off (sounds.md). The button is hidden without a handler. */
  readonly muted?: boolean;
  readonly onToggleMute?: () => void;
  /** Tap on the event chip (reminds the effect). The chip is still shown without a handler. */
  readonly onEventInfo?: () => void;
}

/** Minutes since 09:00 at which the sun icon turns into a sunset (18:00) and a moon (20:00). */
const SUNSET_MINUTE = 9 * 60;
const MOON_MINUTE = 11 * 60;

function clockIcon(minute: number): IconName {
  if (!Number.isFinite(minute) || minute < SUNSET_MINUTE) return "sun";
  return minute < MOON_MINUTE ? "sunset" : "moon";
}

/** Active event pill: round icon, short name, days left. Tap = reminder of the effect. */
function EventChip({ game, onTap }: { readonly game: GameState; readonly onTap?: () => void }) {
  const event = activeEvent(game);
  if (event === null) return null;
  const left = eventDaysLeft(game);
  const days = Number.isSafeInteger(left) && left >= 1 ? left : 1;
  const label = `${EVENT_LABELS[event.kind]} : ${eventEffectText(event.kind)}, encore ${String(days)} jour${days > 1 ? "s" : ""}`;
  return (
    <button
      type="button"
      className="event-chip"
      data-testid="hud-event"
      data-kind={event.kind}
      title={label}
      aria-label={label}
      onClick={onTap}
    >
      <span className="event-chip-icon">
        <Icon name={EVENT_ICONS[event.kind]} size={16} />
      </span>
      <span className="event-chip-name">{EVENT_SHORT_LABELS[event.kind]}</span>
      <span className="event-chip-days">{`${String(days)} j`}</span>
    </button>
  );
}

function Report({
  game,
  onEventInfo,
}: {
  readonly game: GameState;
  readonly onEventInfo?: () => void;
}) {
  const report = game.lastDay;
  const today = Number.isSafeInteger(game.todayRevenue) ? game.todayRevenue : 0;
  const todayText = `Aujourd'hui : +${formatCents(today)}`;
  // The pill re-mounts (and pops) whenever the value changes, never at first render.
  const pop = usePop(today);
  const chip = <EventChip game={game} {...(onEventInfo ? { onTap: onEventInfo } : {})} />;
  const todayPill = (
    <span className="hud-today" data-testid="hud-today" key={pop} data-pop={String(pop > 0)}>
      <span className="hud-sep">{" · "}</span>
      {todayText}
    </span>
  );
  if (report === null) {
    return (
      <p className="hud-report" data-testid="hud-report" data-tutorial="hud-report">
        {chip}
        Aucune journée écoulée.
        {todayPill}
      </p>
    );
  }
  const net = report.revenue - report.costs;
  const sign = net > 0 ? "positive" : net < 0 ? "negative" : "zero";
  const netText = `${net > 0 ? "+" : ""}${formatCents(net)}`;
  return (
    <p className="hud-report" data-testid="hud-report" data-tutorial="hud-report" data-sign={sign}>
      {chip}
      Hier : recettes {formatCents(report.revenue)} · charges {formatCents(report.costs)} · résultat{" "}
      <span className="hud-net">
        {sign !== "zero" && (
          <Icon name={sign === "positive" ? "trend-up" : "trend-down"} size={16} />
        )}
        {netText}
      </span>
      {todayPill}
    </p>
  );
}

/** Floating glass card at the top of the screen: clock, cash, speed controls and yesterday's report. */
export const Hud = forwardRef<HTMLElement, HudProps>(function Hud(
  {
    game,
    speed,
    paused,
    hasRun,
    onSetSpeed,
    onTogglePause,
    muted = false,
    onToggleMute,
    onEventInfo,
  },
  ref,
) {
  const negative = game.cash < 0;
  const minute = Number.isFinite(game.minute) ? game.minute : 0;
  const level = levelForXp(game.xp);
  const levelPop = usePop(level);
  return (
    <header className="hud glass-dark" ref={ref}>
      <div className="hud-main">
        <div className="clock-pill">
          <div className="clock-line">
            <Icon name={clockIcon(game.minute)} size={20} className="clock-icon" />
            <strong data-testid="hud-clock">{formatClock(game.day, game.minute)}</strong>
            <span
              className="level-chip"
              data-testid="hud-level"
              key={levelPop}
              data-pop={String(levelPop > 0)}
              aria-label={`Niveau ${String(level)} de l'agence`}
            >
              <Icon name="sparkle" size={16} />
              {level}
            </span>
          </div>
          <ProgressBar
            value={minute}
            max={DAY_MINUTES}
            label="Progression de la journée"
            tone="day"
            thin
          />
        </div>
        <div className="cash-pill" data-negative={String(negative)}>
          {onToggleMute && (
            <button
              type="button"
              className="sound-toggle"
              data-testid="sound-toggle"
              aria-pressed={muted}
              aria-label={muted ? "Activer le son" : "Couper le son"}
              onClick={onToggleMute}
            >
              <Icon name={muted ? "sound-off" : "sound-on"} size={16} />
            </button>
          )}
          <Icon name="coin" size={24} className="cash-icon" />
          <span className="cash-body">
            <span className="cash-label">Caisse</span>
            <span
              className="sr-only hud-cash"
              data-testid="hud-cash"
              data-negative={String(negative)}
            >
              {formatCents(game.cash)}
            </span>
            <AnimatedCents
              value={game.cash}
              className="cash-amount"
              data-testid="hud-cash-display"
            />
          </span>
        </div>
      </div>
      <SpeedControls
        speed={speed}
        paused={paused}
        hasRun={hasRun}
        onSetSpeed={onSetSpeed}
        onTogglePause={onTogglePause}
      />
      <Report game={game} {...(onEventInfo ? { onEventInfo } : {})} />
    </header>
  );
});
