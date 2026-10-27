import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { buildApp } from "../src/app";
import { DEMO_MAX_CHARS } from "../src/routes/translate.route";

/** What visitors can and cannot do once billing is switched on. No provider is ever called: outbound fetch is blocked. */
describe("billing switched on: visitors who are not signed in", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const saved = { enforced: process.env.BILLING_ENFORCED, fetch: globalThis.fetch };
  const blocked: string[] = [];

  beforeAll(async () => { app = await buildApp({ logger: false }); await app.ready(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    process.env.BILLING_ENFORCED = "1";
    blocked.length = 0;
    globalThis.fetch = (async (url: unknown) => { blocked.push(String(url)); throw new Error("network is blocked in this test"); }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = saved.fetch;
    if (saved.enforced === undefined) delete process.env.BILLING_ENFORCED; else process.env.BILLING_ENFORCED = saved.enforced;
  });

  const translate = (text: string, ip: string) =>
    app.inject({ method: "POST", url: "/api/translate", remoteAddress: ip, payload: { text, source: "en", target: "fr" } });

  it("can still use the short home page demo", async () => {
    const r = await translate("Good morning class", "10.20.0.1");
    expect(r.statusCode).toBe(200);
  });

  it("must sign in for anything longer than the demo", async () => {
    const r = await translate("a ".repeat(DEMO_MAX_CHARS), "10.20.0.2");
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe("SIGN_IN_REQUIRED");
  });

  it("only get a few demo translations an hour from one address", async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await translate(`Hello ${i}`, "10.20.0.3")).statusCode;
    expect(last).toBe(429);
    const r = await translate("Hello again", "10.20.0.3");
    expect(r.json().code).toBe("DEMO_LIMIT");
    expect((await translate("Hello from elsewhere", "10.20.0.4")).statusCode).toBe(200); // someone else is unaffected
  }, 90_000);

  it("get no spoken voice without signing in", async () => {
    const r = await app.inject({ method: "POST", url: "/api/speech", remoteAddress: "10.20.0.5", payload: { text: "Barka da safiya", language: "ha" } });
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe("SIGN_IN_REQUIRED");
    expect(blocked.length).toBe(0); // and no provider was called
  });

  it("are not held back at all while billing is off", async () => {
    delete process.env.BILLING_ENFORCED;
    const r = await translate("a ".repeat(DEMO_MAX_CHARS), "10.20.0.6");
    expect(r.statusCode).toBe(200);
  });
});
