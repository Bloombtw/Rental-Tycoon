import {
  BoosterUnaffordableError,
  InvalidReceiptError,
  ProductAlreadyOwnedError,
  SimOverflowError,
} from "./errors.js";
import type { Cents, GameState } from "./state.js";

/** Real-money shop and premium currency (shop.md). Pure: no payment happens here. */

export type ProductId = "gems_small" | "gems_medium" | "gems_large" | "gems_huge" | "starter_pack";

export interface Product {
  readonly id: ProductId;
  /** Price in euro cents (what the payment provider charges). */
  readonly priceEur: Cents;
  readonly gems: number;
  /** In-game cash granted with it. */
  readonly cash: Cents;
  readonly oneTime: boolean;
}

const product = (
  id: ProductId,
  priceEur: Cents,
  gems: number,
  cash: Cents,
  oneTime: boolean,
): Product => Object.freeze({ id, priceEur, gems, cash, oneTime });

export const PRODUCTS: Readonly<Record<ProductId, Product>> = Object.freeze({
  starter_pack: product("starter_pack", 2_99, 300, 25_000_00, true),
  gems_small: product("gems_small", 99, 100, 0, false),
  gems_medium: product("gems_medium", 4_99, 550, 0, false),
  gems_large: product("gems_large", 9_99, 1_200, 0, false),
  gems_huge: product("gems_huge", 19_99, 2_600, 0, false),
} satisfies Record<ProductId, Product>);

/** Display order. */
export const PRODUCT_IDS: readonly ProductId[] = Object.freeze([
  "starter_pack",
  "gems_small",
  "gems_medium",
  "gems_large",
  "gems_huge",
] as const);

export type BoosterId = "revenue_x2" | "revenue_x2_3d" | "demand_plus" | "cash_bundle";

export interface Booster {
  readonly id: BoosterId;
  readonly gems: number;
  /** Game days of revenue ×2. */
  readonly revenueDays: number;
  /** Game days of extra demand. */
  readonly demandDays: number;
  /** Cash granted at once. */
  readonly cash: Cents;
}

const booster = (
  id: BoosterId,
  gems: number,
  revenueDays: number,
  demandDays: number,
  cash: Cents,
): Booster => Object.freeze({ id, gems, revenueDays, demandDays, cash });

export const BOOSTERS: Readonly<Record<BoosterId, Booster>> = Object.freeze({
  revenue_x2: booster("revenue_x2", 60, 1, 0, 0),
  revenue_x2_3d: booster("revenue_x2_3d", 150, 3, 0, 0),
  demand_plus: booster("demand_plus", 40, 0, 1, 0),
  cash_bundle: booster("cash_bundle", 80, 0, 0, 10_000_00),
} satisfies Record<BoosterId, Booster>);

export const BOOSTER_IDS: readonly BoosterId[] = Object.freeze([
  "revenue_x2",
  "revenue_x2_3d",
  "demand_plus",
  "cash_bundle",
] as const);

/** Demand points (percent of the fleet) while `demand_plus` runs. */
export const BOOST_DEMAND_PCT = 50;
/** Order ids remembered to make grants idempotent. */
export const MAX_CLAIMED_ORDERS = 200;

export interface Boosts {
  /** Revenue ×2 while `day < revenueUntilDay`. */
  readonly revenueUntilDay: number;
  /** Extra demand while `day < demandUntilDay`. */
  readonly demandUntilDay: number;
}

export const NO_BOOSTS: Boosts = Object.freeze({ revenueUntilDay: 0, demandUntilDay: 0 });

export interface ShopState {
  readonly gems: number;
  readonly boosts: Boosts;
  /** One-time products already bought. */
  readonly owned: readonly ProductId[];
  /** Last order ids granted (idempotency). */
  readonly claimedOrders: readonly string[];
}

export const INITIAL_SHOP: ShopState = Object.freeze({
  gems: 0,
  boosts: NO_BOOSTS,
  owned: Object.freeze([]),
  claimedOrders: Object.freeze([]),
});

/** What a payment provider hands back once paid. "test" receipts come from the demo checkout. */
export interface Receipt {
  readonly orderId: string;
  readonly productId: string;
  readonly mode: "test" | "live";
}

/** Exact bytes a receipt signature covers (server signs, web verifies). */
export function receiptMessage(receipt: Receipt): string {
  return `rental-tycoon-receipt|v1|${receipt.orderId}|${receipt.productId}|${receipt.mode}`;
}

export function isProductIdValue(id: unknown): id is ProductId {
  return typeof id === "string" && Object.hasOwn(PRODUCTS, id);
}

export function revenueMultiplier(state: GameState): number {
  return state.day < state.shop.boosts.revenueUntilDay ? 2 : 1;
}

export function boostDemandPct(state: GameState): number {
  return state.day < state.shop.boosts.demandUntilDay ? BOOST_DEMAND_PCT : 0;
}

function isProductId(id: unknown): id is ProductId {
  return typeof id === "string" && Object.hasOwn(PRODUCTS, id);
}

/** Credits a paid product. Idempotent per order id. Pure. */
export function grantPurchase(state: GameState, receipt: Receipt): GameState {
  const orderId: unknown = receipt?.orderId;
  if (typeof orderId !== "string" || orderId.length === 0 || orderId.length > 128) {
    throw new InvalidReceiptError("orderId");
  }
  if (!isProductId(receipt.productId)) throw new InvalidReceiptError("productId");
  const shop = state.shop;
  if (shop.claimedOrders.includes(orderId)) return state; // already granted
  const p = PRODUCTS[receipt.productId];
  if (p.oneTime && shop.owned.includes(p.id)) throw new ProductAlreadyOwnedError(p.id);
  const gems = shop.gems + p.gems;
  const cash = state.cash + p.cash;
  if (!Number.isSafeInteger(gems) || !Number.isSafeInteger(cash)) {
    throw new SimOverflowError("cash");
  }
  return {
    ...state,
    cash,
    shop: {
      ...shop,
      gems,
      owned: p.oneTime ? [...shop.owned, p.id] : shop.owned,
      claimedOrders: [...shop.claimedOrders, orderId].slice(-MAX_CLAIMED_ORDERS),
    },
  };
}

/** Spends diamonds on a booster. Pure. */
export function activateBooster(state: GameState, id: BoosterId): GameState {
  if (typeof id !== "string" || !Object.hasOwn(BOOSTERS, id)) {
    throw new InvalidReceiptError("booster");
  }
  const b = BOOSTERS[id];
  const shop = state.shop;
  if (shop.gems < b.gems) throw new BoosterUnaffordableError(b.gems, shop.gems);
  const extend = (until: number, days: number): number =>
    days > 0 ? Math.max(state.day, until) + days : until;
  const cash = state.cash + b.cash;
  if (!Number.isSafeInteger(cash)) throw new SimOverflowError("cash");
  return {
    ...state,
    cash,
    shop: {
      ...shop,
      gems: shop.gems - b.gems,
      boosts: {
        revenueUntilDay: extend(shop.boosts.revenueUntilDay, b.revenueDays),
        demandUntilDay: extend(shop.boosts.demandUntilDay, b.demandDays),
      },
    },
  };
}
