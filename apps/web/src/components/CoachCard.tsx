import { COACH, TUTORIAL_STEPS, type TutorialStep } from "../game/tutorial.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface CoachCardProps {
  readonly step: TutorialStep;
  readonly onNext: () => void;
  readonly onSkip: () => void;
}

/** Tutorial coach card under the HUD (tutorial.md). Nothing once the tutorial is done. */
export function CoachCard({ step, onNext, onSkip }: CoachCardProps) {
  if (step === "done") return null;
  const text = COACH[step];
  const index = TUTORIAL_STEPS.indexOf(step) + 1;
  return (
    <section
      className="coach-card glass-light"
      data-testid="coach-card"
      data-step={step}
      role="status"
      aria-live="polite"
    >
      <span className="coach-badge" aria-hidden="true">
        <Icon name="sparkle" size={20} />
      </span>
      <div className="coach-body">
        <p className="coach-count">
          Tutoriel · {index}/{TUTORIAL_STEPS.length}
        </p>
        <h2>{text.title}</h2>
        <p>{text.body}</p>
        <div className="coach-actions">
          {text.next !== null && (
            <Button variant="primary" size="md" data-testid="coach-next" onClick={onNext}>
              {text.next}
            </Button>
          )}
          <button type="button" className="coach-skip" data-testid="coach-skip" onClick={onSkip}>
            Passer le tutoriel
          </button>
        </div>
      </div>
    </section>
  );
}
