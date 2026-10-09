import { useEffect, useRef } from "react";
import { formatCents } from "../format.js";
import type { OfflineReport } from "../game/offline.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface OfflineDialogProps {
  readonly report: OfflineReport;
  readonly onClaim: () => void;
}

/** "While you were away" report (offline-earnings.md). The gains are already in the game. */
export function OfflineDialog({ report, onClaim }: OfflineDialogProps) {
  const claimRef = useRef<HTMLButtonElement>(null);
  const onClaimRef = useRef(onClaim);
  useEffect(() => {
    onClaimRef.current = onClaim;
  }, [onClaim]);

  useEffect(() => {
    claimRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClaimRef.current();
      // A single button: keep Tab on it.
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

  const days = Number.isSafeInteger(report.days) && report.days > 0 ? report.days : 0;
  const delta = Number.isSafeInteger(report.delta) ? report.delta : 0;
  const gain = delta >= 0;
  const amount = `${gain ? "+" : "−"}${formatCents(Math.abs(delta))}`;
  const daysText = days === 1 ? "1 journée" : `${String(days)} journées`;

  return (
    <div className="dialog-backdrop" data-testid="offline-backdrop">
      <div
        className="dialog-card offline-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="offline-title"
        aria-describedby="offline-desc"
        data-testid="offline-dialog"
      >
        <span className="dialog-badge offline-badge" data-gain={String(gain)} aria-hidden="true">
          <Icon name={gain ? "coin" : "trend-down"} size={32} />
        </span>
        <h2 id="offline-title">Pendant ton absence</h2>
        <p className="offline-amount" data-gain={String(gain)} data-testid="offline-amount">
          {amount}
        </p>
        <p id="offline-desc" data-testid="offline-desc">
          L&apos;agence a tourné {daysText} sans toi.
        </p>
        <div className="dialog-actions">
          <Button
            ref={claimRef}
            variant={gain ? "money" : "primary"}
            size="lg"
            data-testid="offline-claim"
            onClick={onClaim}
          >
            {gain ? "Récupérer" : "Continuer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
