import { LANGUAGES, checkTranslationPair, getLanguage } from "@/config/languages";
import { liveService } from "@/services/live.service";
import {
  translate,
  translationProviderConfigured,
} from "@/services/translation.service";
import { createRateLimiter } from "@/utils/rate-limit";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
  source: z.string().trim().toLowerCase().min(2).max(8),
  target: z.string().trim().toLowerCase().min(2).max(8),
});

// Public endpoint that may call a paid provider: cap it per client.
const allow = createRateLimiter(60, 60_000);

// Prefix: /api
async function translateRoutes(app: FastifyInstance) {
  app.get("/languages", async () => ({
    languages: LANGUAGES,
    translationProviderConfigured: translationProviderConfigured(),
  }));

  app.post("/translate", async (req, res) => {
    if (!allow(req.ip)) {
      return res.code(429).send({ error: "Too many requests. Slow down.", code: "RATE_LIMITED" });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.code(400).send({ error: "Invalid request", issues: parsed.error.issues });
    }
    const { text, source, target } = parsed.data;
    const pair = checkTranslationPair(source, target);
    if (!pair.ok) return res.code(422).send({ error: pair.message, code: pair.code });

    // The glossary is an enhancement: translation still works if the DB is unreachable.
    const glossary = await liveService.getGlossary(source, target).catch(() => []);
    const result = await translate(text, source, target, glossary, {
      source: getLanguage(source)!.name,
      target: getLanguage(target)!.name,
    });
    return {
      text: result.text,
      translated: result.translated,
      engine: result.engine,
      reason: result.translated
        ? null
        : translationProviderConfigured(source, target)
          ? "provider_failed"
          : "no_provider",
    };
  });
}

export default translateRoutes;
