import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from "bun:test";
import { createHmac } from "node:crypto";
import { buildApp } from "../src/app";
import { makeReference, paystackService } from "../src/services/paystack.service";

const KEY = "sk_test_unit";

describe("Support payments", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const previousKey = process.env.PAYSTACK_SECRET_KEY;

  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = KEY;
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = previousKey;
    await app.close();
  });
  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = KEY;
  });

  it("names the app in every reference", () => {
    expect(makeReference("SUPPORT")).toMatch(/^VOICEVERSE-SUPPORT-\d{8}-[0-9A-F]{12}$/);
  });

  it("starts a checkout labelled as Voice Verse", async () => {
    const init = spyOn(paystackService, "initialize").mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/x",
      access_code: "ac",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/support/checkout",
      payload: { amountNgn: 2000, email: "ada@example.com" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().reference).toStartWith("VOICEVERSE-SUPPORT-");
    const sent = init.mock.calls[0]![0];
    expect(sent.amountKobo).toBe(200_000);
    expect((sent.metadata as { app: string }).app).toBe("VOICEVERSE");
    expect(sent.callbackUrl).toEndWith("/api/support/return");
    init.mockRestore();
  });

  it("asks for an email when not signed in", async () => {
    const res = await app.inject({ method: "POST", url: "/api/support/checkout", payload: { amountNgn: 2000 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("EMAIL_REQUIRED");
  });

  it("rejects amounts out of range", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/support/checkout",
      payload: { amountNgn: 5, email: "ada@example.com" },
    });
    expect(res.json().code).toBe("INVALID_INPUT");
  });

  it("answers 503 without a key", async () => {
    process.env.PAYSTACK_SECRET_KEY = "";
    const res = await app.inject({
      method: "POST",
      url: "/api/support/checkout",
      payload: { amountNgn: 2000, email: "ada@example.com" },
    });
    expect(res.statusCode).toBe(503);
  });

  it("verifies the webhook signature over the raw body", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "VOICEVERSE-SUPPORT-X", amount: 100 } });
    const good = createHmac("sha512", KEY).update(body).digest("hex");
    const ok = await app.inject({
      method: "POST",
      url: "/api/support/paystack/webhook",
      headers: { "content-type": "application/json", "x-paystack-signature": good },
      payload: body,
    });
    const bad = await app.inject({
      method: "POST",
      url: "/api/support/paystack/webhook",
      headers: { "content-type": "application/json", "x-paystack-signature": "nope" },
      payload: body,
    });
    expect(ok.statusCode).toBe(200);
    expect(bad.statusCode).toBe(400);
  });
});
