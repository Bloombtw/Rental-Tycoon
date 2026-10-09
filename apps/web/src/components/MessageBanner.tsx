import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface MessageBannerProps {
  readonly error: string | null;
  readonly notice: string | null;
  readonly onDismiss: () => void;
}

/** Floating toasts under the HUD: a green notice, or a red error that shakes once. */
export function MessageBanner({ error, notice, onDismiss }: MessageBannerProps) {
  const errorText = error !== null && error !== "" ? error : null;
  const noticeText = errorText === null && notice !== null && notice !== "" ? notice : null;
  return (
    <div className="banner-slot">
      {/* Live region stays mounted so screen readers announce the text when it appears. */}
      <div role="status" aria-live="polite">
        {noticeText !== null && (
          <div className="banner toast" data-kind="notice" data-testid="notice">
            <Icon name="check-circle" size={24} className="toast-icon" />
            <span className="toast-text">{noticeText}</span>
            <Button
              variant="glass"
              size="icon"
              icon="close"
              className="toast-close"
              aria-label="Fermer"
              onClick={onDismiss}
            />
          </div>
        )}
      </div>
      {errorText !== null && (
        <div className="banner toast" data-kind="error" data-testid="error-banner" role="alert">
          <Icon name="alert" size={24} className="toast-icon" />
          <span className="toast-text">{errorText}</span>
          <Button
            variant="glass"
            size="icon"
            icon="close"
            className="toast-close"
            aria-label="Fermer"
            onClick={onDismiss}
          />
        </div>
      )}
    </div>
  );
}
