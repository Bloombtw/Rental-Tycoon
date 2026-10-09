import { isProductIdValue, receiptMessage, type ProductId, type Receipt } from "@rt/sim";

/**
 * Payment providers (shop.md). Without VITE_PAYMENTS_URL the game is in **test mode**: the demo
 * crypto checkout simulates the payment, no money moves. With it, purchases go through the
 * serverless endpoint (NOWPayments, example crypto provider) and receipts must carry a valid
 * Ed25519 signature from VITE_RECEIPT_PUBLIC_KEY.
 */

export type PaymentMode = "test" | "live";

export interface PaymentsConfig {
  readonly mode: PaymentMode;
  readonly url: string | null;
  /** Ed25519 public key, raw 32 bytes in base64url. */
  readonly publicKey: string | null;
}

export function paymentsConfig(env: Record<string, unknown> = import.meta.env): PaymentsConfig {
  const url = typeof env["VITE_PAYMENTS_URL"] === "string" ? env["VITE_PAYMENTS_URL"] : "";
  const key =
    typeof env["VITE_RECEIPT_PUBLIC_KEY"] === "string" ? env["VITE_RECEIPT_PUBLIC_KEY"] : "";
  return url.startsWith("https://") && key.length > 0
    ? { mode: "live", url: url.replace(/\/$/, ""), publicKey: key }
    : { mode: "test", url: null, publicKey: null };
}

/** A receipt from the demo checkout (test mode only). */
export function testReceipt(productId: ProductId, id: string): Receipt {
  return { orderId: `test-${id}`, productId, mode: "test" };
}

/** Key of the order being paid in another tab/page (live mode), to resume after the redirect. */
export const PENDING_ORDER_KEY = "rental-tycoon/pending-order";

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Checks a live receipt's signature. Never throws. */
export async function verifyReceipt(
  receipt: unknown,
  signature: unknown,
  publicKey: string,
): Promise<Receipt | null> {
  try {
    const r = receipt as Partial<Receipt> | null;
    if (
      !r ||
      typeof r.orderId !== "string" ||
      !isProductIdValue(r.productId) ||
      r.mode !== "live" ||
      typeof signature !== "string"
    ) {
      return null;
    }
    const keyBytes = fromBase64Url(publicKey);
    const sigBytes = fromBase64Url(signature);
    if (!keyBytes || !sigBytes) return null;
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, [
      "verify",
    ]);
    const clean: Receipt = { orderId: r.orderId, productId: r.productId, mode: "live" };
    const ok = await crypto.subtle.verify(
      "Ed25519",
      key,
      sigBytes,
      new TextEncoder().encode(receiptMessage(clean)),
    );
    return ok ? clean : null;
  } catch {
    return null;
  }
}

/** Live mode: asks the endpoint for an invoice. Returns the hosted crypto payment page. */
export async function startLiveCheckout(
  config: PaymentsConfig,
  productId: ProductId,
  fetchFn: typeof fetch = fetch,
): Promise<{ orderId: string; invoiceUrl: string }> {
  if (config.mode !== "live" || !config.url) throw new Error("payments not configured");
  const res = await fetchFn(`${config.url}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  if (!res.ok) throw new Error("checkout failed");
  const data = (await res.json()) as { orderId?: unknown; invoiceUrl?: unknown };
  if (typeof data.orderId !== "string" || typeof data.invoiceUrl !== "string") {
    throw new Error("checkout failed");
  }
  if (!data.invoiceUrl.startsWith("https://")) throw new Error("checkout failed");
  return { orderId: data.orderId, invoiceUrl: data.invoiceUrl };
}

/** Live mode: the signed receipt of a paid order, or null while unpaid / invalid. */
export async function fetchLiveReceipt(
  config: PaymentsConfig,
  orderId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Receipt | null> {
  if (config.mode !== "live" || !config.url || !config.publicKey) return null;
  try {
    const res = await fetchFn(`${config.url}/receipt/${encodeURIComponent(orderId)}`);
    if (res.status !== 200) return null;
    const data = (await res.json()) as { receipt?: unknown; signature?: unknown };
    return await verifyReceipt(data.receipt, data.signature, config.publicKey);
  } catch {
    return null;
  }
}
