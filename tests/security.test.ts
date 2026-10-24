import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { buildApp } from "../src/app";
import { allowedOrigins, isAllowedOrigin, isPublicApiPath } from "../src/config/origins";

const WEBSITE = "https://voiceverse-app.vercel.app";
const API = "https://voiceverse-rose.vercel.app"; // the Android app sends the API's own address as its Origin
const EVIL = "https://evil.example.com";

describe("trusted origins", () => {
  const saved = { extra: process.env.ALLOWED_ORIGINS, env: process.env.NODE_ENV };
  afterEach(() => {
    if (saved.extra === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = saved.extra;
    if (saved.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.env;
  });

  it("trusts the website and the API's own address, and nothing else", () => {
    expect(isAllowedOrigin(WEBSITE)).toBe(true);
    expect(isAllowedOrigin(API)).toBe(true);
    for (const o of [EVIL, "http://voiceverse-app.vercel.app", "https://voiceverse-app.vercel.app.evil.com", "https://sub.voiceverse-app.vercel.app", "null", "", null, undefined]) {
      expect(isAllowedOrigin(o as string)).toBe(false);
    }
  });

  it("ignores case and a trailing slash", () => {
    expect(isAllowedOrigin("HTTPS://VoiceVerse-App.vercel.app/")).toBe(true);
  });

  it("can be extended with ALLOWED_ORIGINS (a custom domain)", () => {
    process.env.ALLOWED_ORIGINS = "https://voiceverse.example.com/, https://staging.example.com";
    expect(isAllowedOrigin("https://voiceverse.example.com")).toBe(true);
    expect(isAllowedOrigin("https://staging.example.com")).toBe(true);
    expect(isAllowedOrigin(EVIL)).toBe(false);
  });

  it("allows local development origins only outside production", () => {
    process.env.NODE_ENV = "production";
    expect(allowedOrigins().some((o) => o.includes("localhost"))).toBe(false);
    process.env.NODE_ENV = "development";
    expect(allowedOrigins()).toContain("http://localhost:5173");
  });

  it("treats only /v1 as the public key-based API", () => {
    expect(isPublicApiPath("/v1/translate")).toBe(true);
    expect(isPublicApiPath("/v1")).toBe(true);
    expect(isPublicApiPath("/v1?x=1")).toBe(true);
    for (const p of ["/api/keys", "/api/auth/sign-in/email", "/v10/x", "/v1x", "/api/v1/x"]) expect(isPublicApiPath(p)).toBe(false);
  });
});

describe("what the running API does", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  const preflight = (url: string, origin: string) =>
    app.inject({ method: "OPTIONS", url, headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });

  it("lets our website make cookie requests", async () => {
    const res = await preflight("/api/auth/sign-in/email", WEBSITE);
    expect(res.headers["access-control-allow-origin"]).toBe(WEBSITE);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not let other websites make cookie requests", async () => {
    for (const url of ["/api/auth/sign-in/email", "/api/live/sessions/mine", "/api/keys", "/api/payments/checkout"]) {
      const res = await preflight(url, EVIL);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("lets any website call the public /v1 API, but never with cookies", async () => {
    const res = await preflight("/v1/translate", EVIL);
    expect(res.headers["access-control-allow-origin"]).toBe(EVIL);
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("tells the login system to trust only our sites", async () => {
    // The login library skips its own origin check when NODE_ENV is "test" (this runner), so enforcement is
    // proven against the deployed API instead; here we check what it is configured to trust.
    const { auth } = await import("../src/lib/auth");
    const ctx = await auth.$context;
    const configured = ctx.options.trustedOrigins;
    const list = typeof configured === "function" ? await configured() : configured;
    expect(list).toContain(WEBSITE);
    expect(list).toContain(API);
    expect(list).not.toContain(EVIL);
    expect(list).not.toContain("*");
  });

  it("lets the website and the app reach the login endpoint", async () => {
    const attempt = (origin: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: { "content-type": "application/json", origin, cookie: "better-auth.session_token=not-a-real-session" },
        payload: { email: "nobody-security-test@example.test", password: "not-a-real-password-1" },
      });
    // Past the origin check, failing only because the account does not exist
    expect((await attempt(WEBSITE)).statusCode).toBe(401);
    expect((await attempt(API)).statusCode).toBe(401);
  });

  describe("refusing changes that come from other websites", () => {
    const post = (url: string, origin?: string, payload: unknown = {}) =>
      app.inject({ method: "POST", url, headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, payload: payload as object });

    it("refuses state-changing requests from an untrusted origin, whether or not a cookie is sent", async () => {
      for (const url of ["/api/keys", "/api/payments/checkout", "/api/live/sessions", "/api/translate", "/api/speech", "/api/contact", "/api/auth/sign-in/email"]) {
        const res = await post(url, EVIL);
        expect(res.statusCode).toBe(403);
        expect(res.json().code).toBe("ORIGIN_NOT_ALLOWED");
      }
      expect((await post("/api/keys", "null")).statusCode).toBe(403); // sandboxed pages send "null"
    });

    it("lets our website and the app through the guard", async () => {
      for (const origin of [WEBSITE, API]) {
        const res = await post("/api/keys", origin);
        expect(res.statusCode).not.toBe(403); // reaches the route, which then wants a login (401)
        expect(res.statusCode).toBe(401);
      }
    });

    it("does not touch server-to-server calls, which send no Origin", async () => {
      expect((await post("/api/keys")).statusCode).toBe(401);
    });

    it("never blocks reads, the bearer-key API, or Paystack's signed webhook", async () => {
      const get = await app.inject({ method: "GET", url: "/api/languages", headers: { origin: EVIL } });
      expect(get.statusCode).toBe(200);
      const v1 = await post("/v1/translate", EVIL, { source: "en", target: "fr", text: "hi" });
      expect(v1.statusCode).toBe(401); // asks for a key, not blocked for its origin
      const hook = await post("/api/payments/webhook", EVIL, {});
      expect(hook.statusCode).toBe(401); // bad signature, not blocked for its origin
    });
  });

  it("adds safe headers, and never caches accounts, keys or payments", async () => {
    const res = await app.inject({ method: "GET", url: "/api/payments/plans" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toBe("no-store");
    const keys = await app.inject({ method: "GET", url: "/api/keys" });
    expect(keys.headers["cache-control"]).toBe("no-store");
    const langs = await app.inject({ method: "GET", url: "/api/languages" });
    expect(langs.headers["x-content-type-options"]).toBe("nosniff");
  });
});
