import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  clampSpeed,
  resetSpitch,
  speakWithSpitch,
  spitchAvailable,
  transcribeWithSpitch,
  translateWithSpitch,
} from "@/services/spitch.service";
import { speechConfigured, synthesize } from "@/services/speech.service";
import { translate, translationProviderConfigured } from "@/services/translation.service";

const KEYS = ["SPITCH_API_KEY", "SPITCH_MAX_CONCURRENT", "AZURE_TRANSLATOR_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "LLM_BASE_URL", "LLM_MODEL", "TRANSLATE_URL"] as const;

describe("Spitch engine", () => {
  const saved: Record<string, string | undefined> = {};
  const realFetch = globalThis.fetch;
  let calls: { url: string; init?: RequestInit | undefined }[] = [];

  /** Routes every request by URL so a test can never reach the real services. */
  const mock = (route: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
    calls = [];
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return route(url, init);
    }) as typeof fetch;
  };
  const spitchCalls = () => calls.filter((c) => c.url.startsWith("https://api.spitch.app"));
  const bodyOf = (c: { init?: RequestInit | undefined }) => JSON.parse(String(c.init!.body));

  beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.SPITCH_API_KEY = "sk_test_not_real";
    resetSpitch();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    resetSpitch();
  });

  describe("speech", () => {
    it("asks for MP3 with the right native voice for each language and gender", async () => {
      mock(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      const want: [string, "female" | "male", string][] = [
        ["yo", "female", "sade"], ["yo", "male", "segun"],
        ["ha", "female", "amina"], ["ha", "male", "hasan"],
        ["ig", "female", "ngozi"], ["ig", "male", "obinna"],
      ];
      for (const [lang, gender, voice] of want) {
        const audio = await speakWithSpitch("Sannu", lang, gender, 1);
        expect([...audio!]).toEqual([1, 2, 3]);
        const c = spitchCalls().at(-1)!;
        expect(c.url).toBe("https://api.spitch.app/v1/speech");
        expect((c.init!.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_not_real");
        expect(bodyOf(c)).toMatchObject({ text: "Sannu", language: lang, voice, format: "mp3", speed: 1 });
      }
    });

    it("keeps speed inside the range Spitch accepts", () => {
      expect(clampSpeed(0.5)).toBe(0.7);
      expect(clampSpeed(1)).toBe(1);
      expect(clampSpeed(2)).toBe(1.2);
    });

    it("has no native voice for other languages", async () => {
      mock(() => new Response(new Uint8Array([1]), { status: 200 }));
      expect(await speakWithSpitch("hi", "fr", "female", 1)).toBeNull();
      expect(spitchCalls()).toHaveLength(0);
    });
  });

  describe("translation", () => {
    it("sends text, source and target and reads the translated text", async () => {
      mock(() => Response.json({ request_id: "x", text: "Biko nọdụ ala" }));
      const r = await translateWithSpitch("Please sit down.", "en", "ig");
      expect(r).toEqual({ text: "Biko nọdụ ala", translated: true, engine: "spitch" });
      expect(spitchCalls()[0]!.url).toBe("https://api.spitch.app/v1/translate");
      expect(bodyOf(spitchCalls()[0]!)).toEqual({ text: "Please sit down.", source: "en", target: "ig" });
    });

    it("only handles English, Yoruba, Hausa and Igbo, and never the same language", async () => {
      mock(() => Response.json({ text: "x" }));
      expect(await translateWithSpitch("hi", "en", "fr")).toBeNull();
      expect(await translateWithSpitch("hi", "es", "ig")).toBeNull();
      expect(await translateWithSpitch("hi", "yo", "yo")).toBeNull();
      expect(spitchCalls()).toHaveLength(0);
    });
  });

  describe("protecting the account", () => {
    it("stops asking after 'payment required' instead of failing every sentence", async () => {
      mock(() => new Response("no credit", { status: 402 }));
      expect(spitchAvailable()).toBe(true);
      expect(await translateWithSpitch("hi", "en", "ha")).toBeNull();
      expect(spitchAvailable()).toBe(false);
      await translateWithSpitch("again", "en", "ha");
      await speakWithSpitch("again", "ha", "female", 1);
      expect(spitchCalls()).toHaveLength(1); // the later calls never left the server
      resetSpitch();
      expect(spitchAvailable()).toBe(true);
    });

    it("also pauses on a rejected key and when rate limited, but not on a one-off server error", async () => {
      for (const [status, pauses] of [[401, true], [429, true], [500, false]] as const) {
        resetSpitch();
        mock(() => new Response("x", { status }));
        await translateWithSpitch("hi", "en", "yo");
        expect(spitchAvailable()).toBe(!pauses);
      }
    });

    it("never runs more calls at once than the account allows (3 by default)", async () => {
      let inFlight = 0;
      let peak = 0;
      mock(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return Response.json({ text: "ok" });
      });
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => translateWithSpitch(`s${i}`, "en", "ig")));
      expect(results.every((r) => r?.text === "ok")).toBe(true);
      expect(peak).toBe(3);
    });

    it("does nothing without a key", async () => {
      delete process.env.SPITCH_API_KEY;
      mock(() => Response.json({ text: "x" }));
      expect(spitchAvailable()).toBe(false);
      expect(await translateWithSpitch("hi", "en", "ig")).toBeNull();
      expect(calls).toHaveLength(0);
    });
  });

  describe("as the first choice, with Azure behind it", () => {
    const azureTranslate = (url: string) =>
      url.includes("microsofttranslator") ? Response.json([{ translations: [{ text: "AZURE-TEXT" }] }]) : null;

    it("translation: Spitch first for Igbo, Azure for French and when Spitch fails", async () => {
      process.env.AZURE_TRANSLATOR_KEY = "azure-test-key";
      mock((url) => azureTranslate(url) ?? Response.json({ text: "SPITCH-TEXT" }));
      expect((await translate("Please sit down spitch-1", "en", "ig", [])).engine).toBe("spitch");
      expect((await translate("Please sit down spitch-2", "en", "fr", [])).engine).toBe("azure");

      mock((url) => azureTranslate(url) ?? new Response("down", { status: 500 }));
      const fallback = await translate("Please sit down spitch-3", "en", "ig", []);
      expect(fallback).toEqual({ text: "AZURE-TEXT", translated: true, engine: "azure" });
    });

    it("is reported as configured for Nigerian-language pairs", () => {
      expect(translationProviderConfigured()).toBe(true);
      expect(translationProviderConfigured("en", "ig")).toBe(true);
      expect(translationProviderConfigured("ha", "yo")).toBe(true);
      expect(translationProviderConfigured("en", "fr")).toBe(false); // only Spitch is set, and it does not do French
    });

    it("speech works with only Spitch set up", () => {
      expect(speechConfigured()).toBe(true);
    });

    it("speech: native Spitch voice first, and the audio is kept for next time", async () => {
      mock(() => new Response(new Uint8Array([7, 7]), { status: 200 }));
      const a = await synthesize("Barka da safiya spitch-s1", "ha");
      const b = await synthesize("Barka da safiya spitch-s1", "ha");
      expect([...a]).toEqual([7, 7]);
      expect([...b]).toEqual([7, 7]);
      expect(spitchCalls()).toHaveLength(1);
    });

    it("speech: falls back to the Azure phonetic voice when Spitch cannot answer, and does not keep that audio", async () => {
      process.env.AZURE_SPEECH_KEY = "azure-test-key";
      process.env.AZURE_SPEECH_REGION = "eastus";
      const azureBodies: string[] = [];
      mock((url, init) => {
        if (url.startsWith("https://api.spitch.app")) return new Response("no credit", { status: 402 });
        azureBodies.push(String(init!.body));
        return new Response(new Uint8Array([9, 9]), { status: 200 });
      });
      const first = await synthesize("Ụtụtụ ọma spitch-s2", "ig");
      expect([...first]).toEqual([9, 9]);
      expect(azureBodies).toHaveLength(1);
      expect(azureBodies[0]).toContain("<phoneme"); // pronounced from the phonetic rules

      resetSpitch(); // credit topped up
      mock((url) => (url.startsWith("https://api.spitch.app") ? new Response(new Uint8Array([5]), { status: 200 }) : new Response("no", { status: 500 })));
      const second = await synthesize("Ụtụtụ ọma spitch-s2", "ig");
      expect([...second]).toEqual([5]); // the Azure fallback was not cached, so the native voice is used
    });

    it("speech: French still uses Azure and never calls Spitch", async () => {
      process.env.AZURE_SPEECH_KEY = "azure-test-key";
      process.env.AZURE_SPEECH_REGION = "eastus";
      mock(() => new Response(new Uint8Array([3]), { status: 200 }));
      await synthesize("Bonjour spitch-s3", "fr");
      expect(spitchCalls()).toHaveLength(0);
    });
  });

  it("transcribes audio as Yoruba, Hausa, Igbo or English, and says null when it cannot", async () => {
    mock(() => new Response(JSON.stringify({ text: " báwo ni " }), { status: 200 }));
    expect(await transcribeWithSpitch(Buffer.from("x".repeat(600)), "audio/wav", "yo")).toBe("báwo ni");
    const call = spitchCalls().at(-1)!;
    expect(call.url).toBe("https://api.spitch.app/v1/transcriptions");
    expect((call.init!.body as FormData).get("language")).toBe("yo");
    expect(await transcribeWithSpitch(Buffer.from("x".repeat(600)), "audio/wav", "fr")).toBeNull(); // not a Spitch language
    mock(() => new Response("no", { status: 402 }));
    expect(await transcribeWithSpitch(Buffer.from("x".repeat(600)), "audio/wav", "ha")).toBeNull();
    expect(spitchAvailable()).toBe(false); // out of credit: paused instead of retried every time
  });
});
