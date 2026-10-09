import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyCar, createGame, receiptMessage, type Receipt } from "@rt/sim";
import { App } from "./App.js";
import { memoryStorage } from "./game/fakeStorage.js";
import { paymentsConfig, verifyReceipt } from "./game/payments.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function b64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("payments config and receipts (shop.md)", () => {
  it("test mode unless an https endpoint and a key are configured", () => {
    expect(paymentsConfig({}).mode).toBe("test");
    expect(
      paymentsConfig({ VITE_PAYMENTS_URL: "http://x", VITE_RECEIPT_PUBLIC_KEY: "k" }).mode,
    ).toBe("test");
    expect(
      paymentsConfig({ VITE_PAYMENTS_URL: "https://pay.example/", VITE_RECEIPT_PUBLIC_KEY: "k" }),
    ).toEqual({ mode: "live", url: "https://pay.example", publicKey: "k" });
  });

  it("accepts a correctly signed live receipt and rejects anything else", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as unknown as { privateKey: CryptoKey; publicKey: CryptoKey };
    const pub = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const receipt: Receipt = { orderId: "o-1", productId: "gems_large", mode: "live" };
    const sig = b64url(
      await crypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(receiptMessage(receipt)),
      ),
    );
    expect(await verifyReceipt(receipt, sig, pub)).toEqual(receipt);
    expect(await verifyReceipt({ ...receipt, productId: "gems_huge" }, sig, pub)).toBeNull();
    expect(await verifyReceipt({ ...receipt, mode: "test" }, sig, pub)).toBeNull();
    expect(await verifyReceipt(receipt, "AAAA", pub)).toBeNull();
    expect(await verifyReceipt(null, sig, pub)).toBeNull();
  });
});

describe("shop UI in test mode", () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });
  const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = (id: string) => {
    act(() => {
      q(id)?.click();
    });
  };

  it("buys diamonds through the demo checkout, then a booster", () => {
    act(() => {
      root.render(
        <App
          dailyReward={false}
          initialGame={buyCar(createGame(1), "used")}
          storage={memoryStorage()}
          newSeed={() => 1}
        />,
      );
    });
    click("shop-open");
    expect(q("shop-test-banner")).not.toBeNull();
    click("shop-buy-gems_small");
    expect(q("demo-checkout")).not.toBeNull();
    click("checkout-pay");
    expect(q("demo-checkout")).toBeNull();
    expect(q("shop-gems")?.textContent).toContain("100 diamants");
    expect(q("notice")?.textContent).toContain("+100 diamants");
    click("shop-boost-revenue_x2");
    expect(q("shop-gems")?.textContent).toContain("40 diamants");
    expect(q("shop-active")?.textContent).toContain("Recettes ×2");
  });

  it("cancelling the checkout credits nothing; the starter pack is one-time", () => {
    act(() => {
      root.render(
        <App
          dailyReward={false}
          initialGame={buyCar(createGame(1), "used")}
          storage={memoryStorage()}
          newSeed={() => 1}
        />,
      );
    });
    click("shop-open");
    click("shop-buy-gems_small");
    click("checkout-cancel");
    expect(q("shop-gems")?.textContent).toContain("0 diamant");
    click("shop-buy-starter_pack");
    click("checkout-pay");
    expect(q("shop-gems")?.textContent).toContain("300 diamants");
    expect(q("shop-buy-starter_pack")).toBeNull();
  });
});
