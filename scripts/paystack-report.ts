/**
 * Money on the shared Paystack account, split by product. Read-only: it only lists transactions.
 *
 *   bun scripts/paystack-report.ts                          every product, all time
 *   bun scripts/paystack-report.ts --from 2026-10-01 --to 2026-10-31
 *   bun scripts/paystack-report.ts --only VOICEVERSE        one product
 *   bun scripts/paystack-report.ts --csv october.csv        also write one row per transaction
 *
 * A transaction belongs to the product in its metadata.app, or else the start of its reference
 * (VOICEVERSE-API-20261023-4F9A2C7B1E0D). Anything with neither is listed as UNTAGGED so it cannot be missed.
 * Only successful payments are income. Paystack's fee is shown so you can see income after fees; hosting,
 * AI and other costs are yours to subtract. The key is read from PAYSTACK_SECRET_KEY or PAYSTACK_API
 * (environment or .env) and is never printed.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PRODUCTS } from "../src/services/paystack.naming";
import { appOf, naira, summarise } from "../src/services/paystack.report";
import { listTransactions, paystackConfigured, paystackLive, type PaystackTransaction } from "../src/services/paystack.service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (!paystackConfigured()) {
  console.error("No Paystack key found (PAYSTACK_SECRET_KEY or PAYSTACK_API in .env).");
  process.exit(1);
}

const from = arg("from");
const to = arg("to");
const only = arg("only")?.toUpperCase();
const csv = arg("csv");
if (only && !(only in PRODUCTS)) {
  console.error(`Unknown product "${only}". Choose one of: ${Object.keys(PRODUCTS).join(", ")}`);
  process.exit(1);
}

const all: PaystackTransaction[] = [];
for (let page = 1; page <= 500; page++) {
  const r = await listTransactions({ page, perPage: 100, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  all.push(...r.transactions);
  if (page >= r.pageCount || r.transactions.length === 0) break;
}

const live = all.filter((t) => (t.domain ?? (paystackLive() ? "live" : "test")) === "live");
const buckets = summarise(live).filter((b) => !only || b.code === only);

console.log(`\nPaystack (${paystackLive() ? "LIVE" : "TEST"} key)  ${from ?? "start"} to ${to ?? "now"}  (${live.length} transactions read)\n`);
const pad = (s: string, n: number) => s.padEnd(n);
const num = (s: string, n: number) => s.padStart(n);
console.log(`${pad("PRODUCT", 22)}${num("PAID", 6)}${num("GROSS", 16)}${num("PAYSTACK FEES", 16)}${num("AFTER FEES", 16)}${num("REFUNDED", 14)}${num("NOT PAID", 9)}`);
for (const b of buckets) {
  console.log(`${pad(b.name, 22)}${num(String(b.count), 6)}${num(naira(b.grossKobo), 16)}${num(naira(b.feesKobo), 16)}${num(naira(b.netKobo), 16)}${num(naira(b.refundedKobo), 14)}${num(String(b.notPaid), 9)}`);
}
if (!buckets.length) console.log("(no transactions in this period)");
const total = buckets.reduce((a, b) => ({ c: a.c + b.count, g: a.g + b.grossKobo, f: a.f + b.feesKobo, n: a.n + b.netKobo, r: a.r + b.refundedKobo }), { c: 0, g: 0, f: 0, n: 0, r: 0 });
if (buckets.length > 1) {
  console.log(`${pad("TOTAL", 22)}${num(String(total.c), 6)}${num(naira(total.g), 16)}${num(naira(total.f), 16)}${num(naira(total.n), 16)}${num(naira(total.r), 14)}`);
}
const untagged = buckets.find((b) => b.code === "UNTAGGED");
if (untagged && untagged.count + untagged.notPaid > 0) {
  console.log(`\n! ${untagged.count + untagged.notPaid} transactions have no product code. Something is creating payments without a VOICEVERSE-/CHOROPIA-/... reference.`);
}

if (csv) {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = live
    .filter((t) => !only || appOf(t) === only)
    .map((t) => [appOf(t), t.reference, t.status, t.amount / 100, (t.fees ?? 0) / 100, (t.amount - (t.fees ?? 0)) / 100, t.currency, t.channel ?? "", t.paid_at ?? "", t.customer?.email ?? ""].map(q).join(","));
  writeFileSync(csv, ["product,reference,status,amount,fees,after_fees,currency,channel,paid_at,customer_email", ...rows].join("\n") + "\n");
  console.log(`\nWrote ${rows.length} rows to ${csv}`);
}
