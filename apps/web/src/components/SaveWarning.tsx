import type { SaveStatus } from "../game/persistence.js";
import { SAVE_FAILED_WARNING, SAVE_UNAVAILABLE_WARNING } from "../game/messages.js";

interface SaveWarningProps {
  readonly status: SaveStatus;
  readonly visible: boolean;
  readonly onDismiss: () => void;
}

export function SaveWarning({ status, visible, onDismiss }: SaveWarningProps) {
  if (!visible || status === "ok") return null;
  return (
    <div className="save-warning" role="alert" data-testid="save-warning">
      <span>{status === "unavailable" ? SAVE_UNAVAILABLE_WARNING : SAVE_FAILED_WARNING}</span>
      <button
        type="button"
        className="btn save-warning-ok"
        data-testid="save-warning-dismiss"
        aria-label="OK, fermer l'avertissement"
        onClick={onDismiss}
      >
        OK
      </button>
    </div>
  );
}
