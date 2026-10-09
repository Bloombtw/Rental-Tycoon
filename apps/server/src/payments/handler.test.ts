import { describe, expect, it } from "vitest";
import { receiptMessage, type Receipt } from "@rt/sim";
import { fromBase64Url, hmacSha512Hex, toBase64Url } from "./crypto.js";
import { createPaymentsHandler, memoryOrderStore, type PaymentsEnv } from "./handler.js";
import { sortedJson } from "./nowpayments.js";

const ORDER = "00000000-0000-4000-8000-000000000001";
const IPN_SECRET = "test-ipn-secret";

async function setup() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as unknown as { privateKey: CryptoKey; publicKey: CryptoKey };
  const pkcs8 = toBase64Url(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const env: PaymentsEnv = {
    NOWPAYMENTS_API_URL: "https://api-sandbox.nowpayments.io/v1",
    NOWPAYMENTS_API_KEY: "key",
    NOWPAYMENTS_IPN_SECRET: IPN_SECRET,
    RECEIPT_SIGNING_KEY: pkcs8,
    PUBLIC_URL: "https://pay.example.com",
    GAME_ORIGIN: "https://game.example.com",
    GAME_URL: "https://game.example.com/Rental-Tycoon/",
  };
  const calls: { url: string; body: unknown }[] = [];
  const fakeFetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return Promise.resolve(
      new Response(JSON.stringify({ invoice_url: "https://nowpayments.io/payment/?iid=1" })),
    );
  }) as unknown as typeof fetch;
  const store = memoryOrderStore();
  const handler = createPaymentsHandler({ env, store, fetch: fakeFetch, newOrderId: () => ORDER });
  return { handler, store, calls, publicKey: pair.publicKey };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://pay.example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function ipn(status: string, secret = IPN_SECRET) {
  const body = { payment_status: status, order_id: ORDER, price_amount: 4.99 };
  const sig = await hmacSha512Hex(secret, sortedJson(body));
  return post("/ipn", body, { "x-nowpayments-sig": sig });
}

describe("payments handler (shop.md)", () => {
  it("checkout creates a pending order and a EUR invoice", async () => {
    const { handler, store, calls } = await setup();
    const res = await handler(post("/checkout", { productId: "gems_medium" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      orderId: ORDER,
      invoiceUrl: "https://nowpayments.io/payment/?iid=1",
    });
    expect(store.data.get(ORDER)).toEqual({ productId: "gems_medium", status: "pending" });
    expect(calls[0]?.body).toMatchObject({
      price_amount: 4.99,
      price_currency: "eur",
      order_id: ORDER,
    });
  });

  it("rejects unknown products and junk bodies", async () => {
    const { handler } = await setup();
    expect((await handler(post("/checkout", { productId: "gems_infinite" }))).status).toBe(400);
    expect((await handler(post("/checkout", "{nope"))).status).toBe(400);
  });

  it("a forged IPN is refused; a signed 'finished' IPN pays the order", async () => {
    const { handler, store } = await setup();
    await handler(post("/checkout", { productId: "gems_medium" }));
    expect((await handler(await ipn("finished", "wrong-secret"))).status).toBe(401);
    expect(store.data.get(ORDER)?.status).toBe("pending");
    expect((await handler(await ipn("waiting"))).status).toBe(200);
    expect(store.data.get(ORDER)?.status).toBe("pending");
    expect((await handler(await ipn("finished"))).status).toBe(200);
    expect(store.data.get(ORDER)?.status).toBe("paid");
  });

  it("the receipt is only given once paid, and its signature verifies", async () => {
    const { handler, publicKey } = await setup();
    await handler(post("/checkout", { productId: "starter_pack" }));
    const receiptUrl = `https://pay.example.com/receipt/${ORDER}`;
    expect((await handler(new Request(receiptUrl))).status).toBe(202);
    await handler(await ipn("finished"));
    const res = await handler(new Request(receiptUrl));
    expect(res.status).toBe(200);
    const { receipt, signature } = (await res.json()) as { receipt: Receipt; signature: string };
    expect(receipt).toEqual({ orderId: ORDER, productId: "starter_pack", mode: "live" });
    const sig = fromBase64Url(signature);
    expect(sig).not.toBeNull();
    const ok = await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      sig ?? new Uint8Array(),
      new TextEncoder().encode(receiptMessage(receipt)),
    );
    expect(ok).toBe(true);
  });

  it("bad receipt ids and unknown routes", async () => {
    const { handler } = await setup();
    expect((await handler(new Request("https://pay.example.com/receipt/../x"))).status).toBe(404);
    expect((await handler(new Request("https://pay.example.com/receipt/abc"))).status).toBe(400);
    expect((await handler(new Request("https://pay.example.com/nope"))).status).toBe(404);
  });
});
