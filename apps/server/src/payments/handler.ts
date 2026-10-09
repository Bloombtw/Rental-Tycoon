import { z } from "zod";
import { PRODUCTS, receiptMessage, type ProductId, type Receipt } from "@rt/sim";
import { importSigningKey, signEd25519 } from "./crypto.js";
import { createInvoice, verifyIpn } from "./nowpayments.js";

/**
 * Serverless payments endpoint (shop.md). Web APIs only (Request/Response/crypto/fetch), so the
 * same handler runs in a Cloudflare Worker (`worker.ts`) or behind Node. Nothing here is deployed.
 *
 *   POST /checkout { productId }  -> { orderId, invoiceUrl }
 *   POST /ipn                     <- NOWPayments webhook (signed)
 *   GET  /receipt/:orderId        -> { receipt, signature } once paid
 */

export interface OrderRecord {
  readonly productId: ProductId;
  readonly status: "pending" | "paid";
}

/** Key-value storage (Cloudflare KV in production, a Map in tests). */
export interface OrderStore {
  get(orderId: string): Promise<OrderRecord | null>;
  put(orderId: string, record: OrderRecord): Promise<void>;
}

export interface PaymentsEnv {
  readonly NOWPAYMENTS_API_URL: string;
  readonly NOWPAYMENTS_API_KEY: string;
  readonly NOWPAYMENTS_IPN_SECRET: string;
  /** Ed25519 private key, PKCS#8, base64url. */
  readonly RECEIPT_SIGNING_KEY: string;
  /** Public URL of this endpoint (for the IPN callback). */
  readonly PUBLIC_URL: string;
  /** The game's origin (CORS and return URLs), e.g. https://bloombtw.github.io */
  readonly GAME_ORIGIN: string;
  /** The game's page, e.g. https://bloombtw.github.io/Rental-Tycoon/ */
  readonly GAME_URL: string;
}

const checkoutBody = z.object({
  productId: z.string().refine((id) => Object.hasOwn(PRODUCTS, id), "unknown product"),
});

const ORDER_ID = /^[0-9a-f-]{36}$/;

/** Statuses that mean the crypto payment is complete. */
const PAID = new Set(["finished"]);

export function createPaymentsHandler(deps: {
  readonly env: PaymentsEnv;
  readonly store: OrderStore;
  readonly fetch: typeof fetch;
  readonly newOrderId?: () => string;
}): (req: Request) => Promise<Response> {
  const { env, store } = deps;
  const cors = {
    "access-control-allow-origin": env.GAME_ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...cors },
    });
  let signingKey: Promise<CryptoKey> | null = null;

  return async (req) => {
    const url = new URL(req.url);
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      if (req.method === "POST" && url.pathname === "/checkout") {
        const parsed = checkoutBody.safeParse(await req.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "bad_request" });
        const productId = parsed.data.productId as ProductId;
        const orderId = deps.newOrderId?.() ?? crypto.randomUUID();
        await store.put(orderId, { productId, status: "pending" });
        const back = `${env.GAME_URL}?order=${orderId}`;
        const invoiceUrl = await createInvoice(
          deps.fetch,
          env.NOWPAYMENTS_API_URL,
          env.NOWPAYMENTS_API_KEY,
          {
            orderId,
            priceEur: PRODUCTS[productId].priceEur,
            description: `Rental Tycoon — ${productId}`,
            ipnUrl: `${env.PUBLIC_URL}/ipn`,
            successUrl: back,
            cancelUrl: env.GAME_URL,
          },
        );
        return json(200, { orderId, invoiceUrl });
      }

      if (req.method === "POST" && url.pathname === "/ipn") {
        const raw = await req.text();
        const ipn = await verifyIpn(
          raw,
          req.headers.get("x-nowpayments-sig"),
          env.NOWPAYMENTS_IPN_SECRET,
        );
        if (!ipn) return json(401, { error: "bad_signature" });
        const order = await store.get(ipn.orderId);
        if (!order) return json(404, { error: "unknown_order" });
        if (PAID.has(ipn.status) && order.status !== "paid") {
          await store.put(ipn.orderId, { ...order, status: "paid" });
        }
        return json(200, { ok: true });
      }

      const match = /^\/receipt\/([^/]+)$/.exec(url.pathname);
      if (req.method === "GET" && match) {
        const orderId = match[1] ?? "";
        if (!ORDER_ID.test(orderId)) return json(400, { error: "bad_request" });
        const order = await store.get(orderId);
        if (!order) return json(404, { error: "unknown_order" });
        if (order.status !== "paid") return json(202, { status: order.status });
        const receipt: Receipt = { orderId, productId: order.productId, mode: "live" };
        signingKey ??= importSigningKey(env.RECEIPT_SIGNING_KEY);
        const signature = await signEd25519(await signingKey, receiptMessage(receipt));
        return json(200, { receipt, signature });
      }

      return json(404, { error: "not_found" });
    } catch {
      return json(500, { error: "internal" });
    }
  };
}

/** In-memory store for tests and local runs. */
export function memoryOrderStore(): OrderStore & { readonly data: Map<string, OrderRecord> } {
  const data = new Map<string, OrderRecord>();
  return {
    data,
    get: (id) => Promise.resolve(data.get(id) ?? null),
    put: (id, record) => {
      data.set(id, record);
      return Promise.resolve();
    },
  };
}
