import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  azureSupports,
  translate,
  translateWithAzure,
  translationProviderConfigured,
} from "@/services/translation.service";

const KEYS = [
  "AZURE_TRANSLATOR_KEY",
  "AZURE_TRANSLATOR_REGION",
  "AZURE_TRANSLATOR_ENDPOINT",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "TRANSLATE_URL",
  "USEM_TRANSLATION_URL",
  "SPITCH_API_KEY",
] as const;

describe("Azure Translator engine", () => {
  const saved: Record<string, string | undefined> = {};
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.AZURE_TRANSLATOR_KEY = "test-key-not-real";
    process.env.AZURE_TRANSLATOR_REGION = "eastus";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it("sends the documented request and reads the documented response", async () => {
    let url = "";
    let init: RequestInit | undefined;
    globalThis.fetch = (async (input: unknown, i?: RequestInit) => {
      url = String(input);
      init = i;
      return Response.json([{ translations: [{ text: "Ẹ káàárọ̀", to: "yo" }] }]);
    }) as typeof fetch;

    const r = await translateWithAzure("Good morning", "en", "yo");

    expect(url).toBe("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=yo");
    const headers = init!.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("test-key-not-real");
    expect(headers["Ocp-Apim-Subscription-Region"]).toBe("eastus");
    expect(JSON.parse(String(init!.body))).toEqual([{ Text: "Good morning" }]);
    expect(r).toEqual({ text: "Ẹ káàárọ̀", translated: true, engine: "azure" });
  });

  it("honours a custom endpoint", async () => {
    process.env.AZURE_TRANSLATOR_ENDPOINT = "https://example.test/";
    let url = "";
    globalThis.fetch = (async (input: unknown) => {
      url = String(input);
      return Response.json([{ translations: [{ text: "x" }] }]);
    }) as typeof fetch;
    await translateWithAzure("hi", "en", "fr");
    expect(url.startsWith("https://example.test/translate?")).toBe(true);
  });

  it("covers the Nigerian languages but not Ibibio, and never calls Azure for Ibibio", async () => {
    for (const code of ["en", "fr", "es", "yo", "ha", "ig"]) expect(azureSupports(code)).toBe(true);
    expect(azureSupports("ibb")).toBe(false);

    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json([]); }) as typeof fetch;
    expect(await translateWithAzure("hi", "en", "ibb")).toBeNull();
    expect(calls).toBe(0);
  });

  it("returns null, not an error, when Azure fails", async () => {
    globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
    expect(await translateWithAzure("hi", "en", "ha")).toBeNull();
    globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
    expect(await translateWithAzure("hi", "en", "ha")).toBeNull();
    globalThis.fetch = (async () => Response.json([{ translations: [] }])) as typeof fetch;
    expect(await translateWithAzure("hi", "en", "ha")).toBeNull();
  });

  it("does nothing without a key", async () => {
    delete process.env.AZURE_TRANSLATOR_KEY;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json([]); }) as typeof fetch;
    expect(await translateWithAzure("hi", "en", "ig")).toBeNull();
    expect(calls).toBe(0);
  });

  it("is used by translate() and reported as configured", async () => {
    globalThis.fetch = (async () => Response.json([{ translations: [{ text: "Bonjour azure-test" }] }])) as typeof fetch;
    const r = await translate("Hello azure-test", "en", "fr", []);
    expect(r).toEqual({ text: "Bonjour azure-test", translated: true, engine: "azure" });

    expect(translationProviderConfigured()).toBe(true);
    expect(translationProviderConfigured("en", "yo")).toBe(true);
    expect(translationProviderConfigured("ha", "ig")).toBe(true);
  });

  it("reports unconfigured honestly when nothing is set", () => {
    delete process.env.AZURE_TRANSLATOR_KEY;
    expect(translationProviderConfigured()).toBe(false);
    expect(translationProviderConfigured("en", "yo")).toBe(false);
  });
});
