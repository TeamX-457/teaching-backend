import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/config/db/db";
import { sellable, type Plan } from "@/config/pricing";
import { payments } from "@/models/schema";
import { APP_CODE, isOurs, makeReference, paystackMetadata } from "@/services/paystack.naming";
import {
  PaystackError,
  initializeTransaction,
  metadataOf,
  paystackLive,
  toKobo,
  verifyTransaction,
  type PaystackTransaction,
} from "@/services/paystack.service";

export type PaymentRow = typeof payments.$inferSelect;

/** Where payments are kept. The database in production; tests use an in-memory one. */
export interface PaymentStore {
  insert(row: typeof payments.$inferInsert): Promise<PaymentRow>;
  byReference(reference: string): Promise<PaymentRow | undefined>;
  /** Marks a payment paid. Returns the row only the FIRST time, so a payment is fulfilled exactly once. */
  markSuccess(reference: string, fields: { channel?: string | null; feesKobo?: number | null; paidAt?: Date | null; gatewayResponse?: string | null }): Promise<PaymentRow | undefined>;
  markStatus(reference: string, status: "failed" | "reversed" | "mismatch", gatewayResponse?: string | null): Promise<void>;
  forUser(userId: string): Promise<PaymentRow[]>;
}

export const dbStore: PaymentStore = {
  async insert(row) {
    const [r] = await db.insert(payments).values(row).returning();
    return r!;
  },
  async byReference(reference) {
    const [r] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
    return r;
  },
  async markSuccess(reference, f) {
    const [r] = await db
      .update(payments)
      .set({ status: "success", channel: f.channel ?? null, feesKobo: f.feesKobo ?? null, paidAt: f.paidAt ?? new Date(), gatewayResponse: f.gatewayResponse ?? null })
      .where(and(eq(payments.reference, reference), ne(payments.status, "success"), ne(payments.status, "reversed")))
      .returning();
    return r;
  },
  async markStatus(reference, status, gatewayResponse) {
    await db.update(payments).set({ status, gatewayResponse: gatewayResponse ?? null }).where(eq(payments.reference, reference));
  },
  forUser(userId) {
    return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).limit(50);
  },
};

export class PaymentError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) {
    super(message);
  }
}

/** What happens after a successful payment, by plan id. Add an entry to grant something. Runs once per payment. */
export const fulfilments: Record<string, (payment: PaymentRow) => Promise<void>> = {};

export async function createCheckout(
  input: { user: { id: string; email: string }; planId: string; callbackUrl: string },
  deps: { store?: PaymentStore; plans?: Plan[] } = {},
) {
  const store = deps.store ?? dbStore;
  const plan = sellable(deps.plans).find((p) => p.id === input.planId);
  if (!plan) throw new PaymentError("That plan is not available.", "PLAN_UNAVAILABLE", 404);

  const reference = makeReference(plan.purpose); // VOICEVERSE-<PURPOSE>-<date>-<id>
  const amountKobo = toKobo(plan.amountNaira!);

  // Record it BEFORE sending the customer to pay, so a webhook can never arrive for a payment we do not know.
  await store.insert({
    reference, userId: input.user.id, email: input.user.email, planId: plan.id, purpose: plan.purpose,
    amountKobo, currency: "NGN", status: "pending", livemode: paystackLive(),
  });

  try {
    const init = await initializeTransaction({
      email: input.user.email,
      amountKobo,
      reference,
      callbackUrl: input.callbackUrl,
      metadata: paystackMetadata(plan.purpose, plan.description, { plan: plan.id, user_id: input.user.id }),
    });
    return { reference, authorizationUrl: init.authorization_url };
  } catch (e) {
    await store.markStatus(reference, "failed", e instanceof Error ? e.message : "initialize failed");
    throw e instanceof PaystackError ? new PaymentError("Payments are unavailable right now. Try again.", "GATEWAY_UNAVAILABLE", 502) : e;
  }
}

/**
 * Asks Paystack what really happened to a payment and records it. Safe to call any number of times, from the
 * return page and from the webhook: the amount and currency must match what we asked for, and a paid payment is
 * fulfilled exactly once. Returns the stored payment, or null when the reference is not one of ours.
 */
export async function settle(
  reference: string,
  deps: { store?: PaymentStore; verify?: (ref: string) => Promise<PaystackTransaction> } = {},
): Promise<PaymentRow | null> {
  if (!isOurs(reference)) return null;
  const store = deps.store ?? dbStore;
  const row = await store.byReference(reference);
  if (!row) return null;
  if (row.status === "success" || row.status === "reversed") return row;

  const tx = await (deps.verify ?? verifyTransaction)(reference);
  const meta = metadataOf(tx);
  if (meta.app && meta.app !== APP_CODE) return null; // another product's payment

  if (tx.status === "success") {
    // Never trust a payment that does not match what we asked for.
    if (tx.amount !== row.amountKobo || tx.currency !== row.currency) {
      await store.markStatus(reference, "mismatch", `expected ${row.amountKobo} ${row.currency}, got ${tx.amount} ${tx.currency}`);
      return (await store.byReference(reference)) ?? row;
    }
    const first = await store.markSuccess(reference, {
      channel: tx.channel ?? null,
      feesKobo: tx.fees ?? null,
      paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(),
      gatewayResponse: tx.gateway_response ?? null,
    });
    if (first) await fulfilments[first.planId]?.(first);
    return first ?? (await store.byReference(reference)) ?? row;
  }
  if (tx.status === "failed" || tx.status === "reversed") {
    await store.markStatus(reference, tx.status === "failed" ? "failed" : "reversed", tx.gateway_response ?? null);
    return (await store.byReference(reference)) ?? row;
  }
  return row; // still pending or abandoned: leave it
}

/** A Paystack webhook event. Events for other products on the shared account are ignored. */
export async function handleWebhookEvent(
  event: { event?: string; data?: { reference?: string; transaction_reference?: string } },
  deps: { store?: PaymentStore; verify?: (ref: string) => Promise<PaystackTransaction> } = {},
): Promise<{ handled: boolean; reason?: string }> {
  const store = deps.store ?? dbStore;
  const reference = event.data?.reference ?? event.data?.transaction_reference;
  if (!isOurs(reference)) return { handled: false, reason: "not ours" };

  if (event.event === "charge.success") {
    const row = await settle(reference!, deps);
    return row ? { handled: true } : { handled: false, reason: "unknown payment" };
  }
  if (event.event === "refund.processed") {
    const row = await store.byReference(reference!);
    if (!row) return { handled: false, reason: "unknown payment" };
    await store.markStatus(reference!, "reversed", "refunded");
    return { handled: true };
  }
  return { handled: false, reason: "event not used" };
}

/** What the app may see of a payment. */
export const publicPayment = (p: PaymentRow) => ({
  reference: p.reference, plan: p.planId, amount: p.amountKobo / 100, currency: p.currency, status: p.status, paidAt: p.paidAt,
  createdAt: p.createdAt,
});
