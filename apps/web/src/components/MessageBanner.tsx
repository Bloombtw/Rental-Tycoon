interface MessageBannerProps {
  readonly error: string | null;
  readonly notice: string | null;
  readonly onDismiss: () => void;
}

export function MessageBanner({ error, notice, onDismiss }: MessageBannerProps) {
  const text = error ?? notice;
  if (text === null || text === "") return null;
  const isError = error !== null;
  return (
    <div
      className="banner"
      data-kind={isError ? "error" : "notice"}
      data-testid={isError ? "error-banner" : "notice"}
      role={isError ? "alert" : "status"}
    >
      <span>{text}</span>
      <button type="button" className="btn" onClick={onDismiss}>
        Fermer
      </button>
    </div>
  );
}
