import { Button } from "../ui/Button.js";
import { PanelHeader } from "../ui/PanelHeader.js";

interface NewGameButtonProps {
  readonly onClick: () => void;
}

/** "Partie" section at the bottom of the management sheet. */
export function NewGameButton({ onClick }: NewGameButtonProps) {
  return (
    <section className="card panel" aria-labelledby="game-title">
      <PanelHeader icon="settings" tone="neutral" id="game-title" title="Partie" />
      <Button
        variant="danger-quiet"
        size="lg"
        icon="restart"
        className="new-game-btn"
        data-testid="new-game"
        onClick={onClick}
      >
        Nouvelle partie
      </Button>
    </section>
  );
}
