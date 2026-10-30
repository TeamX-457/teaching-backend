import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { escapeHtml, mailConfigured, render, sendEmail, sendPasswordReset, sendVerification, setSenderForTests } from "@/lib/mailer";
import { fulfilments, settle, type PaymentRow, type PaymentStore } from "@/services/payments.service";
import { makeReference } from "@/services/paystack.naming";
import type { PaystackTransaction } from "@/services/paystack.service";

type Sent = { from: string; to: string; subject: string; text: string; html: string };
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  process.env.EMAIL_FROM = "Voice Verse <sender@example.com>";
  setSenderForTests(async (m) => { sent.push(m); });
});
afterEach(() => {
  setSenderForTests(null);
  delete process.env.EMAIL_FROM;
  for (const k of Object.keys(fulfilments)) delete fulfilments[k];
});

describe("the mailer", () => {
  it("never throws when the mail server is down", async () => {
    setSenderForTests(async () => { throw new Error("smtp down"); });
    expect(await sendEmail("a@example.com", "Hi", "Hello", ["there"])).toBe(false);
  });

  it("sends nothing and does not fail when no credentials are set", async () => {
    setSenderForTests(null);
    const keep = { u: process.env.EMAIL_HOST_USER, p: process.env.EMAIL_HOST_PASSWORD };
    delete process.env.EMAIL_HOST_USER;
    delete process.env.EMAIL_HOST_PASSWORD;
    expect(mailConfigured()).toBe(false);
    expect(await sendEmail("a@example.com", "Hi", "Hello", ["there"])).toBe(false);
    if (keep.u) process.env.EMAIL_HOST_USER = keep.u;
    if (keep.p) process.env.EMAIL_HOST_PASSWORD = keep.p;
  });

  it("escapes user text and strips newlines from the subject", async () => {
    expect(escapeHtml(`<b>"x"</b>`)).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    const { html } = render("<script>x</script>", ["<b>hi</b>"], { label: "Go", url: 'https://x.test/?a="b"' });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>hi</b>");
    await sendEmail("a@example.com", "Hi\nBcc: x@y.z", "h", ["p"]);
    expect(sent[0]!.subject).not.toContain("\n");
  });

  it("sends the verification and reset emails with their links", async () => {
    await sendVerification("ada@example.com", "Ada", "https://api.vv.test/api/auth/verify-email?token=abc");
    await sendPasswordReset("ada@example.com", "Ada", "https://api.vv.test/api/auth/reset-password/tok?callbackURL=x");
    expect(sent.map((m) => m.subject)).toEqual(["Welcome to Voice Verse: confirm your email", "Reset your Voice Verse password"]);
    expect(sent[0]!.text).toContain("https://api.vv.test/api/auth/verify-email?token=abc");
    expect(sent[1]!.html).toContain("expires in one hour");
    expect(sent[1]!.from).toBe("Voice Verse <sender@example.com>");
  });
});

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

describe("payment receipts", () => {
  const pending = async (store: ReturnType<typeof memoryStore>, userId: string | null = "u1") => {
    const reference = makeReference("API");
    await store.insert({ reference, userId, email: "a@b.co", planId: "test-plan", purpose: "API", amountKobo: 500000, currency: "NGN", status: "pending", livemode: false });
    return reference;
  };
  const tx = (reference: string, over: Partial<PaystackTransaction> = {}): PaystackTransaction => ({
    reference, status: "success", amount: 500000, currency: "NGN", channel: "card", fees: 7500, paid_at: "2026-10-23T10:00:00.000Z",
    metadata: { app: "VOICEVERSE" }, ...over,
  });
  const emailOf = async (id: string) => (id === "u1" ? "ada@example.com" : undefined);

  it("sends exactly one receipt however many times the payment is reported", async () => {
    const store = memoryStore();
    const ref = await pending(store);
    fulfilments["test-plan"] = async () => {};
    const deps = { store, verify: async () => tx(ref), emailOf };
    await settle(ref, deps);
    await settle(ref, deps); // the return page and the webhook can both fire
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("ada@example.com");
    expect(sent[0]!.subject).toContain("₦5,000.00");
    expect(sent[0]!.text).toContain(ref);
  });

  it("sends no receipt for a payment that was not honoured", async () => {
    for (const over of [{ amount: 100 }, { status: "failed" }, { status: "abandoned" }] as Partial<PaystackTransaction>[]) {
      const store = memoryStore();
      const ref = await pending(store);
      await settle(ref, { store, verify: async () => tx(ref, over), emailOf });
    }
    expect(sent).toHaveLength(0);
  });

  it("a receipt problem never undoes a successful payment", async () => {
    const store = memoryStore();
    const ref = await pending(store);
    fulfilments["test-plan"] = async () => {};
    const row = await settle(ref, { store, verify: async () => tx(ref), emailOf: async () => { throw new Error("db down"); } });
    expect(row?.status).toBe("success");
    expect(sent).toHaveLength(0);
  });

  it("skips quietly for a payment that has no account behind it", async () => {
    const store = memoryStore();
    const ref = await pending(store, null);
    fulfilments["test-plan"] = async () => {};
    expect((await settle(ref, { store, verify: async () => tx(ref), emailOf }))?.status).toBe("success");
    expect(sent).toHaveLength(0);
  });
});
