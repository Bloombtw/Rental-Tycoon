import { describe, expect, it } from "vitest";
import {
  activateBooster,
  advance,
  BOOSTERS,
  BoosterUnaffordableError,
  createGame,
  grantPurchase,
  InvalidReceiptError,
  ProductAlreadyOwnedError,
  PRODUCTS,
  restoreGameState,
  tick,
  type GameState,
  type Receipt,
} from "./index.js";

const receipt = (orderId: string, productId: string): Receipt => ({
  orderId,
  productId,
  mode: "test",
});

describe("grantPurchase", () => {
  it("credits diamonds and cash, once per order", () => {
    const g = createGame(1, 0);
    const a = grantPurchase(g, receipt("o1", "gems_medium"));
    expect(a.shop.gems).toBe(PRODUCTS.gems_medium.gems);
    expect(grantPurchase(a, receipt("o1", "gems_medium"))).toBe(a); // idempotent
    const b = grantPurchase(a, receipt("o2", "starter_pack"));
    expect(b.shop.gems).toBe(550 + 300);
    expect(b.cash).toBe(PRODUCTS.starter_pack.cash);
    expect(b.shop.owned).toEqual(["starter_pack"]);
    expect(() => grantPurchase(b, receipt("o3", "starter_pack"))).toThrow(ProductAlreadyOwnedError);
  });

  it("refuses unknown products and bad order ids", () => {
    const g = createGame(1, 0);
    expect(() => grantPurchase(g, receipt("o", "gems_infinite"))).toThrow(InvalidReceiptError);
    expect(() => grantPurchase(g, receipt("", "gems_small"))).toThrow(InvalidReceiptError);
    expect(() => grantPurchase(g, receipt("x".repeat(200), "gems_small"))).toThrow(
      InvalidReceiptError,
    );
    expect(() => grantPurchase(g, receipt("o", "__proto__"))).toThrow(InvalidReceiptError);
  });

  it("remembers at most the last 200 orders", () => {
    let g = createGame(1, 0);
    for (let i = 0; i < 205; i++) g = grantPurchase(g, receipt(`o${String(i)}`, "gems_small"));
    expect(g.shop.claimedOrders).toHaveLength(200);
    expect(g.shop.gems).toBe(205 * 100);
  });
});

describe("boosters", () => {
  const rich = (): GameState => grantPurchase(createGame(1, 0), receipt("o", "gems_huge"));

  it("cost diamonds; not enough diamonds is refused", () => {
    const g = activateBooster(rich(), "revenue_x2");
    expect(g.shop.gems).toBe(2_600 - BOOSTERS.revenue_x2.gems);
    expect(() => activateBooster(createGame(1), "revenue_x2")).toThrow(BoosterUnaffordableError);
  });

  it("stack by extending the end day", () => {
    let g = activateBooster(rich(), "revenue_x2");
    expect(g.shop.boosts.revenueUntilDay).toBe(1);
    g = activateBooster(g, "revenue_x2_3d");
    expect(g.shop.boosts.revenueUntilDay).toBe(4);
  });

  it("revenue ×2 doubles the day's rentals while it runs", () => {
    const fleet = Array.from({ length: 5 }, () => ({ dailyPrice: 90_00, dailyCost: 0 }));
    const base = grantPurchase(createGame(4, 0, fleet), receipt("o", "gems_huge"));
    const boosted = activateBooster(base, "revenue_x2");
    const a = tick(base);
    const b = tick(boosted);
    expect(b.lastDay?.revenue).toBe(2 * (a.lastDay?.revenue ?? 0));
    expect(b.xp).toBe(a.xp); // XP stays on the price
    // Over once the day ends.
    const later = advance(boosted, 2);
    expect(later.day).toBeGreaterThanOrEqual(later.shop.boosts.revenueUntilDay);
  });

  it("cash bundle pays at once", () => {
    const g = activateBooster(rich(), "cash_bundle");
    expect(g.cash).toBe(BOOSTERS.cash_bundle.cash);
  });
});

describe("save v7", () => {
  it("migrates a v6 save with an empty shop", () => {
    const v6 = JSON.parse(JSON.stringify(createGame(1))) as Record<string, unknown>;
    delete v6["shop"];
    expect(restoreGameState(v6, 6).shop).toEqual({
      gems: 0,
      boosts: { revenueUntilDay: 0, demandUntilDay: 0 },
      owned: [],
      claimedOrders: [],
    });
  });

  it("round-trips a shop with purchases", () => {
    const g = activateBooster(
      grantPurchase(
        grantPurchase(createGame(1), receipt("a", "starter_pack")),
        receipt("b", "gems_small"),
      ),
      "demand_plus",
    );
    expect(restoreGameState(JSON.parse(JSON.stringify(g)), 8)).toEqual(g);
  });
});
