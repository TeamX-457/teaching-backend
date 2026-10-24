import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { resetSpitch } from "@/services/spitch.service";
import {
  SpeechUnavailable,
  SpeechUnsupported,
  buildSsml,
  speechConfigured,
  synthesize,
} from "@/services/speech.service";

describe("speech SSML", () => {
  it("uses the Nigerian voice and phonetic markup for Yoruba, Hausa and Igbo", () => {
    for (const lang of ["yo", "ha", "ig"]) {
      const ssml = buildSsml("Barka da safiya", lang, "female", 1);
      expect(ssml).toContain("name='en-NG-EzinneNeural'");
      expect(ssml).toContain('<phoneme alphabet="ipa"');
    }
    expect(buildSsml("Barka", "ha", "male", 1)).toContain("en-NG-AbeoNeural");
  });

  it("reads French and Spanish with their own voices and no phonetic markup", () => {
    expect(buildSsml("Bonjour", "fr", "female", 1)).toContain("fr-FR-DeniseNeural");
    expect(buildSsml("Hola", "es", "male", 1)).toContain("es-ES-AlvaroNeural");
    expect(buildSsml("Bonjour", "fr", "female", 1)).not.toContain("phoneme");
  });

  it("can build the plain version used as a fallback", () => {
    expect(buildSsml("Barka da safiya", "ha", "female", 1, false)).not.toContain("phoneme");
  });

  it("turns the speed setting into a prosody rate, clamped to a sensible range", () => {
    expect(buildSsml("a", "en", "female", 1.5)).toContain("rate='+50%'");
    expect(buildSsml("a", "en", "female", 0.8)).toContain("rate='-20%'");
    expect(buildSsml("a", "en", "female", 9)).toContain("rate='+100%'");
  });

  it("escapes text so it cannot break the markup", () => {
    const ssml = buildSsml("<break/> & more", "en", "female", 1);
    expect(ssml).toContain("&lt;break/&gt; &amp; more");
  });

  it("rejects a language with no voice", () => {
    expect(() => buildSsml("x", "ibb", "female", 1)).toThrow(SpeechUnsupported);
  });
});

describe("synthesize", () => {
  const realFetch = globalThis.fetch;
  const saved = { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION, spitch: process.env.SPITCH_API_KEY };
  beforeEach(() => {
    process.env.AZURE_SPEECH_KEY = "test-key-not-real";
    process.env.AZURE_SPEECH_REGION = "eastus";
    delete process.env.SPITCH_API_KEY; // these tests are about the Azure path; never touch the real Spitch account
    resetSpitch();
  });
  afterEach(() => {
    if (saved.spitch === undefined) delete process.env.SPITCH_API_KEY; else process.env.SPITCH_API_KEY = saved.spitch;
    globalThis.fetch = realFetch;
    if (saved.key === undefined) delete process.env.AZURE_SPEECH_KEY; else process.env.AZURE_SPEECH_KEY = saved.key;
    if (saved.region === undefined) delete process.env.AZURE_SPEECH_REGION; else process.env.AZURE_SPEECH_REGION = saved.region;
  });

  it("posts the SSML to the regional endpoint with the key and returns the audio", async () => {
    let url = ""; let init: RequestInit | undefined;
    globalThis.fetch = (async (u: unknown, i?: RequestInit) => {
      url = String(u); init = i;
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }) as typeof fetch;
    const audio = await synthesize("Barka da safiya, speech-test-1", "ha");
    expect([...audio]).toEqual([1, 2, 3, 4]);
    expect(url).toBe("https://eastus.tts.speech.microsoft.com/cognitiveservices/v1");
    const h = init!.headers as Record<string, string>;
    expect(h["Ocp-Apim-Subscription-Key"]).toBe("test-key-not-real");
    expect(h["Content-Type"]).toBe("application/ssml+xml");
    expect(String(init!.body)).toContain("<phoneme");
  });

  it("falls back to plain text if Azure rejects the phonetic markup (HTTP 400)", async () => {
    const bodies: string[] = [];
    globalThis.fetch = (async (_u: unknown, i?: RequestInit) => {
      bodies.push(String(i!.body));
      return bodies.length === 1 ? new Response("bad ssml", { status: 400 }) : new Response(new Uint8Array([9]), { status: 200 });
    }) as typeof fetch;
    const audio = await synthesize("Ẹ káàárọ̀ speech-test-2", "yo");
    expect([...audio]).toEqual([9]);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain("<phoneme");
    expect(bodies[1]).not.toContain("<phoneme");
  });

  it("keeps recent audio instead of paying twice for the same sentence", async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(new Uint8Array([7]), { status: 200 }); }) as typeof fetch;
    await synthesize("Same sentence speech-test-3", "ig");
    await synthesize("Same sentence speech-test-3", "ig");
    expect(calls).toBe(1);
  });

  it("fails clearly when not configured or when Azure is down", async () => {
    delete process.env.AZURE_SPEECH_KEY;
    expect(speechConfigured()).toBe(false);
    await expect(synthesize("hi speech-test-4", "ha")).rejects.toBeInstanceOf(SpeechUnavailable);

    process.env.AZURE_SPEECH_KEY = "test-key-not-real";
    globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
    await expect(synthesize("hi speech-test-5", "ha")).rejects.toBeInstanceOf(SpeechUnavailable);
    globalThis.fetch = (async () => { throw new Error("network"); }) as typeof fetch;
    await expect(synthesize("hi speech-test-6", "fr")).rejects.toBeInstanceOf(SpeechUnavailable);
  });

  it("refuses a language with no voice before calling Azure", async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(); }) as typeof fetch;
    await expect(synthesize("hi", "ibb")).rejects.toBeInstanceOf(SpeechUnsupported);
    expect(calls).toBe(0);
  });
});
