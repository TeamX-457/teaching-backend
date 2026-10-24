import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { PLANS, sellable, type Plan } from "@/config/pricing";
import {
  PaymentError,
  createCheckout,
  fulfilments,
  handleWebhookEvent,
  settle,
  type PaymentRow,
  type PaymentStore,
} from "@/services/payments.service";
import { PRODUCTS, cleanPurpose, isOurs, makeReference, paystackMetadata, productOf } from "@/services/paystack.naming";
import { appOf, summarise } from "@/services/paystack.report";
import {
  paystackConfigured,
  paystackKey,
  paystackLive,
  toKobo,
  verifyWebhookSignature,
  type PaystackTransaction,
} from "@/services/paystack.service";

/** In-memory ledger: these tests never touch the real database or the real Paystack account. */
function memoryStore(): PaymentStore & { rows: PaymentRow[] } {
  const rows: PaymentRow[] = [];
  const find = (ref: string) => rows.find((r) => r.reference === ref);
  return {
    rows,
    async insert(row) {
      const r = { id: crypto.randomUUID(), channel: null, feesKobo: null, gatewayResponse: null, paidAt: null, createdAt: new Date(), updatedAt: new Date(), userId: null, livemode: true, currency: "NGN", status: "pending", ...row } as PaymentRow;
      rows.push(r);
      return r;
    },
    async byReference(ref) { return find(ref); },
    async markSuccess(ref, f) {
      const r = find(ref);
      if (!r || r.status === "success" || r.status === "reversed") return undefined;
      Object.assign(r, { status: "success", channel: f.channel ?? null, feesKobo: f.feesKobo ?? null, paidAt: f.paidAt ?? new Date(), gatewayResponse: f.gatewayResponse ?? null });
      return r;
    },
    async markStatus(ref, status, gr) { const r = find(ref); if (r) Object.assign(r, { status, gatewayResponse: gr ?? null }); },
    async forUser(id) { return rows.filter((r) => r.userId === id); },
  };
}

const PLAN: Plan = { id: "test-plan", name: "Test", purpose: "API", description: "Voice Verse API access", amountNaira: 5000, enabled: true };

describe("how Voice Verse labels its money", () => {
  it("references start VOICEVERSE- in the same shape as the other products", () => {
    const ref = makeReference("API", new Date("2026-10-23T10:00:00Z"));
    expect(ref).toMatch(/^VOICEVERSE-API-20261023-[0-9A-F]{12}$/);
    expect(makeReference("support")).toMatch(/^VOICEVERSE-SUPPORT-\d{8}-[0-9A-F]{12}$/);
  });

  it("only uses characters Paystack allows in a reference", () => {
    expect(cleanPurpose("api starter!")).toBe("API-STARTER");
    expect(cleanPurpose("  ")).toBe("PAYMENT");
    for (let i = 0; i < 50; i++) expect(makeReference("Pro plan/annual")).toMatch(/^[A-Za-z0-9.=-]+$/);
  });

  it("never repeats", () => {
    expect(new Set(Array.from({ length: 500 }, () => makeReference("API"))).size).toBe(500);
  });

  it("tells its own references from every other product's", () => {
    expect(isOurs("VOICEVERSE-API-20261023-AAAAAAAAAAAA")).toBe(true);
    expect(isOurs("voiceverse-api-1")).toBe(true);
    for (const other of ["CHOROPIA-ORDER-1", "MIRROR-PRO-1", "VISIONMIRROR-SUPPORT-1", "NUTRISCAN-PROYEAR-1", "SPLITPAY-X-1", "X", "", null, undefined]) {
      expect(isOurs(other as string)).toBe(false);
    }
  });

  it("matches product codes whole: MIRROR is not VISIONMIRROR", () => {
    expect(productOf("MIRROR-PRO-1")).toBe("MIRROR");
    expect(productOf("VISIONMIRROR-SUPPORT-1")).toBe("VISIONMIRROR");
    expect(productOf("VOICEVERSE-API-1")).toBe("VOICEVERSE");
    expect(productOf("SOMETHING-ELSE-1")).toBeNull();
    expect(Object.keys(PRODUCTS).sort()).toEqual(["CHOROPIA", "MIRROR", "NUTRISCAN", "SPLITPAY", "VISIONMIRROR", "VOICEVERSE"]);
  });

  it("sends the same metadata keys as the other products, including the dashboard fields", () => {
    const m = paystackMetadata("api", "Voice Verse API access", { plan: "p1" });
    expect(m).toMatchObject({ app: "VOICEVERSE", app_name: "Voice Verse", purpose: "API", plan: "p1" });
    expect(m.custom_fields).toEqual([
      { display_name: "App", variable_name: "app", value: "Voice Verse" },
      { display_name: "Payment for", variable_name: "purpose", value: "Voice Verse API access" },
    ]);
  });
});

describe("the Paystack key", () => {
  const saved = { a: process.env.PAYSTACK_SECRET_KEY, b: process.env.PAYSTACK_API };
  afterEach(() => {
    for (const [k, v] of [["PAYSTACK_SECRET_KEY", saved.a], ["PAYSTACK_API", saved.b]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it("uses PAYSTACK_API only when PAYSTACK_SECRET_KEY is not set at all", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_API = "sk_test_from_api_name";
    expect(paystackKey()).toBe("sk_test_from_api_name");
    process.env.PAYSTACK_SECRET_KEY = "sk_test_primary";
    expect(paystackKey()).toBe("sk_test_primary");
  });

  it("treats an empty PAYSTACK_SECRET_KEY as no key, never falling through to another key", () => {
    process.env.PAYSTACK_API = "sk_live_must_not_be_used";
    process.env.PAYSTACK_SECRET_KEY = "";
    expect(paystackKey()).toBe("");
    expect(paystackConfigured()).toBe(false);
  });

  it("knows live from test, and rejects anything that is not a secret key", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_x";
    expect(paystackLive()).toBe(true);
    process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
    expect(paystackLive()).toBe(false);
    process.env.PAYSTACK_SECRET_KEY = "pk_live_a_public_key";
    expect(paystackConfigured()).toBe(false);
  });

  it("converts naira to kobo without rounding errors", () => {
    expect(toKobo(5000)).toBe(500000);
    expect(toKobo(1234.56)).toBe(123456);
    expect(toKobo(0.07)).toBe(7);
  });
});

describe("webhook signature", () => {
  const saved = process.env.PAYSTACK_SECRET_KEY;
  beforeEach(() => { process.env.PAYSTACK_SECRET_KEY = "sk_test_signing"; });
  afterEach(() => { if (saved === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = saved; });
  const sign = (body: string) => createHmac("sha512", "sk_test_signing").update(body).digest("hex");

  it("accepts the exact signed bytes and rejects everything else", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "VOICEVERSE-API-1" } });
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
    expect(verifyWebhookSignature(body, sign(body).toUpperCase())).toBe(true);
    expect(verifyWebhookSignature(body, [sign(body)])).toBe(true);
    expect(verifyWebhookSignature(body + " ", sign(body))).toBe(false); // one byte different
    expect(verifyWebhookSignature(body, "nope")).toBe(false);
    expect(verifyWebhookSignature(body, undefined)).toBe(false);
    expect(verifyWebhookSignature(body, "")).toBe(false);
  });

  it("rejects everything when there is no key", () => {
    process.env.PAYSTACK_SECRET_KEY = "";
    expect(verifyWebhookSignature("x", createHmac("sha512", "").update("x").digest("hex"))).toBe(false);
  });
});

describe("what is for sale", () => {
  it("sells nothing until a plan has a price and is switched on", () => {
    expect(sellable(PLANS)).toEqual([]);
    expect(sellable([{ ...PLAN, enabled: false }])).toEqual([]);
    expect(sellable([{ ...PLAN, amountNaira: null }])).toEqual([]);
    expect(sellable([{ ...PLAN, amountNaira: 0 }])).toEqual([]);
    expect(sellable([PLAN])).toHaveLength(1);
  });
});

describe("taking a payment", () => {
  const saved = { key: process.env.PAYSTACK_SECRET_KEY, fetch: globalThis.fetch };
  let sent: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
    sent = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {}, auth: (init?.headers as Record<string, string>).Authorization! });
      return Response.json({ status: true, message: "ok", data: { authorization_url: "https://checkout.paystack.com/abc", access_code: "ac", reference: "r" } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = saved.key;
    for (const k of Object.keys(fulfilments)) delete fulfilments[k];
  });

  it("labels the transaction at Paystack and records it first", async () => {
    const store = memoryStore();
    const r = await createCheckout({ user: { id: "u1", email: "ada@example.com" }, planId: "test-plan", callbackUrl: "https://app.test/app/billing" }, { store, plans: [PLAN] });

    expect(r.reference).toMatch(/^VOICEVERSE-API-\d{8}-[0-9A-F]{12}$/);
    expect(r.authorizationUrl).toBe("https://checkout.paystack.com/abc");
    const call = sent[0]!;
    expect(call.url).toBe("https://api.paystack.co/transaction/initialize");
    expect(call.auth).toBe("Bearer sk_test_unit");
    expect(call.body).toMatchObject({ email: "ada@example.com", amount: 500000, currency: "NGN", reference: r.reference, callback_url: "https://app.test/app/billing" });
    expect(call.body.metadata).toMatchObject({ app: "VOICEVERSE", app_name: "Voice Verse", purpose: "API", plan: "test-plan", user_id: "u1" });
    // the ledger row exists before the customer pays
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ reference: r.reference, status: "pending", amountKobo: 500000, userId: "u1", planId: "test-plan" });
  });

  it("takes the price from the server, so the app cannot choose it", async () => {
    const store = memoryStore();
    await createCheckout({ user: { id: "u1", email: "a@b.co" }, planId: "test-plan", callbackUrl: "x" }, { store, plans: [PLAN] });
    expect(sent[0]!.body.amount).toBe(500000);
  });

  it("refuses a plan that does not exist or is not for sale", async () => {
    const store = memoryStore();
    for (const planId of ["nope", "api-starter"]) {
      await expect(createCheckout({ user: { id: "u1", email: "a@b.co" }, planId, callbackUrl: "x" }, { store, plans: PLANS })).rejects.toBeInstanceOf(PaymentError);
    }
    expect(sent).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it("marks the payment failed, and says so plainly, when Paystack is unreachable", async () => {
    globalThis.fetch = (async () => { throw new Error("network"); }) as typeof fetch;
    const store = memoryStore();
    await expect(createCheckout({ user: { id: "u1", email: "a@b.co" }, planId: "test-plan", callbackUrl: "x" }, { store, plans: [PLAN] })).rejects.toMatchObject({ code: "GATEWAY_UNAVAILABLE" });
    expect(store.rows[0]!.status).toBe("failed");
  });
});

describe("confirming a payment", () => {
  const pending = async (store: ReturnType<typeof memoryStore>, amountKobo = 500000) => {
    const reference = makeReference("API");
    await store.insert({ reference, userId: "u1", email: "a@b.co", planId: "test-plan", purpose: "API", amountKobo, currency: "NGN", status: "pending", livemode: false });
    return reference;
  };
  const tx = (reference: string, over: Partial<PaystackTransaction> = {}): PaystackTransaction => ({
    reference, status: "success", amount: 500000, currency: "NGN", channel: "card", fees: 7500, paid_at: "2026-10-23T10:00:00.000Z",
    metadata: { app: "VOICEVERSE" }, ...over,
  });
  afterEach(() => { for (const k of Object.keys(fulfilments)) delete fulfilments[k]; });

  it("records a paid payment once, with the fee, and fulfils it exactly once", async () => {
    const store = memoryStore();
    const ref = await pending(store);
    let fulfilled = 0;
    fulfilments["test-plan"] = async () => { fulfilled++; };
    const verify = async () => tx(ref);

    const first = await settle(ref, { store, verify });
    const again = await settle(ref, { store, verify }); // return page and webhook can both fire
    expect(first).toMatchObject({ status: "success", channel: "card", feesKobo: 7500 });
    expect(again?.status).toBe("success");
    expect(fulfilled).toBe(1);
  });

  it("does not trust a payment for the wrong amount or currency", async () => {
    for (const over of [{ amount: 100 }, { currency: "USD" }]) {
      const store = memoryStore();
      const ref = await pending(store);
      let fulfilled = 0;
      fulfilments["test-plan"] = async () => { fulfilled++; };
      const row = await settle(ref, { store, verify: async () => tx(ref, over) });
      expect(row?.status).toBe("mismatch");
      expect(fulfilled).toBe(0);
    }
  });

  it("leaves unpaid and abandoned payments pending, and records failures", async () => {
    const store = memoryStore();
    const a = await pending(store);
    expect((await settle(a, { store, verify: async () => tx(a, { status: "abandoned" }) }))?.status).toBe("pending");
    const f = await pending(store);
    expect((await settle(f, { store, verify: async () => tx(f, { status: "failed", gateway_response: "Declined" }) }))?.status).toBe("failed");
  });

  it("ignores references that are not ours, and payments we never started", async () => {
    const store = memoryStore();
    const verify = async () => { throw new Error("must not be called"); };
    expect(await settle("CHOROPIA-ORDER-20261023-AAAAAAAAAAAA", { store, verify })).toBeNull();
    expect(await settle("VOICEVERSE-API-20261023-FFFFFFFFFFFF", { store, verify })).toBeNull();
  });

  it("ignores a payment that carries another product's app code", async () => {
    const store = memoryStore();
    const ref = await pending(store);
    expect(await settle(ref, { store, verify: async () => tx(ref, { metadata: { app: "CHOROPIA" } }) })).toBeNull();
  });

  it("webhook: handles charge.success for us, ignores other products and unused events", async () => {
    const store = memoryStore();
    const ref = await pending(store);
    const verify = async () => tx(ref);

    expect(await handleWebhookEvent({ event: "charge.success", data: { reference: "CHOROPIA-ORDER-1" } }, { store, verify })).toEqual({ handled: false, reason: "not ours" });
    expect(await handleWebhookEvent({ event: "charge.success", data: { reference: "VISIONMIRROR-SUPPORT-1" } }, { store, verify })).toEqual({ handled: false, reason: "not ours" });
    expect(await handleWebhookEvent({ event: "transfer.success", data: { reference: ref } }, { store, verify })).toEqual({ handled: false, reason: "event not used" });
    expect(store.rows[0]!.status).toBe("pending");

    expect(await handleWebhookEvent({ event: "charge.success", data: { reference: ref } }, { store, verify })).toEqual({ handled: true });
    expect(store.rows[0]!.status).toBe("success");
  });

  it("webhook: a refund marks the payment reversed", async () => {
    const store = memoryStore();
    const ref = await pending(store);
    await settle(ref, { store, verify: async () => tx(ref) });
    expect(await handleWebhookEvent({ event: "refund.processed", data: { transaction_reference: ref } }, { store })).toEqual({ handled: true });
    expect(store.rows[0]!.status).toBe("reversed");
  });
});

describe("the profit report", () => {
  const t = (reference: string, amount: number, over: Partial<PaystackTransaction> = {}): PaystackTransaction => ({ reference, status: "success", amount, currency: "NGN", fees: Math.round(amount * 0.015), ...over });

  it("splits one shared account by product, counting only successful payments as income", () => {
    const b = summarise([
      t("VOICEVERSE-API-1", 500000), t("VOICEVERSE-SUPPORT-2", 200000),
      t("VOICEVERSE-API-3", 500000, { status: "abandoned" }),
      t("CHOROPIA-ORDER-1", 1_000_000), t("MIRROR-PRO-1", 300000), t("VISIONMIRROR-SUPPORT-1", 100000),
      t("VOICEVERSE-API-4", 500000, { status: "reversed" }),
    ]);
    const by = Object.fromEntries(b.map((x) => [x.code, x]));
    expect(by.VOICEVERSE).toMatchObject({ count: 2, grossKobo: 700000, feesKobo: 10500, netKobo: 689500, refundedKobo: 500000, notPaid: 1 });
    expect(by.CHOROPIA!.grossKobo).toBe(1_000_000);
    expect(by.MIRROR!.name).toBe("MirrorCentral");
    expect(by.VISIONMIRROR!.name).toBe("VisionMirror"); // not mixed up with MIRROR
    expect(b[0]!.code).toBe("CHOROPIA"); // biggest first
  });

  it("prefers metadata.app over the reference, and keeps untagged money visible", () => {
    expect(appOf({ reference: "X-1", metadata: { app: "voiceverse" } })).toBe("VOICEVERSE");
    expect(appOf({ reference: "VOICEVERSE-API-1", metadata: JSON.stringify({ app: "VOICEVERSE" }) })).toBe("VOICEVERSE");
    expect(appOf({ reference: "randomref", metadata: null })).toBe("UNTAGGED");
    const b = summarise([t("randomref", 100000)]);
    expect(b[0]).toMatchObject({ code: "UNTAGGED", count: 1 });
  });
});
