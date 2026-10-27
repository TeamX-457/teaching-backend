import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { API_CREDIT_PACKS, API_RATES, apiPriceKobo, resolvePlan, sellable } from "@/config/pricing";
import { apiBillingEnforced, creditPackKobo } from "@/services/apibilling.service";
import { grantForPayment } from "@/services/billing.service";
import { buildApp } from "@/app";

describe("developer prices", () => {
  it("bills translation by the word and always rounds up", () => {
    expect(apiPriceKobo("translation", "text", 100)).toBe(API_RATES.translatePer100Words * 100);
    expect(apiPriceKobo("translation", "text", 1)).toBe(35);
    expect(apiPriceKobo("translation", "text", 0)).toBe(0);
    expect(apiPriceKobo("translation", "text", -5)).toBe(0);
    expect(apiPriceKobo("translation", "text", Number.NaN)).toBe(0);
  });

  it("bills speech by the second, with the local voice costing more than the standard voice", () => {
    expect(apiPriceKobo("speech", "standard", 60)).toBe(API_RATES.speechStandardPerMinute * 100);
    expect(apiPriceKobo("speech", "local", 60)).toBe(API_RATES.speechLocalPerMinute * 100);
    expect(apiPriceKobo("speech", "local", 1)).toBeGreaterThan(apiPriceKobo("speech", "standard", 1));
    expect(apiPriceKobo("speech", "standard", 1)).toBe(75); // 4500 kobo a minute is 75 a second
    expect(apiPriceKobo("transcription", "text", 60)).toBe(API_RATES.transcribePerMinute * 100);
  });

  it("never charges a fraction of a kobo less than the rate", () => {
    for (const s of [1, 7, 13, 59, 61, 3599]) {
      expect(apiPriceKobo("speech", "local", s)).toBeGreaterThanOrEqual((s * API_RATES.speechLocalPerMinute * 100) / 60);
    }
  });
});

describe("credit packs", () => {
  it("only sells the listed amounts", () => {
    for (const n of API_CREDIT_PACKS) expect(resolvePlan(`api-credit-${n}`)?.amountNaira).toBe(n);
    expect(resolvePlan("api-credit-1234")).toBeUndefined();
    expect(resolvePlan("api-credit-1")).toBeUndefined();
    expect(resolvePlan("api-credit-99999999")).toBeUndefined();
    expect(sellable().map((p) => p.id)).toContain("api-credit-20000");
  });

  it("turns a pack id into the kobo it adds", () => {
    expect(creditPackKobo("api-credit-5000")).toBe(500_000);
    expect(creditPackKobo("api-credit-100000")).toBe(10_000_000);
    expect(creditPackKobo("hours-local-5")).toBe(0);
    expect(creditPackKobo("api-credit-5000x")).toBe(0);
  });

  it("tops up exactly the pack amount once per payment, and not for strangers", async () => {
    const calls: [string, string, number][] = [];
    const credit = async (ref: string, user: string, kobo: number) => {
      if (calls.some((c) => c[0] === ref)) return false;
      calls.push([ref, user, kobo]);
      return true;
    };
    const mem = { activeGrants: async () => [], addGrant: async () => true, spend: async () => 0, addPass: async () => true, passUntil: async () => null, trialUsed: async () => 0, addTrial: async () => 0 };
    const pay = { reference: "VOICEVERSE-APICREDIT-20261027-AAAAAAAAAAAA", userId: "dev1", planId: "api-credit-20000" };
    expect(await grantForPayment(pay, mem, credit)).toBe(true);
    expect(await grantForPayment(pay, mem, credit)).toBe(false);
    expect(calls).toEqual([[pay.reference, "dev1", 2_000_000]]);
    expect(await grantForPayment({ ...pay, userId: null }, mem, credit)).toBe(false);
    expect(await grantForPayment({ ...pay, reference: "R2", planId: "api-credit-777" }, mem, credit)).toBe(false);
  });
});

describe("charging developers is off until switched on", () => {
  it("defaults to preview mode", () => {
    const saved = process.env.API_BILLING_ENFORCED;
    delete process.env.API_BILLING_ENFORCED;
    expect(apiBillingEnforced()).toBe(false);
    process.env.API_BILLING_ENFORCED = "1";
    expect(apiBillingEnforced()).toBe(true);
    if (saved === undefined) delete process.env.API_BILLING_ENFORCED; else process.env.API_BILLING_ENFORCED = saved;
  });
});

describe("developer usage routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp({ logger: false }); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it("needs a sign-in to see usage or set a limit", async () => {
    expect((await app.inject({ method: "GET", url: "/api/keys/usage" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: "/api/keys/3f2b8a52-0a4e-4d38-9e51-1d6a0f4f8a11/cap", payload: { capNaira: 5000 } })).statusCode).toBe(401);
  });

  it("still refuses a call with no key, in the usual error shape", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/translate", payload: { source: "en", target: "yo", text: "hi" } });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe("missing_api_key");
  });
});
