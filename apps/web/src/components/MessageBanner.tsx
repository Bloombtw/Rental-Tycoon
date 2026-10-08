interface MessageBannerProps {
  readonly error: string | null;
  readonly notice: string | null;
  readonly onDismiss: () => void;
}

export function MessageBanner({ error, notice, onDismiss }: MessageBannerProps) {
  const errorText = error !== null && error !== "" ? error : null;
  const noticeText = errorText === null && notice !== null && notice !== "" ? notice : null;
  return (
    <div className="banner-slot">
      {/* Live region stays mounted so screen readers announce the text when it appears. */}
      <div role="status" aria-live="polite">
        {noticeText !== null && (
          <div className="banner" data-kind="notice" data-testid="notice">
            <span>{noticeText}</span>
            <button type="button" className="btn" onClick={onDismiss}>
              Fermer
            </button>
          </div>
        )}
      </div>
      {errorText !== null && (
        <div className="banner" data-kind="error" data-testid="error-banner" role="alert">
          <span>{errorText}</span>
          <button type="button" className="btn" onClick={onDismiss}>
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
