import { PRODUCTS, productOf } from "@/services/paystack.naming";
import { metadataOf, type PaystackTransaction } from "@/services/paystack.service";

/**
 * Profit and loss starts here: what each product on the shared Paystack account took in, what Paystack kept,
 * and what was left. Costs outside Paystack (AI, hosting) are subtracted by the person doing the accounts.
 * See scripts/paystack-report.ts.
 */

export const UNTAGGED = "UNTAGGED";

export type Bucket = {
  code: string;
  name: string;
  /** successful payments */
  count: number;
  grossKobo: number;
  feesKobo: number;
  netKobo: number;
  /** money refunded (status "reversed") */
  refundedKobo: number;
  /** failed or abandoned attempts, for visibility only: no money moved */
  notPaid: number;
};

/**
 * Which product a transaction belongs to: metadata.app first (it is on every transaction), then the reference
 * prefix. Anything else is UNTAGGED, so nothing is silently dropped from the books.
 */
export function appOf(t: Pick<PaystackTransaction, "reference" | "metadata">): string {
  const fromMeta = String(metadataOf(t).app ?? "").toUpperCase();
  if (fromMeta in PRODUCTS) return fromMeta;
  return productOf(t.reference) ?? UNTAGGED;
}

export function summarise(transactions: PaystackTransaction[]): Bucket[] {
  const buckets = new Map<string, Bucket>();
  const get = (code: string) => {
    let b = buckets.get(code);
    if (!b) {
      b = { code, name: PRODUCTS[code] ?? "Untagged (no product code)", count: 0, grossKobo: 0, feesKobo: 0, netKobo: 0, refundedKobo: 0, notPaid: 0 };
      buckets.set(code, b);
    }
    return b;
  };
  for (const t of transactions) {
    const b = get(appOf(t));
    if (t.status === "success") {
      b.count++;
      b.grossKobo += t.amount;
      b.feesKobo += t.fees ?? 0;
      b.netKobo += t.amount - (t.fees ?? 0);
    } else if (t.status === "reversed") {
      b.refundedKobo += t.amount;
    } else {
      b.notPaid++;
    }
  }
  return [...buckets.values()].sort((a, b) => b.grossKobo - a.grossKobo || a.code.localeCompare(b.code));
}

export const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
