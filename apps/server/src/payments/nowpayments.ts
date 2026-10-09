import { hmacSha512Hex, safeEqual } from "./crypto.js";

/**
 * NOWPayments, the example crypto payment provider (shop.md). Swap this file for another
 * provider: the handler only needs `createInvoice` and `verifyIpn`.
 * Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 */

export const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";
export const NOWPAYMENTS_SANDBOX_API = "https://api-sandbox.nowpayments.io/v1";

export interface InvoiceRequest {
  readonly orderId: string;
  /** Euro cents. */
  readonly priceEur: number;
  readonly description: string;
  readonly ipnUrl: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

/** Creates a hosted invoice; the player picks the coin (BTC, ETH, USDC…) on NOWPayments' page. */
export async function createInvoice(
  fetchFn: typeof fetch,
  apiBase: string,
  apiKey: string,
  req: InvoiceRequest,
): Promise<string> {
  const res = await fetchFn(`${apiBase}/invoice`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      price_amount: req.priceEur / 100,
      price_currency: "eur",
      order_id: req.orderId,
      order_description: req.description,
      ipn_callback_url: req.ipnUrl,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    }),
  });
  if (!res.ok) throw new Error(`invoice failed (${String(res.status)})`);
  const data: unknown = await res.json();
  const url = (data as { invoice_url?: unknown } | null)?.invoice_url;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("no invoice url");
  return url;
}

/** JSON with keys sorted recursively: what NOWPayments signs. */
export function sortedJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) out[k] = sort((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export interface IpnPayment {
  readonly orderId: string;
  readonly status: string;
}

/**
 * Verifies an IPN callback (header `x-nowpayments-sig` = HMAC-SHA512 of the sorted JSON with the
 * IPN secret). Returns null for anything forged or malformed.
 */
export async function verifyIpn(
  rawBody: string,
  signature: string | null,
  ipnSecret: string,
): Promise<IpnPayment | null> {
  if (!signature || !ipnSecret) return null;
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const expected = await hmacSha512Hex(ipnSecret, sortedJson(body));
  if (!safeEqual(expected, signature.toLowerCase())) return null;
  const b = body as { order_id?: unknown; payment_status?: unknown };
  if (typeof b.order_id !== "string" || typeof b.payment_status !== "string") return null;
  return { orderId: b.order_id, status: b.payment_status };
}
