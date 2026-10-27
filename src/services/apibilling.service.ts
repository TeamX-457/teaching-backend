import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/config/db/db";
import { API_CREDIT_PARSE, API_RATES, apiPriceKobo, type ApiKind, type ApiVoiceClass } from "@/config/pricing";
import { apiAccounts, apiCreditTopups, apiKeys, apiUsage } from "@/models/schema";

/** Charging developers is switched on with API_BILLING_ENFORCED=1. Until then use is recorded, and nothing is deducted or blocked by credit. */
export const apiBillingEnforced = () => process.env.API_BILLING_ENFORCED === "1";

export type Refusal = { status: number; code: string; message: string };

const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Credit left, in kobo. */
export async function creditOf(userId: string): Promise<number> {
  const [r] = await db.select().from(apiAccounts).where(eq(apiAccounts.userId, userId));
  return r?.creditKobo ?? 0;
}

/** What has been billed to one key since the start of the month, in kobo. */
export async function spentThisMonth(keyId: string, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${apiUsage.amountKobo}), 0)` })
    .from(apiUsage)
    .where(and(eq(apiUsage.keyId, keyId), gte(apiUsage.createdAt, monthStart(now))));
  return Number(r?.total ?? 0);
}

/**
 * Called before a billable request. Returns why it must be refused, or null to go ahead.
 * A key's own monthly limit always applies; running out of credit only stops requests once charging is switched on.
 */
export async function precheck(key: { id: string; userId: string; capKobo?: number | null }): Promise<Refusal | null> {
  if (key.capKobo != null && (await spentThisMonth(key.id)) >= key.capKobo) {
    return { status: 402, code: "key_spend_cap", message: "This key reached its monthly spending limit. Raise or remove the limit on the developers page." };
  }
  if (apiBillingEnforced() && (await creditOf(key.userId)) <= 0) {
    return { status: 402, code: "insufficient_credit", message: "No API credit left. Add credit on the developers page." };
  }
  return null;
}

/**
 * Records a finished call and, once charging is on, deducts it from credit. Never throws: a failure to record
 * must not break a request that already succeeded.
 */
export async function recordUsage(input: { userId: string; keyId: string; kind: ApiKind; voiceClass: ApiVoiceClass; units: number }): Promise<number> {
  const amountKobo = apiPriceKobo(input.kind, input.voiceClass, input.units);
  const write = (async () => {
    await db.insert(apiUsage).values({ ...input, units: Math.ceil(input.units), amountKobo });
    if (apiBillingEnforced() && amountKobo > 0) {
      await db
        .insert(apiAccounts)
        .values({ userId: input.userId, creditKobo: -amountKobo })
        .onConflictDoUpdate({ target: apiAccounts.userId, set: { creditKobo: sql`${apiAccounts.creditKobo} - ${amountKobo}`, updatedAt: new Date() } });
    }
  })().catch(() => { /* recording is best effort */ });
  // The write carries on in the background if the database is slow: it never holds up the answer for long.
  await Promise.race([write, new Promise<void>((resolve) => setTimeout(resolve, 1_500))]);
  return amountKobo;
}

/** Adds purchased credit. Returns false when this payment already added it, so a payment tops up exactly once. */
export async function topUp(reference: string, userId: string, amountKobo: number): Promise<boolean> {
  const first = await db.insert(apiCreditTopups).values({ reference, userId, amountKobo }).onConflictDoNothing().returning({ id: apiCreditTopups.id });
  if (!first.length) return false;
  await db
    .insert(apiAccounts)
    .values({ userId, creditKobo: amountKobo })
    .onConflictDoUpdate({ target: apiAccounts.userId, set: { creditKobo: sql`${apiAccounts.creditKobo} + ${amountKobo}`, updatedAt: new Date() } });
  return true;
}

/** The kobo a paid `api-credit-<naira>` plan adds, or 0 when the plan is not a credit pack. */
export function creditPackKobo(planId: string): number {
  const m = API_CREDIT_PARSE.exec(planId);
  return m ? Number(m[1]) * 100 : 0;
}

export async function setKeyCap(userId: string, keyId: string, capKobo: number | null): Promise<boolean> {
  const rows = await db
    .update(apiKeys)
    .set({ monthlyCapKobo: capKobo })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

export type UsageSummary = {
  days: number;
  billing: "on" | "preview";
  creditKobo: number;
  rates: typeof API_RATES;
  totals: { calls: number; words: number; audioSeconds: number; amountKobo: number };
  byKey: { keyId: string | null; name: string; prefix: string; capKobo: number | null; calls: number; amountKobo: number; monthKobo: number }[];
  byKind: { kind: string; voiceClass: string; calls: number; units: number; amountKobo: number }[];
  daily: { day: string; calls: number; amountKobo: number }[];
};

/** Everything the developer usage page shows, for the last `days` days. Only billed prices: never our costs. */
export async function usageSummary(userId: string, days = 30, now = new Date()): Promise<UsageSummary> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const where = and(eq(apiUsage.userId, userId), gte(apiUsage.createdAt, since));

  const byKind = await db
    .select({
      kind: apiUsage.kind,
      voiceClass: apiUsage.voiceClass,
      calls: sql<number>`count(*)`,
      units: sql<number>`coalesce(sum(${apiUsage.units}), 0)`,
      amountKobo: sql<number>`coalesce(sum(${apiUsage.amountKobo}), 0)`,
    })
    .from(apiUsage)
    .where(where)
    .groupBy(apiUsage.kind, apiUsage.voiceClass);

  const perKey = await db
    .select({
      keyId: apiUsage.keyId,
      calls: sql<number>`count(*)`,
      amountKobo: sql<number>`coalesce(sum(${apiUsage.amountKobo}), 0)`,
    })
    .from(apiUsage)
    .where(where)
    .groupBy(apiUsage.keyId);

  const monthly = await db
    .select({ keyId: apiUsage.keyId, amountKobo: sql<number>`coalesce(sum(${apiUsage.amountKobo}), 0)` })
    .from(apiUsage)
    .where(and(eq(apiUsage.userId, userId), gte(apiUsage.createdAt, monthStart(now))))
    .groupBy(apiUsage.keyId);

  const keys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, cap: apiKeys.monthlyCapKobo, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));

  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${apiUsage.createdAt}), 'YYYY-MM-DD')`,
      calls: sql<number>`count(*)`,
      amountKobo: sql<number>`coalesce(sum(${apiUsage.amountKobo}), 0)`,
    })
    .from(apiUsage)
    .where(where)
    .groupBy(sql`date_trunc('day', ${apiUsage.createdAt})`)
    .orderBy(sql`date_trunc('day', ${apiUsage.createdAt})`);

  const num = (v: unknown) => Number(v ?? 0);
  const rows = byKind.map((r) => ({ ...r, calls: num(r.calls), units: num(r.units), amountKobo: num(r.amountKobo) }));
  const totals = {
    calls: rows.reduce((n, r) => n + r.calls, 0),
    words: rows.filter((r) => r.kind === "translation").reduce((n, r) => n + r.units, 0),
    audioSeconds: rows.filter((r) => r.kind !== "translation").reduce((n, r) => n + r.units, 0),
    amountKobo: rows.reduce((n, r) => n + r.amountKobo, 0),
  };
  const monthOf = new Map(monthly.map((m) => [m.keyId, num(m.amountKobo)]));
  const byKey = perKey
    .map((r) => {
      const k = keys.find((x) => x.id === r.keyId);
      return {
        keyId: r.keyId,
        name: k ? (k.revokedAt ? `${k.name} (revoked)` : k.name) : "Deleted key",
        prefix: k?.prefix ?? "",
        capKobo: k?.cap ?? null,
        calls: num(r.calls),
        amountKobo: num(r.amountKobo),
        monthKobo: monthOf.get(r.keyId) ?? 0,
      };
    })
    .sort((a, b) => b.amountKobo - a.amountKobo);
  // Keys with no use yet still show up, so their limit can be set before the first call.
  for (const k of keys) {
    if (!k.revokedAt && !byKey.some((b) => b.keyId === k.id)) {
      byKey.push({ keyId: k.id, name: k.name, prefix: k.prefix, capKobo: k.cap ?? null, calls: 0, amountKobo: 0, monthKobo: 0 });
    }
  }

  return {
    days,
    billing: apiBillingEnforced() ? "on" : "preview",
    creditKobo: await creditOf(userId),
    rates: API_RATES,
    totals,
    byKey,
    byKind: rows,
    daily: daily.map((d) => ({ day: d.day, calls: num(d.calls), amountKobo: num(d.amountKobo) })),
  };
}
