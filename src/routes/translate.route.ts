import { LANGUAGES, checkTranslationPair, getLanguage } from "@/config/languages";
import { audioSeconds, billingEnforced, meter, paidFeaturesOn, soloCharge, type Clock } from "@/services/billing.service";
import { auth } from "@/lib/auth";
import { fromNodeHeaders } from "better-auth/node";
import { liveService } from "@/services/live.service";
import { spitchAvailable } from "@/services/spitch.service";
import { normalizeJoinCode } from "@/utils/join-code";
import {
  translate,
  translationProviderConfigured,
} from "@/services/translation.service";
import { speechConfigured } from "@/services/speech.service";
import { createRateLimiter } from "@/utils/rate-limit";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
  source: z.string().trim().toLowerCase().min(2).max(8),
  target: z.string().trim().toLowerCase().min(2).max(8),
  // The live session this is for. Once billing is on, translating needs a session whose host has time left.
  session: z.string().trim().min(3).max(12).optional(),
});

// Public endpoint that may call a paid provider: cap it per client.
const allow = createRateLimiter(60, 60_000);
// Visitors who are not signed in may try the home page demo: short sentences only, a few an hour.
export const DEMO_MAX_CHARS = 200;
const allowDemo = createRateLimiter(30, 60 * 60_000);

// Prefix: /api
async function translateRoutes(app: FastifyInstance) {
  app.get("/languages", async () => ({
    // Cloud voices only count as supported while the server can actually make them.
    languages: LANGUAGES.map((l) =>
      l.textToSpeech.cloud ? { ...l, textToSpeech: { ...l.textToSpeech, supported: speechConfigured() } } : l,
    ),
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
    const { text, source, target, session: sessionCode } = parsed.data;
    const pair = checkTranslationPair(source, target);
    if (!pair.ok) return res.code(422).send({ error: pair.message, code: pair.code });

    const row = sessionCode ? await liveService.getByCode(normalizeJoinCode(sessionCode)) : undefined;
    if (row && (billingEnforced() || row.tier !== "free")) {
      const clock: Clock = { ...row };
      await meter(row.hostId, clock, liveService.clockStore(row.id), { localUp: spitchAvailable() });
      if (!paidFeaturesOn(clock)) {
        return res.code(402).send({ error: "The host's time has run out, so translation has stopped.", code: "OUT_OF_TIME" });
      }
    } else if (!row && billingEnforced()) {
      // Translating for yourself, with no live session: it comes out of your own time.
      const me = (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user;
      if (!me) {
        // Not signed in: only the short home page demo, and only a few an hour.
        if (text.length > DEMO_MAX_CHARS) return res.code(401).send({ error: "Sign in to translate longer text.", code: "SIGN_IN_REQUIRED" });
        if (!allowDemo(req.ip)) return res.code(429).send({ error: "That is the demo limit for now. Create a free account to keep going.", code: "DEMO_LIMIT" });
      } else if (!(await soloCharge(me.id, audioSeconds(text), ["captions"]))) {
        return res.code(402).send({ error: "You have no translation time left. Buy hours to carry on.", code: "OUT_OF_TIME" });
      }
    }

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
