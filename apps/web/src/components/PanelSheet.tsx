import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "../ui/Button.js";
import { Icon, type IconName } from "../ui/icons.js";

interface PanelSheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly icon: IconName;
  readonly testId: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A menu opened from the side rail (side-menu.md): a sheet that rises from the bottom over the
 * city. Kept mounted (hidden when closed) so its state and its controls stay in place.
 */
export function PanelSheet({ open, title, icon, testId, onClose, children }: PanelSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      // A confirmation dialog on top (new game…) handles its own Escape first.
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <div
      className="panel-backdrop"
      hidden={!open}
      data-testid={`${testId}-backdrop`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="panel-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <header className="panel-sheet-head">
          <span className="rail-circle" aria-hidden="true">
            <Icon name={icon} size={24} />
          </span>
          <h2>{title}</h2>
          <Button
            ref={closeRef}
            variant="glass"
            size="icon"
            icon="close"
            aria-label={`Fermer ${title}`}
            data-testid={`${testId}-close`}
            onClick={onClose}
          />
        </header>
        <div className="panel-sheet-body">{children}</div>
      </section>
    </div>
  );
}
