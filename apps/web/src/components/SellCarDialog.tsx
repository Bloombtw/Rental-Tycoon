import { useEffect, useRef } from "react";
import type { CarId, Cents } from "@rt/sim";
import { formatCents } from "../format.js";
import { SELL_BLOCKED_REASON } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface SellCarDialogProps {
  readonly carId: CarId;
  readonly value: Cents;
  /** False when the car left on a rental while the dialog was open: selling is refused. */
  readonly sellable: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** "Vendre la voiture n°3 pour 3 200 € ?" — confirmation before an irreversible sale. */
export function SellCarDialog({ carId, value, sellable, onCancel, onConfirm }: SellCarDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmed = useRef(false);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    // Remember the opener, move focus into the dialog, give it back on close.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onCancelRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Focus trap: Tab cycles through the enabled buttons of the dialog only.
      const items = Array.from(
        cardRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [],
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && items.includes(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const no = Number.isSafeInteger(carId) ? String(carId) : "—";
  const price = formatCents(Number.isSafeInteger(value) && value >= 0 ? value : 0);
  return (
    <div
      className="dialog-backdrop"
      data-testid="sell-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={cardRef}
        className="dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sell-car-title"
        aria-describedby="sell-car-desc"
        data-testid="sell-dialog"
      >
        <span className="dialog-badge offline-badge" data-gain="true" aria-hidden="true">
          <Icon name="coin" size={32} />
        </span>
        <h2 id="sell-car-title">{`Vendre la voiture n°${no} pour ${price} ?`}</h2>
        <p id="sell-car-desc">
          {sellable
            ? "Elle quittera définitivement votre flotte. Le prix est encaissé tout de suite."
            : SELL_BLOCKED_REASON}
        </p>
        <div className="dialog-actions">
          <Button
            ref={cancelRef}
            variant="secondary"
            size="lg"
            data-testid="sell-cancel"
            onClick={onCancel}
          >
            Annuler
          </Button>
          <Button
            variant="money"
            size="lg"
            data-testid="sell-confirm"
            disabled={!sellable}
            onClick={() => {
              if (confirmed.current) return;
              confirmed.current = true;
              onConfirm();
            }}
          >
            Vendre
          </Button>
        </div>
      </div>
    </div>
  );
}
