import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/config/db/db";
import {
  BUNDLE_DAYS,
  FREE_MONTHLY_SECONDS,
  GRACE_SECONDS,
  IDLE_SECONDS,
  LISTENER_PASS_DAYS,
  LISTENER_TRIAL_SECONDS,
  PARSE_HOURS,
  bundleById,
  bundleGrants,
  tierRank,
  type Tier,
} from "@/config/pricing";
import { creditGrants, listenerPasses, listenerTrials } from "@/models/schema";

export type Grant = { id: string; userId: string; reference: string; tier: Tier; secondsTotal: number; secondsUsed: number; expiresAt: Date };
const left = (g: Grant) => Math.max(0, g.secondsTotal - g.secondsUsed);

/** Where time, passes and trials are kept. The database in production; tests use an in-memory one. */
export interface BillingStore {
  activeGrants(userId: string, now: Date): Promise<Grant[]>;
  /** Adds a grant. Returns false when this payment already created it, so a payment is only ever granted once. */
  addGrant(g: Omit<Grant, "id" | "secondsUsed">): Promise<boolean>;
  /** Takes up to `seconds` from one grant and returns how much was really taken. */
  spend(grantId: string, seconds: number): Promise<number>;
  addPass(userId: string, reference: string, expiresAt: Date): Promise<boolean>;
  passUntil(userId: string, now: Date): Promise<Date | null>;
  trialUsed(userId: string): Promise<number>;
  addTrial(userId: string, seconds: number): Promise<number>;
}

export const dbBilling: BillingStore = {
  async activeGrants(userId, now) {
    const rows = await db
      .select()
      .from(creditGrants)
      .where(and(eq(creditGrants.userId, userId), gt(creditGrants.expiresAt, now)));
    return rows.map((r) => ({ ...r, tier: r.tier as Tier }));
  },
  async addGrant(g) {
    const r = await db.insert(creditGrants).values(g).onConflictDoNothing().returning({ id: creditGrants.id });
    return r.length > 0;
  },
  async spend(grantId, seconds) {
    // One statement that locks the row, so two sessions spending at once cannot take the same seconds twice.
    const rows = (await db.execute(sql`
      with old as (select id, seconds_used as before from credit_grants where id = ${grantId} for update)
      update credit_grants g
         set seconds_used = least(g.seconds_total, g.seconds_used + ${seconds})
        from old
       where g.id = old.id
   returning g.seconds_used - old.before as taken`)) as unknown as { taken: number | string }[];
    return Number(rows[0]?.taken ?? 0);
  },
  async addPass(userId, reference, expiresAt) {
    const r = await db.insert(listenerPasses).values({ userId, reference, expiresAt }).onConflictDoNothing().returning({ id: listenerPasses.id });
    return r.length > 0;
  },
  async passUntil(userId, now) {
    const rows = await db.select().from(listenerPasses).where(and(eq(listenerPasses.userId, userId), gt(listenerPasses.expiresAt, now)));
    return rows.reduce<Date | null>((best, r) => (!best || r.expiresAt > best ? r.expiresAt : best), null);
  },
  async trialUsed(userId) {
    const [r] = await db.select().from(listenerTrials).where(eq(listenerTrials.userId, userId));
    return r?.secondsUsed ?? 0;
  },
  async addTrial(userId, seconds) {
    const [r] = await db
      .insert(listenerTrials)
      .values({ userId, secondsUsed: seconds })
      .onConflictDoUpdate({ target: listenerTrials.userId, set: { secondsUsed: sql`${listenerTrials.secondsUsed} + ${seconds}`, updatedAt: new Date() } })
      .returning();
    return r!.secondsUsed;
  },
};

const days = (from: Date, n: number) => new Date(from.getTime() + n * 86_400_000);
const monthKey = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const endOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

// ---- what a payment grants ----------------------------------------------------------------------------

/** Turns a paid payment into time or a pass. Safe to run twice: a payment can only grant once. */
export async function grantForPayment(
  payment: { reference: string; userId: string | null; planId: string; paidAt?: Date | null },
  store: BillingStore = dbBilling,
): Promise<boolean> {
  if (!payment.userId) return false;
  const paid = payment.paidAt ?? new Date();
  const hours = PARSE_HOURS.exec(payment.planId);
  if (hours) {
    return store.addGrant({
      userId: payment.userId, reference: payment.reference, tier: hours[1] as Tier,
      secondsTotal: Number(hours[2]) * 3600, expiresAt: days(paid, BUNDLE_DAYS),
    });
  }
  const bundle = bundleById(payment.planId);
  if (bundle) {
    let any = false;
    for (const g of bundleGrants(bundle)) {
      any = (await store.addGrant({
        userId: payment.userId, reference: payment.reference, tier: g.tier,
        secondsTotal: g.hours * 3600, expiresAt: days(paid, BUNDLE_DAYS),
      })) || any;
    }
    return any;
  }
  if (payment.planId === "listener-pass") return store.addPass(payment.userId, payment.reference, days(paid, LISTENER_PASS_DAYS));
  return false;
}

// ---- balance ------------------------------------------------------------------------------------------

/** Every speaker gets some free captions time each month. Created the first time it is needed. */
async function ensureFree(userId: string, now: Date, store: BillingStore) {
  await store.addGrant({
    userId, reference: `FREE-${monthKey(now)}`, tier: "captions", secondsTotal: FREE_MONTHLY_SECONDS, expiresAt: endOfMonth(now),
  });
}

/** Seconds a host can still use at `tier` (a higher level also covers a lower one). */
export async function secondsAvailable(userId: string, tier: Tier, now = new Date(), store: BillingStore = dbBilling): Promise<number> {
  await ensureFree(userId, now, store);
  return (await store.activeGrants(userId, now)).filter((g) => tierRank(g.tier) >= tierRank(tier)).reduce((n, g) => n + left(g), 0);
}

export type Balance = Record<Tier, { seconds: number; nextExpiry: string | null }> & { nothingBoughtYet: boolean };

/** What to show the host: time left at each level, and when the oldest unused time disappears. */
export async function balanceFor(userId: string, now = new Date(), store: BillingStore = dbBilling): Promise<Balance> {
  await ensureFree(userId, now, store);
  const grants = (await store.activeGrants(userId, now)).filter((g) => left(g) > 0);
  const out = {} as Balance;
  for (const t of ["captions", "standard", "local"] as Tier[]) {
    const cover = grants.filter((g) => tierRank(g.tier) >= tierRank(t));
    const soonest = cover.reduce<Date | null>((b, g) => (!b || g.expiresAt < b ? g.expiresAt : b), null);
    out[t] = { seconds: cover.reduce((n, g) => n + left(g), 0), nextExpiry: soonest ? soonest.toISOString() : null };
  }
  out.nothingBoughtYet = grants.every((g) => g.reference.startsWith("FREE-"));
  return out;
}

/**
 * Takes `seconds` from a host's time at `tier`: exact-level time first, then higher levels, soonest to expire
 * first so nothing goes to waste. Returns how many seconds could be taken.
 */
export async function consume(userId: string, tier: Tier, seconds: number, now = new Date(), store: BillingStore = dbBilling): Promise<number> {
  if (seconds <= 0) return 0;
  const grants = (await store.activeGrants(userId, now))
    .filter((g) => tierRank(g.tier) >= tierRank(tier) && left(g) > 0)
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.expiresAt.getTime() - b.expiresAt.getTime());
  let need = seconds;
  for (const g of grants) {
    if (need <= 0) break;
    need -= await store.spend(g.id, Math.min(need, left(g)));
  }
  return seconds - need;
}

// ---- the session clock --------------------------------------------------------------------------------

export type Clock = {
  status: string;
  tier: string;
  voiceLanguages: number;
  capSeconds: number | null;
  meteredSeconds: number;
  pausedSeconds: number;
  graceSeconds: number;
  lastMeterAt: Date | null;
  fallbackUntil: Date | null;
  stoppedReason: string | null;
};

export type Tick = { elapsed: number; charge: number; paused: boolean };

/**
 * How much of the time since the last look counts. Idle gaps are never charged. Time while the local voice is
 * on its backup is never charged either (`paused`): that is our side failing, not the host's.
 */
export function tick(c: Clock, now: Date, localUp: boolean): Tick {
  if (c.status !== "live" || c.stoppedReason || !c.lastMeterAt) return { elapsed: 0, charge: 0, paused: false };
  const elapsed = Math.max(0, Math.min(Math.floor((now.getTime() - c.lastMeterAt.getTime()) / 1000), IDLE_SECONDS));
  const paused = c.tier === "local" && ((c.fallbackUntil && c.fallbackUntil > now) || !localUp) ? true : false;
  const lanes = c.tier === "standard" || c.tier === "local" ? Math.max(1, c.voiceLanguages) : 1;
  return { elapsed, charge: paused ? 0 : elapsed * lanes, paused };
}

export type ClockStore = {
  /** Takes the right to count the time since `prev`. Only ONE caller wins, so simultaneous requests never charge twice. */
  claim(prev: Date | null, next: Date): Promise<boolean>;
  save(patch: Partial<Clock>): Promise<void>;
};

/**
 * Counts the time since the last look against the host's balance and updates the session. Call it whenever the
 * session is active (host caption, listener fetch); it does nothing if called again within a few seconds.
 * Returns the state the session is in afterwards.
 */
export async function meter(
  host: string,
  c: Clock,
  out: ClockStore,
  opts: { now?: Date; localUp?: boolean; billing?: BillingStore } = {},
): Promise<{ clock: Clock; secondsLeft: number | null; stopped: string | null }> {
  const now = opts.now ?? new Date();
  const billing = opts.billing ?? dbBilling;
  const patch: Partial<Clock> = {};
  const apply = () => Object.assign(c, patch);

  if (c.status !== "live" || c.tier === "free") return { clock: c, secondsLeft: null, stopped: c.stoppedReason };
  if (!c.lastMeterAt) {
    if (await out.claim(null, now)) c.lastMeterAt = now;
    return { clock: c, secondsLeft: await secondsAvailable(host, c.tier as Tier, now, billing), stopped: c.stoppedReason };
  }
  if (now.getTime() - c.lastMeterAt.getTime() < 5_000) return { clock: c, secondsLeft: null, stopped: c.stoppedReason };
  if (!(await out.claim(c.lastMeterAt, now))) return { clock: c, secondsLeft: null, stopped: c.stoppedReason };

  // A host who topped up after running out gets the session back.
  if (c.stoppedReason === "out_of_time" && (await secondsAvailable(host, c.tier as Tier, now, billing)) > 0) {
    patch.stoppedReason = null;
    patch.graceSeconds = 0;
    Object.assign(c, patch);
  }

  const t = tick(c, now, opts.localUp ?? true);
  patch.meteredSeconds = c.meteredSeconds + t.elapsed;
  if (t.paused) patch.pausedSeconds = c.pausedSeconds + t.elapsed;
  if (t.charge > 0) {
    const taken = await consume(host, c.tier as Tier, t.charge, now, billing);
    const short = t.charge - taken;
    if (short > 0) {
      patch.graceSeconds = c.graceSeconds + short;
      if (patch.graceSeconds >= GRACE_SECONDS) patch.stoppedReason = "out_of_time";
    }
  }
  if (!patch.stoppedReason && !c.stoppedReason && c.capSeconds && patch.meteredSeconds >= c.capSeconds) patch.stoppedReason = "cap_reached";
  c.lastMeterAt = now;
  apply();
  await out.save(patch);
  const secondsLeft = await secondsAvailable(host, c.tier as Tier, now, billing);
  return { clock: c, secondsLeft, stopped: c.stoppedReason };
}

/** True when this session may use paid features (cloud translation and spoken audio) right now. */
export const paidFeaturesOn = (c: Pick<Clock, "tier" | "stoppedReason" | "status">) =>
  c.status === "live" && !c.stoppedReason && c.tier !== "free";

// ---- who may hear the local voice --------------------------------------------------------------------

export type ListenerAccess = { pass: boolean; passUntil: string | null; trialSecondsLeft: number; signedIn: boolean };

export async function listenerAccess(userId: string | null | undefined, now = new Date(), store: BillingStore = dbBilling): Promise<ListenerAccess> {
  if (!userId) return { pass: false, passUntil: null, trialSecondsLeft: 0, signedIn: false };
  const until = await store.passUntil(userId, now);
  const used = await store.trialUsed(userId);
  return { pass: Boolean(until), passUntil: until ? until.toISOString() : null, trialSecondsLeft: Math.max(0, LISTENER_TRIAL_SECONDS - used), signedIn: true };
}

/** Seconds of speech a piece of text takes to say: about 2.5 words a second. */
export const audioSeconds = (text: string) => Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 2.5));

export type VoiceDecision =
  | { allowed: false; reason: "no_session" | "session_ended" | "no_voice_plan" | "out_of_time" }
  | { allowed: true; native: boolean; reason: "paid" | "trial" | "needs_pass" | "standard_session" | "not_native_language" };

/**
 * What kind of voice a listener may have: decided from what the HOST paid for and what the LISTENER holds.
 * The local voice needs both. Without both, the listener still gets the standard voice.
 */
export function decideVoice(
  session: Pick<Clock, "tier" | "stoppedReason" | "status"> | null,
  nativeLanguage: boolean,
  listener: ListenerAccess,
): VoiceDecision {
  if (!session) return { allowed: false, reason: "no_session" };
  if (session.status !== "live") return { allowed: false, reason: "session_ended" };
  if (session.stoppedReason) return { allowed: false, reason: "out_of_time" };
  if (session.tier !== "standard" && session.tier !== "local") return { allowed: false, reason: "no_voice_plan" };
  if (!nativeLanguage) return { allowed: true, native: false, reason: "not_native_language" };
  if (session.tier === "standard") return { allowed: true, native: false, reason: "standard_session" };
  if (listener.pass) return { allowed: true, native: true, reason: "paid" };
  if (listener.trialSecondsLeft > 0) return { allowed: true, native: true, reason: "trial" };
  return { allowed: true, native: false, reason: "needs_pass" };
}

/** Billing is switched on with BILLING_ENFORCED=1, after the apps send their session code. Until then nothing is blocked. */
export const billingEnforced = () => process.env.BILLING_ENFORCED === "1";

/**
 * Solo use (someone translating for themselves, with no live session): their own time is charged for the words
 * they have processed. Returns the level that covered it, or null when they have no time left at that level.
 * `from` is the lowest level that is acceptable; higher levels are tried first when `best` is set.
 */
export async function soloCharge(
  userId: string,
  seconds: number,
  levels: Tier[],
  now = new Date(),
  store: BillingStore = dbBilling,
): Promise<Tier | null> {
  await secondsAvailable(userId, "captions", now, store); // makes sure the free monthly time exists
  for (const tier of levels) {
    const have = await secondsAvailable(userId, tier, now, store);
    if (have >= seconds && (await consume(userId, tier, seconds, now, store)) >= seconds) return tier;
  }
  return null;
}
