import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from "bun:test";
import { buildApp } from "../src/app";
import { apiKeysService, generateKey, hashKey, looksLikeKey } from "../src/services/apikeys.service";
import { liveService } from "../src/services/live.service";

describe("API keys", () => {
  it("generates a well-formed secret and a matching hash", () => {
    const { secret, prefix, hash } = generateKey();
    expect(looksLikeKey(secret)).toBe(true);
    expect(secret.startsWith("vv_")).toBe(true);
    expect(secret.startsWith(prefix)).toBe(true);
    expect(hash).toBe(hashKey(secret));
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(secret);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateKey().secret));
    expect(seen.size).toBe(200);
  });

  it("rejects things that are not keys", () => {
    for (const bad of ["", "vv_", "vv_short", "sk-abc", `vv_${"a".repeat(42)}`, `vv_${"a".repeat(44)}`, `xx_${"a".repeat(43)}`]) {
      expect(looksLikeKey(bad)).toBe(false);
    }
  });
});

describe("Public API /v1", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const key = generateKey().secret;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => {
    // restore any spies between tests
    (apiKeysService.verify as unknown as { mockRestore?: () => void }).mockRestore?.();
    (liveService.getGlossary as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  const post = (payload: unknown, headers: Record<string, string> = { authorization: `Bearer ${key}` }) =>
    app.inject({ method: "POST", url: "/v1/translate", payload: payload as object, headers });

  it("serves docs, spec and the agent brief without a key", async () => {
    const docs = await app.inject({ method: "GET", url: "/v1/docs", headers: { host: "api.example.test" } });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers["content-type"]).toContain("text/html");
    expect(docs.body).toContain("Voice Verse API");
    expect(docs.body).toContain("https://api.example.test/v1/translate");

    const spec = (await app.inject({ method: "GET", url: "/v1/openapi.json" })).json();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/v1/translate"].post.operationId).toBe("translate");

    const llms = await app.inject({ method: "GET", url: "/v1/llms.txt" });
    expect(llms.statusCode).toBe(200);
    expect(llms.body).toContain("Authorization: Bearer");
    expect(llms.body).toContain('"translated"');
  });

  it("escapes a hostile Host header in the docs page", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/docs", headers: { host: 'x"><script>alert(1)</script>' } });
    expect(res.body).not.toContain("<script>alert(1)");
  });

  it("lists languages publicly", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/languages" });
    expect(res.statusCode).toBe(200);
    const codes = res.json().data.map((l: { code: string }) => l.code);
    expect(codes).toEqual(expect.arrayContaining(["en", "fr", "ibb"]));
  });

  it("requires a key", async () => {
    const res = await post({ source: "en", target: "fr", text: "hi" }, {});
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("missing_api_key");
  });

  it("rejects an unknown key without touching the database", async () => {
    const res = await post({ source: "en", target: "fr", text: "hi" }, { authorization: "Bearer nonsense" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("invalid_api_key");
  });

  describe("with a valid key", () => {
    const useKey = () => {
      spyOn(apiKeysService, "verify").mockResolvedValue({ id: "k1", userId: "u1" });
      spyOn(liveService, "getGlossary").mockResolvedValue([]);
    };

    it("needs exactly one of text or texts", async () => {
      useKey();
      const none = await post({ source: "en", target: "fr" });
      expect(none.statusCode).toBe(400);
      const both = await post({ source: "en", target: "fr", text: "a", texts: ["b"] });
      expect(both.statusCode).toBe(400);
      expect(both.json().error.code).toBe("invalid_request");
    });

    it("limits batch size and text length", async () => {
      useKey();
      const many = await post({ source: "en", target: "fr", texts: Array.from({ length: 26 }, () => "hi") });
      expect(many.statusCode).toBe(400);
      const long = await post({ source: "en", target: "fr", text: "x".repeat(2001) });
      expect(long.statusCode).toBe(400);
    });

    it("rejects unsupported and identical languages with 422", async () => {
      useKey();
      const same = await post({ source: "en", target: "en", text: "hi" });
      expect(same.statusCode).toBe(422);
      expect(same.json().error.code).toBe("same_language");
      const unknown = await post({ source: "en", target: "zz", text: "hi" });
      expect(unknown.statusCode).toBe(422);
      expect(unknown.json().error.code).toBe("unsupported_language");
    });

    it("also accepts the key in x-api-key", async () => {
      useKey();
      const res = await post({ source: "en", target: "en", text: "hi" }, { "x-api-key": key });
      expect(res.statusCode).toBe(422); // got past authentication
    });
  });

  describe("speech endpoints", () => {
    const useKey = () => spyOn(apiKeysService, "verify").mockResolvedValue({ id: "k1", userId: "u1" });

    it("/v1/speech needs a key", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/speech", payload: { text: "hi", language: "ha" } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("missing_api_key");
    });

    it("/v1/speech validates the request and refuses languages without a voice", async () => {
      useKey();
      const auth = { authorization: `Bearer ${key}` };
      const empty = await app.inject({ method: "POST", url: "/v1/speech", headers: auth, payload: { language: "ha" } });
      expect(empty.statusCode).toBe(400);
      const tooLong = await app.inject({ method: "POST", url: "/v1/speech", headers: auth, payload: { text: "x".repeat(1001), language: "ha" } });
      expect(tooLong.statusCode).toBe(400);
      const ibibio = await app.inject({ method: "POST", url: "/v1/speech", headers: auth, payload: { text: "hi", language: "ibb" } });
      expect(ibibio.statusCode).toBe(422);
      expect(ibibio.json().error.code).toBe("no_voice");
    });

    it("/api/speech (public) validates and refuses languages without a voice", async () => {
      const bad = await app.inject({ method: "POST", url: "/api/speech", payload: { text: "", language: "ha" } });
      expect(bad.statusCode).toBe(400);
      const ibibio = await app.inject({ method: "POST", url: "/api/speech", payload: { text: "hi", language: "ibb" } });
      expect(ibibio.statusCode).toBe(422);
      expect(ibibio.json().code).toBe("NO_VOICE");
    });

    it("the language list marks Hausa, Yoruba and Igbo as cloud-spoken, and Ibibio as not spoken", async () => {
      const langs = (await app.inject({ method: "GET", url: "/api/languages" })).json().languages as {
        code: string; textToSpeech: { supported: boolean; cloud?: boolean };
      }[];
      const by = Object.fromEntries(langs.map((l) => [l.code, l.textToSpeech]));
      for (const code of ["ha", "yo", "ig"]) expect(by[code]!.cloud).toBe(true);
      expect(by["ibb"]!.supported).toBe(false);
      expect(by["en"]!.cloud).toBeUndefined();
    });
  });

  it("answers unknown /v1 paths in the same error shape", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });

  it("transcribes raw audio sent as the body, and refuses what it cannot handle", async () => {
    spyOn(apiKeysService, "verify").mockResolvedValue({ ok: true } as never);
    const realFetch = globalThis.fetch;
    process.env.SPITCH_API_KEY = "sk_test_not_real";
    globalThis.fetch = (async () => new Response(JSON.stringify({ text: "sannu" }), { status: 200 })) as typeof fetch;
    try {
      const wav = Buffer.alloc(2000, 1);
      const ok = await app.inject({ method: "POST", url: "/v1/transcribe?language=ha", payload: wav, headers: { authorization: `Bearer ${key}`, "content-type": "audio/wav" } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().text).toBe("sannu");
      const wrongLang = await app.inject({ method: "POST", url: "/v1/transcribe?language=fr", payload: wav, headers: { authorization: `Bearer ${key}`, "content-type": "audio/wav" } });
      expect(wrongLang.statusCode).toBe(422);
      const tooSmall = await app.inject({ method: "POST", url: "/v1/transcribe?language=yo", payload: Buffer.alloc(10), headers: { authorization: `Bearer ${key}`, "content-type": "audio/wav" } });
      expect(tooSmall.statusCode).toBe(400);
      const noKey = await app.inject({ method: "POST", url: "/v1/transcribe?language=yo", payload: wav, headers: { "content-type": "audio/wav" } });
      expect(noKey.statusCode).toBe(401);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.SPITCH_API_KEY;
    }
  });
});
