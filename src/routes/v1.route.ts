import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { LANGUAGES, checkTranslationPair, getLanguage } from "@/config/languages";
import { MAX_CHARS, MAX_TEXTS, docsHtml, llmsText, openApiSpec } from "@/docs/apiDocs";
import { apiError, requireApiKey } from "@/plugins/apikey";
import { speechHandler } from "@/routes/speech.route";
import { speechConfigured, speechLanguages } from "@/services/speech.service";
import { spitchAvailable, spitchConfigured, spitchSupports, transcribeWithSpitch } from "@/services/spitch.service";
import { liveService } from "@/services/live.service";
import { translate, translationProviderConfigured } from "@/services/translation.service";

const lang = z.string().trim().toLowerCase().min(2).max(8);
const text = z.string().trim().min(1).max(MAX_CHARS);

const bodySchema = z
  .object({
    source: lang,
    target: lang,
    text: text.optional(),
    texts: z.array(text).min(1).max(MAX_TEXTS).optional(),
  })
  .refine((b) => (b.text === undefined) !== (b.texts === undefined), {
    message: "Send exactly one of `text` or `texts`.",
  });

const baseUrlOf = (req: FastifyRequest) => {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
  const local = /^(localhost|127\.|10\.|192\.168\.)/.test(host);
  const proto = String(req.headers["x-forwarded-proto"] ?? (local ? "http" : "https")).split(",")[0];
  return `${proto}://${host}`;
};

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

// Prefix: /v1  — the public, key-authenticated developer API.
async function v1Routes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const base = baseUrlOf(req);
    return { name: "Voice Verse API", version: "1.0.0", docs: `${base}/v1/docs`, openapi: `${base}/v1/openapi.json`, llms: `${base}/v1/llms.txt` };
  });

  // Which engines are live (no secrets). "spitch: paused" means it is set up but skipped for now, e.g. out of credit.
  app.get("/health", async () => ({
    status: "ok",
    translation: translationProviderConfigured(),
    speech: speechConfigured(),
    engines: {
      spitch: !spitchConfigured() ? "off" : spitchAvailable() ? "on" : "paused",
      azure_translator: Boolean(process.env.AZURE_TRANSLATOR_KEY?.trim()) ? "on" : "off",
      azure_speech: Boolean(process.env.AZURE_SPEECH_KEY?.trim()) ? "on" : "off",
    },
  }));

  app.get("/docs", async (req, res) => res.type("text/html; charset=utf-8").send(docsHtml(baseUrlOf(req))));
  app.get("/openapi.json", async (req) => openApiSpec(baseUrlOf(req)));
  app.get("/llms.txt", async (req, res) => res.type("text/plain; charset=utf-8").send(llmsText(baseUrlOf(req))));

  app.get("/languages", async () => ({
    object: "list",
    data: LANGUAGES.map((l) => ({
      code: l.code,
      name: l.name,
      can_translate_into: l.translation,
      can_speak: speechConfigured() && speechLanguages.includes(l.code),
    })),
  }));

  // Speech to text. Send the audio itself as the request body (Content-Type audio/wav, audio/mpeg, audio/mp4 or audio/ogg,
  // up to 8 MB) with ?language=en|yo|ha|ig. Answers { text }.
  app.addContentTypeParser(/^audio\/.*$/, { parseAs: "buffer", bodyLimit: 8 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.post("/transcribe", { preHandler: requireApiKey }, async (req, res) => {
    const language = String((req.query as { language?: string }).language ?? "en").trim().toLowerCase();
    if (!spitchSupports(language)) {
      return res.code(422).send(apiError(`Speech recognition is available for en, yo, ha and ig (got "${language}").`, "invalid_request_error", "unsupported_language"));
    }
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length < 500) {
      return res.code(400).send(apiError("Send the audio as the request body, with a Content-Type such as audio/wav.", "invalid_request_error", "invalid_audio"));
    }
    const heard = await transcribeWithSpitch(audio, String(req.headers["content-type"] ?? ""), language);
    if (heard === null) {
      return res.code(503).send(apiError("Speech recognition is unavailable right now. Please try again.", "api_error", "unavailable"));
    }
    return { object: "transcription", language, text: heard };
  });

  // Spoken audio (MP3). Hausa, Yoruba and Igbo are pronounced from phonetic markup on a Nigerian voice.
  app.post("/speech", { preHandler: requireApiKey }, speechHandler(true));

  app.post("/translate", { preHandler: requireApiKey }, async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      return res.code(400).send(apiError(`${where}${first?.message ?? "Invalid request"}`, "invalid_request_error", "invalid_request"));
    }
    const { source, target } = parsed.data;
    const inputs = parsed.data.texts ?? [parsed.data.text!];

    const pair = checkTranslationPair(source, target);
    if (!pair.ok) {
      return res.code(422).send(apiError(pair.message, "invalid_request_error", pair.code.toLowerCase()));
    }

    // The glossary only improves results: translation still works if the database is unreachable.
    const glossary = await liveService.getGlossary(source, target).catch(() => []);
    const names = { source: getLanguage(source)!.name, target: getLanguage(target)!.name };
    const connected = translationProviderConfigured(source, target);

    const translations = await mapLimit(inputs, 4, async (input, index) => {
      const r = await translate(input, source, target, glossary, names);
      return {
        index,
        text: r.text,
        translated: r.translated,
        engine: r.engine,
        reason: r.translated ? null : connected ? "provider_failed" : "no_provider",
      };
    });

    const first = translations[0]!;
    return {
      id: `tr_${randomBytes(9).toString("hex")}`,
      object: "translation",
      source,
      target,
      translations,
      // Convenience for the single-text form.
      ...(parsed.data.text !== undefined ? { text: first.text, translated: first.translated, engine: first.engine, reason: first.reason } : {}),
      usage: { characters: inputs.reduce((n, s) => n + s.length, 0), items: inputs.length },
    };
  });

  // Anything else under /v1 gets the same error shape as the rest of the API.
  app.setNotFoundHandler((req, res) =>
    res.code(404).send(apiError(`No such endpoint: ${req.method} ${req.url.split("?")[0]}`, "invalid_request_error", "not_found")),
  );
}

export default v1Routes;
