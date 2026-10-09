import { useEffect, useRef } from "react";
import {
  BOOSTER_IDS,
  BOOSTERS,
  PRODUCT_IDS,
  PRODUCTS,
  type BoosterId,
  type GameState,
  type ProductId,
} from "@rt/sim";
import { formatCents } from "../format.js";
import { BOOSTER_LABELS, PRODUCT_LABELS, gemsText } from "../game/messages.js";
import type { PaymentMode } from "../game/payments.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

interface ShopDialogProps {
  readonly game: GameState;
  readonly mode: PaymentMode;
  /** Product being paid (live checkout in progress): its button waits. */
  readonly busy: ProductId | null;
  readonly onBuy: (id: ProductId) => void;
  readonly onBoost: (id: BoosterId) => void;
  readonly onClose: () => void;
}

/** Days left of a booster ending at `until`, or 0. */
function daysLeft(game: GameState, until: number): number {
  return Math.max(0, until - game.day);
}

/** Real-money shop (shop.md): diamond packs, starter pack, boosters paid in diamonds. */
export function ShopDialog({ game, mode, busy, onBuy, onBoost, onClose }: ShopDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const shop = game.shop;
  const starterOwned = shop.owned.includes("starter_pack");
  const revenueDays = daysLeft(game, shop.boosts.revenueUntilDay);
  const demandDays = daysLeft(game, shop.boosts.demandUntilDay);

  const productCard = (id: ProductId) => {
    const p = PRODUCTS[id];
    const featured = id === "starter_pack";
    return (
      <div className="shop-product" data-featured={String(featured)} key={id}>
        <span className="shop-product-icon" aria-hidden="true">
          <Icon name={featured ? "sparkle" : "gem"} size={featured ? 40 : 32} />
        </span>
        <div className="shop-product-info">
          <h3>{PRODUCT_LABELS[id]}</h3>
          <p>
            {gemsText(p.gems)}
            {p.cash > 0 ? ` + ${formatCents(p.cash)}` : ""}
          </p>
        </div>
        <Button
          variant={featured ? "money" : "primary"}
          size="md"
          data-testid={`shop-buy-${id}`}
          disabled={busy !== null}
          onClick={() => {
            onBuy(id);
          }}
        >
          {busy === id ? "…" : formatCents(p.priceEur)}
        </Button>
      </div>
    );
  };

  return (
    <div
      className="dialog-backdrop"
      data-testid="shop-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog-card shop-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-title"
        data-testid="shop-dialog"
      >
        <header className="shop-head">
          <h2 id="shop-title">
            <Icon name="shop" size={24} /> Boutique
          </h2>
          <span className="gem-chip" data-testid="shop-gems">
            <Icon name="gem" size={20} />
            {gemsText(shop.gems)}
          </span>
          <Button
            ref={closeRef}
            variant="glass"
            size="icon"
            icon="close"
            aria-label="Fermer la boutique"
            data-testid="shop-close"
            onClick={onClose}
          />
        </header>
        {mode === "test" && (
          <p className="shop-test" data-testid="shop-test-banner">
            <Icon name="alert" size={16} /> Mode test : aucun paiement réel n'est effectué.
          </p>
        )}
        <div className="shop-scroll">
          {!starterOwned && productCard("starter_pack")}
          <h3 className="shop-section">Diamants · paiement en crypto</h3>
          <div className="shop-grid">
            {PRODUCT_IDS.filter((id) => id !== "starter_pack").map(productCard)}
          </div>
          <h3 className="shop-section">Boosters</h3>
          {(revenueDays > 0 || demandDays > 0) && (
            <p className="shop-active" data-testid="shop-active">
              <Icon name="bolt" size={16} />
              {revenueDays > 0 ? `Recettes ×2 : encore ${String(revenueDays)} j. ` : ""}
              {demandDays > 0 ? `Affluence : encore ${String(demandDays)} j.` : ""}
            </p>
          )}
          {BOOSTER_IDS.map((id) => {
            const b = BOOSTERS[id];
            const poor = shop.gems < b.gems;
            return (
              <div className="shop-product" key={id}>
                <span className="shop-product-icon" data-kind="boost" aria-hidden="true">
                  <Icon name={id === "cash_bundle" ? "coin" : "bolt"} size={24} />
                </span>
                <div className="shop-product-info">
                  <h3>{BOOSTER_LABELS[id]}</h3>
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  data-testid={`shop-boost-${id}`}
                  disabled={poor}
                  onClick={() => {
                    onBoost(id);
                  }}
                >
                  <Icon name="gem" size={16} /> {b.gems}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
