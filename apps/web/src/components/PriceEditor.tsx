import { useId, useState, type FormEvent } from "react";
import type { CarId, Cents } from "@rt/sim";
import { formatCentsForInput, parseEurosToCents } from "../game/parseEuros.js";
import { PRICE_FORMAT_ERROR, PRICE_RANGE_ERROR } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface PriceEditorProps {
  readonly carId: CarId;
  readonly dailyPrice: Cents;
  readonly onSubmit: (dailyPrice: Cents) => void;
}

export function PriceEditor({ carId, dailyPrice, onSubmit }: PriceEditorProps) {
  const inputId = useId();
  const [text, setText] = useState(() => formatCentsForInput(dailyPrice));
  const [problem, setProblem] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  const [syncedPrice, setSyncedPrice] = useState(dailyPrice);

  // Resync with the sim price whenever it changes (adjust state during render).
  if (!Object.is(syncedPrice, dailyPrice)) {
    setSyncedPrice(dailyPrice);
    setText(formatCentsForInput(dailyPrice));
    setProblem(null);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const parsed = parseEurosToCents(text);
    if (!parsed.ok) {
      setProblem(parsed.reason === "range" ? PRICE_RANGE_ERROR : PRICE_FORMAT_ERROR);
      setShaking(true);
      return;
    }
    setProblem(null);
    setShaking(false);
    // Normalise the field even when the price is unchanged ("60" becomes "60,00").
    setText(formatCentsForInput(parsed.cents));
    onSubmit(parsed.cents);
  }

  const errorId = `${inputId}-error`;
  return (
    <form className="price-editor" onSubmit={submit} noValidate>
      <label htmlFor={inputId}>Prix par jour (€)</label>
      <div className="price-editor-row">
        <div
          className="input-wrap"
          data-invalid={String(problem !== null)}
          data-shake={String(shaking)}
          onAnimationEnd={() => {
            setShaking(false);
          }}
        >
          <input
            id={inputId}
            className="input"
            type="text"
            inputMode="decimal"
            maxLength={10}
            value={text}
            aria-invalid={problem !== null}
            aria-describedby={problem !== null ? errorId : undefined}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          <span className="input-suffix" aria-hidden="true">
            €
          </span>
        </div>
        <Button type="submit" variant="secondary">
          Appliquer
        </Button>
      </div>
      {problem !== null && (
        <p className="field-error" id={errorId} data-testid={`price-error-${carId}`}>
          <Icon name="alert" size={16} />
          {problem}
        </p>
      )}
    </form>
  );
}
