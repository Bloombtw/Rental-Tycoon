interface NewGameButtonProps {
  readonly onClick: () => void;
}

/** "Partie" section at the bottom of the management sheet. */
export function NewGameButton({ onClick }: NewGameButtonProps) {
  return (
    <section className="card panel" aria-labelledby="game-title">
      <h2 id="game-title">Partie</h2>
      <button
        type="button"
        className="btn btn-danger-quiet new-game-btn"
        data-testid="new-game"
        onClick={onClick}
      >
        Nouvelle partie
      </button>
    </section>
  );
}
