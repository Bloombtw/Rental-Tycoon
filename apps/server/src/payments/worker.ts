import { createPaymentsHandler, type OrderRecord, type PaymentsEnv } from "./handler.js";

/**
 * Cloudflare Worker entry (not deployed yet; see docs/specs/shop.md). Bind a KV namespace
 * `ORDERS` and the secrets of `PaymentsEnv` with wrangler, then `wrangler deploy` this file.
 */

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

type WorkerEnv = PaymentsEnv & { readonly ORDERS: KvNamespace };

export default {
  fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const handler = createPaymentsHandler({
      env,
      fetch: (input, init) => fetch(input, init),
      store: {
        get: async (id) => {
          const raw = await env.ORDERS.get(id);
          return raw === null ? null : (JSON.parse(raw) as OrderRecord);
        },
        put: (id, record) => env.ORDERS.put(id, JSON.stringify(record)),
      },
    });
    return handler(req);
  },
};
