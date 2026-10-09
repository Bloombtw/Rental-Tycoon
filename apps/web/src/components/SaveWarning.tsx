import type { SaveStatus } from "../game/persistence.js";
import { SAVE_FAILED_WARNING, SAVE_UNAVAILABLE_WARNING } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface SaveWarningProps {
  readonly status: SaveStatus;
  readonly visible: boolean;
  readonly onDismiss: () => void;
}

/** Amber toast: the game cannot be saved on this device. */
export function SaveWarning({ status, visible, onDismiss }: SaveWarningProps) {
  if (!visible || status === "ok") return null;
  return (
    <div className="save-warning toast" data-kind="warning" role="alert" data-testid="save-warning">
      <Icon name="alert" size={24} className="toast-icon" />
      <span className="toast-text">
        {status === "unavailable" ? SAVE_UNAVAILABLE_WARNING : SAVE_FAILED_WARNING}
      </span>
      <Button
        variant="secondary"
        className="save-warning-ok"
        data-testid="save-warning-dismiss"
        aria-label="OK, fermer l'avertissement"
        onClick={onDismiss}
      >
        OK
      </Button>
    </div>
  );
}
