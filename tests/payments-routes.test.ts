import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { buildApp } from "../src/app";

const KEY = "sk_test_routes_only";

describe("payment routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const saved = { key: process.env.PAYSTACK_SECRET_KEY, fetch: globalThis.fetch };
  let outbound: string[] = [];

  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = KEY;
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    if (saved.key === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = saved.key;
    await app.close();
  });
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = KEY;
    outbound = [];
    // These tests must never reach Paystack: any outbound call is recorded and refused.
    globalThis.fetch = (async (url: unknown) => {
      outbound.push(String(url));
      throw new Error("network is blocked in this test");
    }) as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = saved.fetch; });

  const sign = (body: string) => createHmac("sha512", KEY).update(body).digest("hex");
  const hook = (body: string, signature?: string) =>
    app.inject({
      method: "POST",
      url: "/api/payments/webhook",
      headers: { "content-type": "application/json", ...(signature !== undefined ? { "x-paystack-signature": signature } : {}) },
      payload: body,
    });

  it("lists nothing for sale until a plan is switched on", async () => {
    const res = await app.inject({ method: "GET", url: "/api/payments/plans" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ configured: true, plans: [] });
  });

  it("says payments are not configured without a key", async () => {
    process.env.PAYSTACK_SECRET_KEY = "";
    const res = await app.inject({ method: "GET", url: "/api/payments/plans" });
    expect(res.json()).toEqual({ configured: false, plans: [] });
  });

  it("needs a signed-in user to pay, verify or list payments", async () => {
    expect((await app.inject({ method: "POST", url: "/api/payments/checkout", payload: { plan: "x" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/payments/verify/VOICEVERSE-API-20261023-AAAAAAAAAAAA" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/payments/mine" })).statusCode).toBe(401);
    expect(outbound).toEqual([]);
  });

  describe("webhook", () => {
    it("rejects a missing or wrong signature", async () => {
      const body = JSON.stringify({ event: "charge.success", data: { reference: "VOICEVERSE-API-20261023-AAAAAAAAAAAA" } });
      expect((await hook(body)).statusCode).toBe(401);
      expect((await hook(body, "nope")).statusCode).toBe(401);
      expect((await hook(body, sign(body + " "))).statusCode).toBe(401); // signed a different body
      expect(outbound).toEqual([]);
    });

    it("rejects a signature made with a different key", async () => {
      const body = JSON.stringify({ event: "charge.success", data: { reference: "VOICEVERSE-API-1" } });
      const other = createHmac("sha512", "sk_test_someone_else").update(body).digest("hex");
      expect((await hook(body, other)).statusCode).toBe(401);
    });

    it("answers 200 and does nothing for other products' events on the shared account", async () => {
      for (const reference of ["CHOROPIA-ORDER-20261023-AAAAAAAAAAAA", "MIRROR-PRO-20261023-AAAAAAAAAAAA", "VISIONMIRROR-SUPPORT-20261023-AAAAAAAAAAAA"]) {
        const body = JSON.stringify({ event: "charge.success", data: { reference, metadata: { app: reference.split("-")[0] } } });
        const res = await hook(body, sign(body));
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ received: true, handled: false });
      }
      expect(outbound).toEqual([]); // never asked Paystack about someone else's payment
    });

    it("acknowledges a payment of ours that it has no record of, without calling Paystack", async () => {
      const body = JSON.stringify({ event: "charge.success", data: { reference: "VOICEVERSE-API-20261023-0123456789AB" } });
      const res = await hook(body, sign(body));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ received: true, handled: false });
      expect(outbound).toEqual([]);
    });

    it("accepts events that are not used, such as transfers", async () => {
      const body = JSON.stringify({ event: "transfer.success", data: { reference: "VOICEVERSE-API-20261023-0123456789AB" } });
      expect((await hook(body, sign(body))).statusCode).toBe(200);
    });

    it("rejects a body that is not JSON", async () => {
      const res = await hook("not json", sign("not json"));
      expect(res.statusCode).toBe(400);
    });
  });

  describe("return page", () => {
    it("shows 'not confirmed yet' for an unknown reference, with the status coming from Paystack, not the URL", async () => {
      const res = await app.inject({ method: "GET", url: "/api/payments/return?reference=VOICEVERSE-API-20261023-0123456789AB&status=success" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain("Payment not confirmed yet");
      expect(res.body).not.toContain("Thank you");
    });

    it("cannot be used to inject markup", async () => {
      const res = await app.inject({ method: "GET", url: "/api/payments/return?reference=%3Cscript%3Ealert(1)%3C%2Fscript%3E" });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain("<script>alert");
    });
  });
});
