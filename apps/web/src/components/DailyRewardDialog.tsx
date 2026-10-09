import { useEffect, useRef } from "react";
import { DAILY_REWARDS, rewardForStreak } from "@rt/sim";
import { formatCents } from "../format.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface DailyRewardDialogProps {
  /** Streak day this claim reaches (1-based). */
  readonly streak: number;
  readonly onClaim: () => void;
}

/** Daily login reward with the 7-day streak strip (daily-reward.md). */
export function DailyRewardDialog({ streak, onClaim }: DailyRewardDialogProps) {
  const claimRef = useRef<HTMLButtonElement>(null);
  const claimed = useRef(false);
  const onClaimRef = useRef(onClaim);
  useEffect(() => {
    onClaimRef.current = onClaim;
  }, [onClaim]);
  useEffect(() => {
    claimRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Tab") {
        e.preventDefault();
        claimRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const day = Number.isSafeInteger(streak) && streak > 0 ? streak : 1;
  const inCycle = ((day - 1) % DAILY_REWARDS.length) + 1;
  const amount = rewardForStreak(day);
  const claim = (): void => {
    if (claimed.current) return;
    claimed.current = true;
    onClaimRef.current();
  };

  return (
    <div className="dialog-backdrop" data-testid="daily-backdrop">
      <div
        className="dialog-card daily-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="daily-title"
        aria-describedby="daily-desc"
        data-testid="daily-dialog"
      >
        <span className="dialog-badge offline-badge" data-gain="true" aria-hidden="true">
          <Icon name="coin" size={32} />
        </span>
        <h2 id="daily-title">Récompense du jour</h2>
        <p id="daily-desc">
          {day === 1
            ? "Revenez chaque jour : la prime grimpe !"
            : `Série de ${String(day)} jours !`}
        </p>
        <ol className="daily-strip" aria-label="Primes de la semaine">
          {DAILY_REWARDS.map((r, i) => {
            const n = i + 1;
            const state = n < inCycle ? "past" : n === inCycle ? "today" : "future";
            return (
              <li key={n} className="daily-day" data-state={state}>
                <span className="daily-day-n">J{n}</span>
                <span className="daily-day-amount">{formatCents(r).replace(",00", "")}</span>
              </li>
            );
          })}
        </ol>
        <p className="offline-amount" data-gain="true" data-testid="daily-amount">
          +{formatCents(amount)}
        </p>
        <div className="dialog-actions">
          <Button
            ref={claimRef}
            variant="money"
            size="lg"
            data-testid="daily-claim"
            onClick={claim}
          >
            Récupérer
          </Button>
        </div>
      </div>
    </div>
  );
}
