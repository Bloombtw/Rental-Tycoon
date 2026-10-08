import { useEffect, useRef } from "react";
import type { GameState } from "@rt/sim";
import { formatCents } from "../format.js";
import { newGameSummary } from "../game/messages.js";

interface NewGameDialogProps {
  readonly game: GameState;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function safeCents(n: number): string {
  return formatCents(Number.isSafeInteger(n) ? n : 0);
}

export function NewGameDialog({ game, onCancel, onConfirm }: NewGameDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);

  const cardRef = useRef<HTMLDivElement>(null);
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
      // Focus trap: Tab cycles through the dialog's buttons only.
      const items = Array.from(cardRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
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

  const day = Number.isSafeInteger(game.day) && game.day >= 0 ? game.day + 1 : 1;
  const summary = newGameSummary(`Jour ${day}`, safeCents(game.cash), game.fleet.length);

  return (
    <div
      className="dialog-backdrop"
      data-testid="new-game-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={cardRef}
        className="dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="new-game-title"
        aria-describedby="new-game-desc"
        data-testid="new-game-dialog"
      >
        <h2 id="new-game-title">Recommencer une partie ?</h2>
        <p id="new-game-desc" data-testid="new-game-summary">
          {summary}
        </p>
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-neutral"
            data-testid="new-game-cancel"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            data-testid="new-game-confirm"
            onClick={() => {
              if (confirmed.current) return;
              confirmed.current = true;
              onConfirm();
            }}
          >
            Recommencer
          </button>
        </div>
      </div>
    </div>
  );
}
