import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack client: start a payment, check one, verify a webhook, and list transactions for the report.
 *
 * The key is read from PAYSTACK_SECRET_KEY (or PAYSTACK_API, which some of the other products use). It is a
 * live key when it starts with sk_live_. It is never logged or returned to clients.
 * Amounts are in kobo (1 naira = 100 kobo), as Paystack uses.
 */

const BASE = (process.env.PAYSTACK_BASE_URL || "https://api.paystack.co").replace(/\/$/, "");

export class PaystackError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

/**
 * PAYSTACK_SECRET_KEY, or PAYSTACK_API (the name some other products use) only when PAYSTACK_SECRET_KEY is not
 * set at all. A variable that is set but empty means "no key": it must never fall through to another one, or a
 * test that clears the key could end up using the live one.
 */
export const paystackKey = () => {
  const raw = process.env.PAYSTACK_SECRET_KEY !== undefined ? process.env.PAYSTACK_SECRET_KEY : process.env.PAYSTACK_API ?? "";
  return raw.trim().replace(/^["']|["']$/g, "");
};
export const paystackConfigured = () => /^sk_(live|test)_/.test(paystackKey());
/** False for a test-mode key, so test payments are never counted as real income. */
export const paystackLive = () => paystackKey().startsWith("sk_live_");

export const toKobo = (naira: number) => Math.round(naira * 100);
export const fromKobo = (kobo: number) => kobo / 100;

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!paystackConfigured()) throw new PaystackError("Payments are not set up on this server.", 501);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${paystackKey()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PaystackError("Could not reach Paystack. Try again.", 502);
  }
  const data = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !data?.status) {
    throw new PaystackError(data?.message || `Paystack answered ${res.status}`, res.status || 502);
  }
  return data.data as T;
}

export type InitializeResult = { authorization_url: string; access_code: string; reference: string };

export function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  currency?: string;
}): Promise<InitializeResult> {
  return call("POST", "/transaction/initialize", {
    email: input.email,
    amount: input.amountKobo,
    currency: input.currency ?? "NGN",
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata,
  });
}

export type PaystackTransaction = {
  id?: number;
  reference: string;
  status: string; // success | failed | abandoned | reversed | ...
  amount: number; // kobo
  currency: string;
  channel?: string | null;
  fees?: number | null;
  gateway_response?: string | null;
  paid_at?: string | null;
  created_at?: string;
  domain?: string; // "live" or "test"
  metadata?: Record<string, unknown> | string | null;
  customer?: { email?: string } | null;
};

export const verifyTransaction = (reference: string) =>
  call<PaystackTransaction>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);

/** One page of the account's transactions (all products), newest first. */
export async function listTransactions(opts: { page: number; perPage?: number; from?: string; to?: string; status?: string }) {
  const q = new URLSearchParams({ page: String(opts.page), perPage: String(opts.perPage ?? 100) });
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  if (opts.status) q.set("status", opts.status);
  if (!paystackConfigured()) throw new PaystackError("No Paystack key.", 501);
  const res = await fetch(`${BASE}/transaction?${q}`, {
    headers: { Authorization: `Bearer ${paystackKey()}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as {
    status?: boolean; message?: string; data?: PaystackTransaction[]; meta?: { pageCount?: number; total?: number };
  } | null;
  if (!res.ok || !body?.status) throw new PaystackError(body?.message || `Paystack answered ${res.status}`, res.status);
  return { transactions: body.data ?? [], pageCount: body.meta?.pageCount ?? 1, total: body.meta?.total ?? 0 };
}

/**
 * Paystack signs the exact bytes it sends with HMAC-SHA512 and the secret key, in `x-paystack-signature`.
 * `rawBody` must be those exact bytes (not re-serialised JSON).
 */
export function verifyWebhookSignature(rawBody: string | Buffer, header: string | string[] | undefined): boolean {
  const signature = Array.isArray(header) ? header[0] : header;
  const key = paystackKey();
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** metadata can arrive as an object or as a JSON string. */
export function metadataOf(t: { metadata?: Record<string, unknown> | string | null }): Record<string, unknown> {
  if (!t.metadata) return {};
  if (typeof t.metadata === "string") {
    try { return JSON.parse(t.metadata) as Record<string, unknown>; } catch { return {}; }
  }
  return t.metadata;
}

// ───────────── Interface used by src/routes/support.route.ts (and its tests) ─────────────
//
// An object, so tests can spy on its methods. The naming helpers are re-exported from one place.
export { isOurs, makeReference, paystackMetadata } from "@/services/paystack.naming";

export const paystackService = {
  configured: () => paystackConfigured(),
  initialize: (input: Parameters<typeof initializeTransaction>[0]) => initializeTransaction(input),
  verify: (reference: string) => verifyTransaction(reference),
  signatureOk: (raw: string | Buffer, header: string | string[] | undefined) => verifyWebhookSignature(raw, header),
};
