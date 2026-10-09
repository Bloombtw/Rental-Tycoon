import { useEffect, useRef, useState } from "react";
import { PRODUCTS, type ProductId } from "@rt/sim";
import { formatCents } from "../format.js";
import { PRODUCT_LABELS } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

const COINS = ["BTC", "ETH", "USDC"] as const;
type Coin = (typeof COINS)[number];

interface DemoCheckoutProps {
  readonly productId: ProductId;
  readonly onPaid: () => void;
  readonly onCancel: () => void;
}

/**
 * Stand-in for the crypto payment page in test mode (shop.md). Nothing is charged: "Simuler le
 * paiement" behaves like a confirmed payment.
 */
export function DemoCheckout({ productId, onPaid, onCancel }: DemoCheckoutProps) {
  const [coin, setCoin] = useState<Coin>("USDC");
  const payRef = useRef<HTMLButtonElement>(null);
  const paid = useRef(false);
  useEffect(() => {
    payRef.current?.focus();
  }, []);
  const p = PRODUCTS[productId];
  return (
    <div className="dialog-backdrop" data-testid="checkout-backdrop">
      <div
        className="dialog-card checkout-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        data-testid="demo-checkout"
      >
        <p className="shop-test">
          <Icon name="alert" size={16} /> Paiement de test : aucun argent réel.
        </p>
        <h2 id="checkout-title">Paiement en crypto</h2>
        <p>
          {PRODUCT_LABELS[productId]} · <strong>{formatCents(p.priceEur)}</strong>
        </p>
        <div className="coin-choice" role="radiogroup" aria-label="Crypto-monnaie">
          {COINS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={coin === c}
              className="coin-option"
              data-testid={`coin-${c}`}
              onClick={() => {
                setCoin(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="checkout-hint">
          En réel, la page du prestataire affiche l'adresse et le montant exact en {coin}.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" size="lg" data-testid="checkout-cancel" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            ref={payRef}
            variant="money"
            size="lg"
            data-testid="checkout-pay"
            onClick={() => {
              if (paid.current) return;
              paid.current = true;
              onPaid();
            }}
          >
            Simuler le paiement
          </Button>
        </div>
      </div>
    </div>
  );
}
