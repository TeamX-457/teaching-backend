import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  BULK_HOURS,
  BUNDLES,
  GRACE_SECONDS,
  HOURLY_NAIRA,
  LISTENER_TRIAL_SECONDS,
  bundleGrants,
  hoursPrice,
  resolvePlan,
  sellable,
} from "@/config/pricing";
import {
  audioSeconds,
  balanceFor,
  consume,
  decideVoice,
  grantForPayment,
  listenerAccess,
  meter,
  paidFeaturesOn,
  secondsAvailable,
  tick,
  type BillingStore,
  type Clock,
  type ClockStore,
  type Grant,
} from "@/services/billing.service";
import { buildApp } from "@/app";
import { createCheckout, settle, type PaymentRow, type PaymentStore } from "@/services/payments.service";
import type { PaystackTransaction } from "@/services/paystack.service";

/** In-memory ledger: these tests never touch the real database. */
function memoryBilling(): BillingStore & { grants: Grant[]; passes: { userId: string; reference: string; expiresAt: Date }[]; trial: Map<string, number> } {
  const grants: Grant[] = [];
  const passes: { userId: string; reference: string; expiresAt: Date }[] = [];
  const trial = new Map<string, number>();
  return {
    grants, passes, trial,
    async activeGrants(userId, now) { return grants.filter((g) => g.userId === userId && g.expiresAt > now); },
    async addGrant(g) {
      if (grants.some((x) => x.reference === g.reference && x.tier === g.tier)) return false;
      grants.push({ ...g, id: crypto.randomUUID(), secondsUsed: 0 });
      return true;
    },
    async spend(id, seconds) {
      const g = grants.find((x) => x.id === id)!;
      const take = Math.min(seconds, g.secondsTotal - g.secondsUsed);
      g.secondsUsed += take;
      return take;
    },
    async addPass(userId, reference, expiresAt) {
      if (passes.some((p) => p.reference === reference)) return false;
      passes.push({ userId, reference, expiresAt });
      return true;
    },
    async passUntil(userId, now) {
      const live = passes.filter((p) => p.userId === userId && p.expiresAt > now);
      return live.length ? live.reduce((a, b) => (a.expiresAt > b.expiresAt ? a : b)).expiresAt : null;
    },
    async trialUsed(userId) { return trial.get(userId) ?? 0; },
    async addTrial(userId, seconds) { const n = (trial.get(userId) ?? 0) + seconds; trial.set(userId, n); return n; },
  };
}

const T0 = new Date("2026-10-24T10:00:00Z");
const at = (secs: number) => new Date(T0.getTime() + secs * 1000);
const HOUR = 3600;

function clock(over: Partial<Clock> = {}): Clock {
  return { status: "live", tier: "local", voiceLanguages: 1, capSeconds: null, meteredSeconds: 0, pausedSeconds: 0, graceSeconds: 0, lastMeterAt: null, fallbackUntil: null, stoppedReason: null, ...over };
}
function clockStore(c: Clock): ClockStore & { claims: number } {
  let last = c.lastMeterAt; // what the database holds; the in-memory clock is updated by meter() itself
  const s = {
    claims: 0,
    async claim(prev: Date | null, next: Date) {
      if ((prev?.getTime() ?? null) !== (last?.getTime() ?? null)) return false; // someone else got there first
      s.claims++;
      last = next;
      return true;
    },
    async save(patch: Partial<Clock>) { Object.assign(c, patch); },
  };
  return s;
}

describe("prices", () => {
  it("charges per hour, with a discount from ten hours", () => {
    expect(hoursPrice("local", 1)).toBe(HOURLY_NAIRA.local);
    expect(hoursPrice("captions", 5)).toBe(5 * HOURLY_NAIRA.captions);
    expect(hoursPrice("local", BULK_HOURS)).toBe(HOURLY_NAIRA.local * BULK_HOURS * 0.9);
    expect(hoursPrice("local", 3)).toBeGreaterThan(hoursPrice("standard", 3));
    expect(hoursPrice("standard", 3)).toBeGreaterThan(hoursPrice("captions", 3));
  });

  it("standard voice costs about 65% of the local voice, so local is the easy choice", () => {
    expect(HOURLY_NAIRA.standard / HOURLY_NAIRA.local).toBeCloseTo(0.65, 1);
    for (const e of ["sermon", "service", "conference", "classroom"] as const) {
      const price = (t: "standard" | "local") => BUNDLES.find((b) => b.id === `${e}-${t}`)!.amountNaira;
      expect(price("standard") / price("local")).toBeGreaterThan(0.6);
      expect(price("standard") / price("local")).toBeLessThan(0.7);
    }
  });

  it("only sells whole-hour amounts the server can price, never an amount from the app", () => {
    expect(resolvePlan("hours-local-5")?.amountNaira).toBe(hoursPrice("local", 5));
    expect(resolvePlan("hours-local-0")).toBeUndefined();
    expect(resolvePlan("hours-local-99")).toBeUndefined();
    expect(resolvePlan("hours-gold-2")).toBeUndefined();
    expect(resolvePlan("hours-local--3")).toBeUndefined();
    expect(resolvePlan("hours-local-5; DROP")).toBeUndefined();
    expect(resolvePlan("nonsense")).toBeUndefined();
    expect(resolvePlan("api-starter")?.enabled).toBe(false);
  });

  it("lists every plan and the listener pass as for sale, and keeps the developer API off", () => {
    const ids = sellable().map((p) => p.id);
    expect(ids).toContain("listener-pass");
    expect(ids).toContain("conference-standard");
    expect(ids).not.toContain("api-starter");
    expect(BUNDLES.length).toBe(12);
  });

  it("splits a classroom voice plan into 4 hours of voice and the rest captions", () => {
    const b = BUNDLES.find((x) => x.id === "classroom-local")!;
    expect(bundleGrants(b)).toEqual([{ tier: "local", hours: 4 }, { tier: "captions", hours: 4 }]);
    expect(bundleGrants(BUNDLES.find((x) => x.id === "sermon-local")!)).toEqual([{ tier: "local", hours: 8 }]);
  });
});

describe("what a payment grants", () => {
  it("turns paid hours into time that lasts 30 days", async () => {
    const store = memoryBilling();
    const ok = await grantForPayment({ reference: "VOICEVERSE-HOURS-1", userId: "u1", planId: "hours-local-6", paidAt: T0 }, store);
    expect(ok).toBe(true);
    expect(store.grants[0]).toMatchObject({ tier: "local", secondsTotal: 6 * HOUR });
    expect(store.grants[0]!.expiresAt.getTime()).toBe(T0.getTime() + 30 * 86_400_000);
  });

  it("grants only once for the same payment, even if the webhook and the return page both fire", async () => {
    const store = memoryBilling();
    const p = { reference: "VOICEVERSE-PLAN-1", userId: "u1", planId: "classroom-local", paidAt: T0 };
    expect(await grantForPayment(p, store)).toBe(true);
    expect(await grantForPayment(p, store)).toBe(false);
    expect(store.grants.length).toBe(2);
    expect(store.grants.reduce((n, g) => n + g.secondsTotal, 0)).toBe(8 * HOUR);
  });

  it("gives a listener pass for 30 days", async () => {
    const store = memoryBilling();
    expect(await grantForPayment({ reference: "VOICEVERSE-LISTENER-1", userId: "u2", planId: "listener-pass", paidAt: T0 }, store)).toBe(true);
    expect((await listenerAccess("u2", at(86_400), store)).pass).toBe(true);
    expect((await listenerAccess("u2", new Date(T0.getTime() + 31 * 86_400_000), store)).pass).toBe(false);
  });

  it("grants nothing for a payment with no user or an unknown plan", async () => {
    const store = memoryBilling();
    expect(await grantForPayment({ reference: "r", userId: null, planId: "hours-local-1" }, store)).toBe(false);
    expect(await grantForPayment({ reference: "r2", userId: "u", planId: "api-starter" }, store)).toBe(false);
    expect(store.grants.length).toBe(0);
  });
});

describe("balance", () => {
  it("gives every speaker a little free captions time each month, once", async () => {
    const store = memoryBilling();
    expect(await secondsAvailable("u1", "captions", T0, store)).toBe(30 * 60);
    expect(await secondsAvailable("u1", "captions", T0, store)).toBe(30 * 60);
    expect(await secondsAvailable("u1", "local", T0, store)).toBe(0);
    const next = new Date("2026-11-02T10:00:00Z");
    expect(await secondsAvailable("u1", "captions", next, store)).toBe(30 * 60); // a new month, a new allowance
  });

  it("gives EVERY speaker their free time, not just the first one to ask", async () => {
    const store = memoryBilling();
    for (const id of ["u1", "u2", "u3", "u4"]) expect(await secondsAvailable(id, "captions", T0, store)).toBe(30 * 60);
    // the ledger holds one row per speaker per month, each with its own reference
    const refs = store.grants.map((g) => g.reference);
    expect(new Set(refs).size).toBe(4);
    for (const r of refs) expect(r).toMatch(/^FREE-202610-u[1-4]$/);
  });

  it("lets higher levels cover lower ones, but not the other way round", async () => {
    const store = memoryBilling();
    await grantForPayment({ reference: "A", userId: "u1", planId: "hours-local-2", paidAt: T0 }, store);
    await grantForPayment({ reference: "B", userId: "u1", planId: "hours-captions-3", paidAt: T0 }, store);
    expect(await secondsAvailable("u1", "local", T0, store)).toBe(2 * HOUR);
    expect(await secondsAvailable("u1", "captions", T0, store)).toBe(5 * HOUR + 30 * 60);
    const bal = await balanceFor("u1", T0, store);
    expect(bal.local.seconds).toBe(2 * HOUR);
    expect(bal.nothingBoughtYet).toBe(false);
  });

  it("spends exact-level time first, soonest-to-expire next, and never goes below zero", async () => {
    const store = memoryBilling();
    await grantForPayment({ reference: "A", userId: "u1", planId: "hours-captions-1", paidAt: T0 }, store);
    await grantForPayment({ reference: "B", userId: "u1", planId: "hours-local-1", paidAt: T0 }, store);
    const took = await consume("u1", "captions", HOUR / 2, T0, store);
    expect(took).toBe(HOUR / 2);
    const local = store.grants.find((g) => g.tier === "local")!;
    expect(local.secondsUsed).toBe(0); // the cheaper captions time went first
    expect(await consume("u1", "local", 5 * HOUR, T0, store)).toBe(HOUR); // only 1 local hour existed
  });

  it("loses time at expiry: nothing unused survives 30 days", async () => {
    const store = memoryBilling();
    await grantForPayment({ reference: "A", userId: "u1", planId: "hours-local-6", paidAt: T0 }, store);
    await consume("u1", "local", 2 * HOUR, T0, store);
    expect(await secondsAvailable("u1", "local", at(10 * 86_400), store)).toBe(4 * HOUR);
    expect(await secondsAvailable("u1", "local", new Date(T0.getTime() + 31 * 86_400_000), store)).toBe(0);
  });
});

describe("the session clock", () => {
  it("counts time while live and never counts idle gaps", () => {
    const c = clock({ lastMeterAt: T0 });
    expect(tick(c, at(30), true)).toEqual({ elapsed: 30, charge: 30, paused: false });
    expect(tick(c, at(3600), true).elapsed).toBe(60); // nobody was there for an hour: only a minute counts
  });

  it("charges extra voice languages at the same speed, but not captions", () => {
    expect(tick(clock({ lastMeterAt: T0, voiceLanguages: 3 }), at(10), true).charge).toBe(30);
    expect(tick(clock({ lastMeterAt: T0, tier: "standard", voiceLanguages: 2 }), at(10), true).charge).toBe(20);
    expect(tick(clock({ lastMeterAt: T0, tier: "captions", voiceLanguages: 3 }), at(10), true).charge).toBe(10);
  });

  it("does not charge while the local voice is on its backup, and says so", () => {
    const backup = clock({ lastMeterAt: T0, fallbackUntil: at(60) });
    expect(tick(backup, at(30), true)).toEqual({ elapsed: 30, charge: 0, paused: true });
    expect(tick(clock({ lastMeterAt: T0 }), at(30), false)).toEqual({ elapsed: 30, charge: 0, paused: true }); // the voice service is down
    expect(tick(clock({ lastMeterAt: T0, tier: "standard" }), at(30), false).charge).toBe(30); // standard never used the local voice
  });

  it("charges the host's time and tracks how long the session has run", async () => {
    const store = memoryBilling();
    await grantForPayment({ reference: "A", userId: "h", planId: "hours-local-1", paidAt: T0 }, store);
    const c = clock();
    const cs = clockStore(c);
    await meter("h", c, cs, { now: T0, billing: store });
    const r = await meter("h", c, cs, { now: at(40), billing: store });
    expect(c.meteredSeconds).toBe(40);
    expect(r.secondsLeft).toBe(HOUR - 40);
    expect(store.grants.find((g) => g.tier === "local")!.secondsUsed).toBe(40);
  });

  it("never charges twice when many listeners ask at the same moment", async () => {
    const store = memoryBilling();
    await grantForPayment({ reference: "A", userId: "h", planId: "hours-local-1", paidAt: T0 }, store);
    const c = clock({ lastMeterAt: T0 });
    const cs = clockStore(c);
    // 20 listeners load the session at the same time, all seeing the same lastMeterAt
    await Promise.all(
      Array.from({ length: 20 }, () => meter("h", { ...c }, { claim: cs.claim, save: async () => {} }, { now: at(30), billing: store })),
    );
    expect(store.grants.find((g) => g.tier === "local")!.secondsUsed).toBe(30);
    expect(cs.claims).toBe(1);
  });

  it("does not charge while the local voice is down, and the host keeps the time", async () => {
    const store = memoryBilling();
    await grantForPayment({ reference: "A", userId: "h", planId: "hours-local-1", paidAt: T0 }, store);
    const c = clock({ lastMeterAt: T0 });
    await meter("h", c, clockStore(c), { now: at(45), localUp: false, billing: store });
    expect(c.pausedSeconds).toBe(45);
    expect(c.meteredSeconds).toBe(45);
    expect(store.grants.find((g) => g.tier === "local")!.secondsUsed).toBe(0);
  });

  it("carries on for 15 minutes after the time runs out, then stops paid features", async () => {
    const store = memoryBilling();
    const c = clock({ tier: "captions", lastMeterAt: T0 });
    const cs = clockStore(c);
    let now = 0;
    // the free 30 minutes
    for (; now < 30 * 60; now += 55) await meter("h", c, cs, { now: at(now + 55), billing: store });
    expect(c.stoppedReason).toBeNull();
    expect(c.graceSeconds).toBeGreaterThan(0); // already in the grace period
    for (; now < 30 * 60 + GRACE_SECONDS + 120; now += 55) await meter("h", c, cs, { now: at(now + 55), billing: store });
    expect(c.stoppedReason).toBe("out_of_time");
    expect(paidFeaturesOn(c)).toBe(false);
  });

  it("brings the session back when the host buys more time", async () => {
    const store = memoryBilling();
    const c = clock({ lastMeterAt: T0, stoppedReason: "out_of_time", graceSeconds: GRACE_SECONDS });
    await grantForPayment({ reference: "A", userId: "h", planId: "hours-local-2", paidAt: at(100) }, store);
    await meter("h", c, clockStore(c), { now: at(120), billing: store });
    expect(c.stoppedReason).toBeNull();
    expect(c.graceSeconds).toBe(0);
  });

  it("stops at the length the host chose", async () => {
    const store = memoryBilling();
    await grantForPayment({ reference: "A", userId: "h", planId: "hours-local-5", paidAt: T0 }, store);
    const c = clock({ lastMeterAt: T0, capSeconds: 100 });
    const cs = clockStore(c);
    await meter("h", c, cs, { now: at(55), billing: store });
    expect(c.stoppedReason).toBeNull();
    await meter("h", c, cs, { now: at(110), billing: store });
    expect(c.stoppedReason).toBe("cap_reached");
  });

  it("ignores ended sessions and sessions with no paid level", async () => {
    const store = memoryBilling();
    const ended = clock({ status: "ended", lastMeterAt: T0 });
    await meter("h", ended, clockStore(ended), { now: at(50), billing: store });
    expect(ended.meteredSeconds).toBe(0);
    const legacy = clock({ tier: "free", lastMeterAt: T0 });
    await meter("h", legacy, clockStore(legacy), { now: at(50), billing: store });
    expect(legacy.meteredSeconds).toBe(0);
  });
});

describe("who may hear which voice", () => {
  const live = (tier: string, stoppedReason: string | null = null) => ({ status: "live", tier, stoppedReason });
  const nobody = { pass: false, passUntil: null, trialSecondsLeft: 0, signedIn: false };
  const passHolder = { pass: true, passUntil: "x", trialSecondsLeft: 0, signedIn: true };
  const newcomer = { pass: false, passUntil: null, trialSecondsLeft: 200, signedIn: true };

  it("needs BOTH the host's local voice and the listener's pass", () => {
    expect(decideVoice(live("local"), true, passHolder)).toEqual({ allowed: true, native: true, reason: "paid" });
    expect(decideVoice(live("local"), true, nobody)).toEqual({ allowed: true, native: false, reason: "needs_pass" });
    expect(decideVoice(live("standard"), true, passHolder)).toEqual({ allowed: true, native: false, reason: "standard_session" });
  });

  it("lets a new listener try the local voice, then asks them to pay", () => {
    expect(decideVoice(live("local"), true, newcomer)).toMatchObject({ native: true, reason: "trial" });
    expect(decideVoice(live("local"), true, { ...newcomer, trialSecondsLeft: 0 })).toMatchObject({ native: false, reason: "needs_pass" });
  });

  it("gives no voice at all when the host paid for captions only, has run out, or the session ended", () => {
    expect(decideVoice(live("captions"), true, passHolder)).toEqual({ allowed: false, reason: "no_voice_plan" });
    expect(decideVoice(live("free"), true, passHolder)).toEqual({ allowed: false, reason: "no_voice_plan" });
    expect(decideVoice(live("local", "out_of_time"), true, passHolder)).toEqual({ allowed: false, reason: "out_of_time" });
    expect(decideVoice({ status: "ended", tier: "local", stoppedReason: null }, true, passHolder)).toEqual({ allowed: false, reason: "session_ended" });
    expect(decideVoice(null, true, passHolder)).toEqual({ allowed: false, reason: "no_session" });
  });

  it("speaks languages with no local voice (English, French, Spanish) with the standard voice", () => {
    expect(decideVoice(live("local"), false, nobody)).toEqual({ allowed: true, native: false, reason: "not_native_language" });
  });

  it("knows how much trial a listener has left, and that anonymous listeners have none", async () => {
    const store = memoryBilling();
    expect(await listenerAccess("u1", T0, store)).toMatchObject({ pass: false, trialSecondsLeft: LISTENER_TRIAL_SECONDS, signedIn: true });
    await store.addTrial("u1", 100);
    expect((await listenerAccess("u1", T0, store)).trialSecondsLeft).toBe(LISTENER_TRIAL_SECONDS - 100);
    expect(await listenerAccess(null, T0, store)).toMatchObject({ trialSecondsLeft: 0, signedIn: false });
  });

  it("measures speech at about 2.5 words a second", () => {
    expect(audioSeconds("one two three four five")).toBe(2);
    expect(audioSeconds(Array(50).fill("word").join(" "))).toBe(20);
    expect(audioSeconds("hi")).toBe(1);
  });
});

describe("billing routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp({ logger: false }); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it("shows the price list without any per-minute or per-word rate or provider name", async () => {
    const res = await app.inject({ method: "GET", url: "/api/billing/pricing" });
    expect(res.statusCode).toBe(200);
    const text = res.body.toLowerCase();
    expect(text).not.toContain("perminute");
    expect(text).not.toContain("perword");
    expect(text).not.toContain("per_minute");
    expect(text).not.toMatch(/spitch|azure/);
    const body = res.json();
    expect(body.plans).toHaveLength(12);
    expect(body.rules).toMatchObject({ validDays: 30, refundable: false });
    expect(body.listener.amount).toBe(2000);
    expect(body.hours.prices.local["5"]).toBe(hoursPrice("local", 5));
  });

  it("asks for a sign-in to see a balance or an estimate", async () => {
    expect((await app.inject({ method: "GET", url: "/api/billing/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/billing/estimate", payload: { tier: "local", minutes: 60 } })).statusCode).toBe(401);
  });
});

describe("payment to time, end to end (no network, no real database)", () => {
  function payments(): PaymentStore & { rows: PaymentRow[] } {
    const rows: PaymentRow[] = [];
    const find = (ref: string) => rows.find((r) => r.reference === ref);
    return {
      rows,
      async insert(row) { const r = { id: crypto.randomUUID(), channel: null, feesKobo: null, gatewayResponse: null, paidAt: null, createdAt: new Date(), updatedAt: new Date(), userId: null, livemode: true, currency: "NGN", status: "pending", ...row } as PaymentRow; rows.push(r); return r; },
      async byReference(ref) { return find(ref); },
      async markSuccess(ref, f) { const r = find(ref); if (!r || r.status === "success") return undefined; Object.assign(r, { status: "success", paidAt: f.paidAt ?? new Date() }); return r; },
      async markStatus(ref, status) { const r = find(ref); if (r) r.status = status; },
      async forUser(id) { return rows.filter((r) => r.userId === id); },
    };
  }
  const paid = (row: PaymentRow, over: Partial<PaystackTransaction> = {}): PaystackTransaction => ({
    reference: row.reference, status: "success", amount: row.amountKobo, currency: "NGN", metadata: { app: "VOICEVERSE" }, ...over,
  });

  it("charges the server's price for hours, then puts exactly those hours in the ledger once", async () => {
    const saved = { key: process.env.PAYSTACK_SECRET_KEY, fetch: globalThis.fetch };
    process.env.PAYSTACK_SECRET_KEY = "sk_test_billing_only";
    let sent: { amount?: number; reference?: string; metadata?: Record<string, unknown> } = {};
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      sent = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.example/x", access_code: "a", reference: sent.reference } }), { status: 200 });
    }) as typeof fetch;
    try {
      const store = payments();
      const billing = memoryBilling();
      const out = await createCheckout({ user: { id: "host1", email: "h@example.com" }, planId: "hours-local-5", callbackUrl: "https://x/return" }, { store });
      expect(sent.amount).toBe(hoursPrice("local", 5) * 100);
      expect(sent.reference).toMatch(/^VOICEVERSE-HOURS-\d{8}-[0-9A-F]{12}$/);
      expect(sent.metadata).toMatchObject({ app: "VOICEVERSE", purpose: "HOURS", plan: "hours-local-5" });

      const row = store.rows[0]!;
      await settle(out.reference, { store, billing, verify: async () => paid(row) });
      await settle(out.reference, { store, billing, verify: async () => paid(row) }); // the webhook and the return page both fire
      expect(billing.grants.length).toBe(1);
      expect(billing.grants[0]).toMatchObject({ userId: "host1", tier: "local", secondsTotal: 5 * HOUR });
    } finally {
      globalThis.fetch = saved.fetch;
      if (saved.key === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = saved.key;
    }
  });

  it("grants nothing when the amount paid is not the amount asked for", async () => {
    const store = payments();
    const billing = memoryBilling();
    const row = await store.insert({ reference: "VOICEVERSE-HOURS-20261024-AAAAAAAAAAAA", userId: "h", email: "h@x.com", planId: "hours-local-5", purpose: "HOURS", amountKobo: hoursPrice("local", 5) * 100, currency: "NGN", status: "pending", livemode: true });
    await settle(row.reference, { store, billing, verify: async () => paid(row, { amount: 100 * 100 }) }); // paid ₦100 instead
    expect(billing.grants.length).toBe(0);
    expect((await store.byReference(row.reference))?.status).toBe("mismatch");
  });

  it("refuses to sell a price or a plan the server does not know", async () => {
    const store = payments();
    await expect(createCheckout({ user: { id: "h", email: "h@x.com" }, planId: "hours-local-999", callbackUrl: "https://x" }, { store })).rejects.toThrow();
    await expect(createCheckout({ user: { id: "h", email: "h@x.com" }, planId: "api-starter", callbackUrl: "https://x" }, { store })).rejects.toThrow();
    expect(store.rows.length).toBe(0);
  });
});
